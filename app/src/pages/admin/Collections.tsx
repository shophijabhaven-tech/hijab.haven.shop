import { useCallback, useEffect, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import ErrorBlock from '@/components/ErrorBlock'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useCollections } from '@/context/CollectionsContext'
import { useToast } from '@/context/ToastContext'
import {
  createCollection,
  deleteCollection,
  fetchCollections,
  fetchProducts,
  slugifyCollectionKey,
  swapCollectionOrder,
  updateCollection,
} from '@/lib/queries'
import type { Collection } from '@/lib/supabase'

const inputClasses =
  'w-full border border-blush rounded px-3.5 py-2.5 text-sm text-mocha bg-cream/50 outline-none focus:border-rose transition-colors'

const labelClasses = 'block text-xs tracking-[0.12em] uppercase text-warm mb-1.5'

const SMALL_BTN =
  'bg-transparent border border-sand text-warm px-3 py-1.5 text-[0.65rem] tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-sand/40 transition-colors disabled:opacity-40 disabled:cursor-default'

const DEFAULT_ICON = '🌸'

type FormState = {
  label: string
  /** Add mode only — auto-follows label until the admin edits it (keyTouched). */
  key: string
  keyTouched: boolean
  icon: string
  description: string
}

const EMPTY_FORM: FormState = {
  label: '',
  key: '',
  keyTouched: false,
  icon: DEFAULT_ICON,
  description: '',
}

// /admin/collections per §12.4: sort_order-driven table (icon · label · key ·
// description · product count), ↑/↓ reorder via swapCollectionOrder, add form
// with auto-slugged key (immutable after create — product soft references must
// never dangle), edit of label/icon/description only, and delete guarded
// client-side by product count + server-side by the COLLECTION_IN_USE trigger.
// After every mutation the customer-facing CollectionsContext is refreshed.
export default function Collections() {
  const { showToast } = useToast()
  const { refresh: refreshContext } = useCollections()

  const [rows, setRows] = useState<Collection[]>([])
  /** null = the products fetch failed → counts unknown ('—'), delete stays enabled (trigger enforces). */
  const [productCounts, setProductCounts] = useState<Record<string, number> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editing, setEditing] = useState<Collection | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [swappingId, setSwappingId] = useState<number | null>(null)

  // Lint-safe fetch pattern (Dashboard idiom): the effect only invokes load;
  // all setState happens in the async settle callbacks. The two fetches settle
  // independently — a failed products fetch only blanks the count column, it
  // never takes down the collections table.
  const load = useCallback(() => {
    void Promise.allSettled([fetchCollections(), fetchProducts()]).then(
      ([collectionsResult, productsResult]) => {
        if (collectionsResult.status === 'fulfilled') {
          setRows(collectionsResult.value)
          setListError(null)
        } else {
          setListError(
            collectionsResult.reason instanceof Error
              ? collectionsResult.reason.message
              : 'Failed to load collections'
          )
        }
        if (productsResult.status === 'fulfilled') {
          const counts: Record<string, number> = {}
          for (const product of productsResult.value) {
            counts[product.category] = (counts[product.category] ?? 0) + 1
          }
          setProductCounts(counts)
        } else {
          setProductCounts(null)
        }
        setIsLoading(false)
      }
    )
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function retry() {
    setIsLoading(true)
    setListError(null)
    load()
  }

  function countFor(key: string): number | null {
    if (productCounts === null) return null
    return productCounts[key] ?? 0
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditing(null)
  }

  function startEdit(collection: Collection) {
    setEditing(collection)
    setForm({
      label: collection.label,
      key: collection.key,
      keyTouched: true,
      icon: collection.icon,
      description: collection.description,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleLabelChange(value: string) {
    setForm(prev => ({
      ...prev,
      label: value,
      // §12.4 auto-slug: the key preview follows the label until the admin
      // edits the key directly (add mode only — key is immutable after create).
      key: !editing && !prev.keyTouched ? slugifyCollectionKey(value) : prev.key,
    }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return

    const label = form.label.trim()
    if (!label) {
      showToast('Please enter a collection name.', 'error')
      return
    }
    const icon = form.icon.trim() || DEFAULT_ICON
    const description = form.description.trim()

    setIsSaving(true)
    try {
      if (editing) {
        // §12.4: key is never editable after create.
        await updateCollection(editing.id, { label, icon, description })
        showToast('Collection updated.', 'success')
      } else {
        const key = slugifyCollectionKey(form.key || label)
        if (!key) {
          showToast('The key cannot be empty — use letters or numbers in the name.', 'error')
          return
        }
        // §12.4: uniqueness checked client-side against the loaded list
        // (the DB UNIQUE constraint backs it up).
        if (rows.some(row => row.key === key)) {
          showToast(`A collection with the key “${key}” already exists.`, 'error')
          return
        }
        const nextSort = rows.reduce((max, row) => Math.max(max, row.sort_order), 0) + 1
        await createCollection({ key, label, icon, description, sort_order: nextSort })
        showToast('Collection added.', 'success')
      }
      resetForm()
      load()
      // Customer surfaces (Home cards, Shop chips, product form) share the
      // context — refresh it so they pick the change up without a reload.
      void refreshContext()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save collection', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // §12.4 reorder: optimistic swap of the two sort_order values, then the two
  // UPDATEs; on error revert + toast. Refetch settles the canonical order.
  function move(index: number, direction: -1 | 1) {
    const a = rows[index]
    const b = rows[index + direction]
    if (!a || !b || swappingId !== null) return
    const previous = rows
    setSwappingId(a.id)
    setRows(current => {
      const next = [...current]
      next[index] = { ...b, sort_order: a.sort_order }
      next[index + direction] = { ...a, sort_order: b.sort_order }
      return next
    })
    void swapCollectionOrder(a, b).then(
      () => {
        setSwappingId(null)
        load()
        void refreshContext()
      },
      (error: unknown) => {
        setRows(previous)
        setSwappingId(null)
        showToast(
          error instanceof Error ? error.message : 'Failed to reorder collections',
          'error'
        )
      }
    )
  }

  async function confirmDelete() {
    if (!deleteTarget || isDeleting) return
    const target = deleteTarget
    setIsDeleting(true)
    try {
      await deleteCollection(target.id)
      if (editing?.id === target.id) resetForm()
      showToast('Collection deleted.', 'success')
      load()
      void refreshContext()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete collection'
      // The BEFORE DELETE trigger raises COLLECTION_IN_USE while any product
      // still references the key (§12.4) — surface the friendly instruction.
      showToast(
        message.includes('COLLECTION_IN_USE')
          ? 'Products still use this collection — move or delete them first.'
          : message,
        'error'
      )
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div>
      <h1 className="font-heading text-3xl text-mocha mb-6">Collections</h1>

      {/* ── Add / Edit panel (same shell as the Products page) ── */}
      <div className="bg-white rounded-lg p-5 md:p-6 mb-8">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-heading text-xl text-mocha">
            {editing ? `Edit “${editing.label}”` : 'Add collection'}
          </h2>
          {editing && (
            <button
              type="button"
              onClick={resetForm}
              className="bg-transparent border-none text-xs tracking-[0.12em] uppercase text-rose cursor-pointer hover:text-mocha transition-colors p-0"
            >
              Cancel edit
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label htmlFor="collection-label" className={labelClasses}>
                Name
              </label>
              <input
                id="collection-label"
                type="text"
                value={form.label}
                onChange={event => handleLabelChange(event.target.value)}
                className={inputClasses}
              />
            </div>
            <div>
              <label htmlFor="collection-key" className={labelClasses}>
                Key
              </label>
              {editing ? (
                <>
                  <input
                    id="collection-key"
                    type="text"
                    value={editing.key}
                    readOnly
                    disabled
                    className={`${inputClasses} opacity-60 cursor-not-allowed`}
                  />
                  <p className="text-xs text-warm mt-1.5">The key cannot be changed.</p>
                </>
              ) : (
                <>
                  <input
                    id="collection-key"
                    type="text"
                    value={form.key}
                    onChange={event =>
                      setForm(prev => ({ ...prev, key: event.target.value, keyTouched: true }))
                    }
                    onBlur={() =>
                      setForm(prev => ({ ...prev, key: slugifyCollectionKey(prev.key) }))
                    }
                    className={inputClasses}
                  />
                  <p className="text-xs text-warm mt-1.5">
                    Used in shop links (/shop/{form.key || 'key'}) — cannot be changed later.
                  </p>
                </>
              )}
            </div>
            <div>
              <label htmlFor="collection-icon" className={labelClasses}>
                Icon (emoji)
              </label>
              <input
                id="collection-icon"
                type="text"
                value={form.icon}
                onChange={event => setForm(prev => ({ ...prev, icon: event.target.value }))}
                className={inputClasses}
              />
            </div>
          </div>

          <div className="mb-5">
            <label htmlFor="collection-description" className={labelClasses}>
              Description
            </label>
            <textarea
              id="collection-description"
              rows={2}
              value={form.description}
              onChange={event =>
                setForm(prev => ({ ...prev, description: event.target.value }))
              }
              className={`${inputClasses} resize-y`}
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="bg-rose text-white border-none px-7 py-2.5 text-xs tracking-[0.15em] uppercase rounded cursor-pointer hover:bg-mocha transition-colors disabled:opacity-60 disabled:cursor-default"
          >
            {isSaving ? 'Saving…' : editing ? 'Save changes' : 'Add collection'}
          </button>
        </form>
      </div>

      {/* ── Collection list (sort_order ascending — fetchCollections order) ── */}
      <h2 className="font-heading text-xl text-mocha mb-3">All collections</h2>

      {isLoading ? (
        <LoadingSpinner />
      ) : listError ? (
        <ErrorBlock message={listError} onRetry={retry} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-warm py-8 text-center">
          No collections yet — add your first one above.
        </p>
      ) : (
        <div className="bg-white rounded-lg overflow-x-auto">
          <table className="w-full text-sm text-mocha">
            <thead>
              <tr className="text-left text-[0.65rem] tracking-[0.12em] uppercase text-warm border-b border-blush">
                <th className="px-4 py-3 font-normal" aria-label="Icon" />
                <th className="px-4 py-3 font-normal">Name</th>
                <th className="px-4 py-3 font-normal">Key</th>
                <th className="px-4 py-3 font-normal">Description</th>
                <th className="px-4 py-3 font-normal">Products</th>
                <th className="px-4 py-3 font-normal" aria-label="Reorder" />
                <th className="px-4 py-3 font-normal" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((collection, index) => {
                const count = countFor(collection.key)
                const deleteBlocked = count !== null && count > 0
                return (
                  <tr key={collection.id} className="border-b border-blush/40 last:border-b-0">
                    <td className="px-4 py-3 w-10 text-lg">{collection.icon}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{collection.label}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-warm">{collection.key}</td>
                    <td className="px-4 py-3 max-w-72">
                      <span className="block truncate" title={collection.description}>
                        {collection.description || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{count ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => move(index, -1)}
                        disabled={index === 0 || swappingId !== null}
                        aria-label={`Move ${collection.label} up`}
                        className={`${SMALL_BTN} mr-1`}
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => move(index, 1)}
                        disabled={index === rows.length - 1 || swappingId !== null}
                        aria-label={`Move ${collection.label} down`}
                        className={SMALL_BTN}
                      >
                        ↓
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button
                        onClick={() => startEdit(collection)}
                        className={`${SMALL_BTN} mr-2`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(collection)}
                        disabled={deleteBlocked}
                        title={
                          deleteBlocked
                            ? `${count} product${count === 1 ? '' : 's'} use this collection — move or delete them first.`
                            : undefined
                        }
                        className="bg-transparent border border-rose text-rose px-3 py-1.5 text-[0.65rem] tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-rose hover:text-white transition-colors disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-rose"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete collection"
        message={`Delete “${deleteTarget?.label ?? 'this collection'}”? Customers will no longer see it on the shop.`}
        confirmLabel={isDeleting ? 'Deleting…' : 'Delete'}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!isDeleting) setDeleteTarget(null)
        }}
      />
    </div>
  )
}
