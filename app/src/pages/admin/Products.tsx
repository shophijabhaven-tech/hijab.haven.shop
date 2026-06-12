import { useCallback, useEffect, useRef, useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import ErrorBlock from '@/components/ErrorBlock'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useAuth } from '@/context/AuthContext'
import { useCollections } from '@/context/CollectionsContext'
import { useToast } from '@/context/ToastContext'
import { inr } from '@/lib/format'
import {
  createProduct,
  deleteProduct,
  deleteProductImage,
  fetchProducts,
  updateProduct,
  uploadProductImage,
} from '@/lib/queries'
import type { Product } from '@/lib/supabase'

const inputClasses =
  'w-full border border-blush rounded px-3.5 py-2.5 text-sm text-mocha bg-cream/50 outline-none focus:border-rose transition-colors'

const labelClasses = 'block text-xs tracking-[0.12em] uppercase text-warm mb-1.5'

// §9.6 mirror of the bucket config limits — friendlier client-side message.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

type FormState = {
  name: string
  price: string
  /** V2 (§12.4): a collections.key — the select offers the loaded collections. */
  category: string
  description: string
  /** Blank string ⇒ stock NULL (untracked) — §6.4 stock semantics. */
  stock: string
}

const EMPTY_FORM: FormState = {
  name: '',
  price: '',
  category: '', // resolved to the first collection's key in the component
  description: '',
  stock: '',
}

/** Everything after '/product-images/' in a public URL, for best-effort cleanup. */
function storagePathFromUrl(imageUrl: string): string | null {
  const marker = '/product-images/'
  const index = imageUrl.indexOf(marker)
  if (index === -1) return null
  const path = imageUrl.slice(index + marker.length)
  return path.length > 0 ? path : null
}

// /admin/products per §3.2 + §6.4: add/edit panel above, product table below.
// CRUD flow followed exactly: upload-then-insert on add (§9.6 — never a
// product with a broken image_url), image optional on edit, confirm-dialog
// delete with best-effort storage cleanup, full list refetch after every
// mutation (no client cache invalidation cleverness).
export default function Products() {
  const { user } = useAuth()
  const { showToast } = useToast()
  // V2 (§12.4): the category select is collection-driven. The context list is
  // never empty (fetch → cache → DEFAULT_COLLECTIONS), so a first key exists.
  const { collections, byKey } = useCollections()
  const defaultCategoryKey = collections[0]?.key ?? ''

  const [products, setProducts] = useState<Product[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [form, setForm] = useState<FormState>(() => ({
    ...EMPTY_FORM,
    category: defaultCategoryKey,
  }))
  const [editing, setEditing] = useState<Product | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  // Tracks the object URL we created so we can revoke it when replaced/cleared.
  const objectUrlRef = useRef<string | null>(null)

  // Effect only fetches; all setState happens in the async settle callback
  // (repo lint rule react-hooks/set-state-in-effect — Dashboard.tsx pattern).
  const load = useCallback(() => {
    fetchProducts()
      .then(rows => {
        setProducts(rows)
        setListError(null)
        setIsLoading(false)
      })
      .catch((error: unknown) => {
        setListError(error instanceof Error ? error.message : 'Failed to load products')
        setIsLoading(false)
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function retry() {
    setIsLoading(true)
    setListError(null)
    load()
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function clearImageSelection() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setImageFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      clearImageSelection()
      return
    }
    // §9.6: mirror bucket limits client-side for a friendlier message.
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      showToast('Image must be a JPEG, PNG, WebP, or GIF file.', 'error')
      clearImageSelection()
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast('Image must be 5 MB or smaller.', 'error')
      clearImageSelection()
      return
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    setImageFile(file)
    setPreviewUrl(url)
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM, category: defaultCategoryKey })
    setEditing(null)
    clearImageSelection()
  }

  function startEdit(product: Product) {
    clearImageSelection()
    setEditing(product)
    setForm({
      name: product.name,
      price: String(product.price),
      category: product.category,
      description: product.description,
      stock: product.stock === null ? '' : String(product.stock),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** Returns the validated payload (sans image_url) or null after an error toast. */
  function validateForm(): {
    name: string
    price: number
    category: string
    description: string
    stock: number | null
  } | null {
    const name = form.name.trim()
    if (!name) {
      showToast('Please enter a product name.', 'error')
      return null
    }
    const price = Number(form.price)
    if (!Number.isFinite(price) || price <= 0) {
      showToast('Price must be a number greater than 0.', 'error')
      return null
    }
    const stockRaw = form.stock.trim()
    let stock: number | null = null
    if (stockRaw !== '') {
      const parsed = Number(stockRaw)
      if (!Number.isInteger(parsed) || parsed < 0) {
        showToast('Stock must be a whole number of 0 or more (or blank to not track).', 'error')
        return null
      }
      stock = parsed
    }
    return { name, price, category: form.category, description: form.description.trim(), stock }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return
    const payload = validateForm()
    if (!payload) return

    if (!editing && !imageFile) {
      showToast('Please choose a product image.', 'error')
      return
    }

    setIsSaving(true)
    try {
      // §6.4 step 1 + §9.6: upload FIRST; on failure surface the storage
      // error, keep the form filled, and never insert/update.
      if (editing) {
        // Image optional on edit — keep the old image_url if no new file.
        const uploadedUrl = imageFile ? await uploadProductImage(imageFile) : null
        await updateProduct(editing.id, {
          ...payload,
          ...(uploadedUrl ? { image_url: uploadedUrl } : {}),
        })
        showToast('Product updated.', 'success')
      } else {
        if (!imageFile) return // unreachable — guarded above; keeps TS narrowing honest
        const imageUrl = await uploadProductImage(imageFile)
        await createProduct({
          ...payload,
          image_url: imageUrl,
          created_by: user?.id ?? null,
        })
        showToast('Product added.', 'success')
      }
      resetForm()
      load()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save product', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || isDeleting) return
    const target = deleteTarget
    setIsDeleting(true)
    try {
      await deleteProduct(target.id)
      // Best-effort storage cleanup (§6.4): orphan files are cosmetic, the
      // helper swallows its own errors.
      const path = storagePathFromUrl(target.image_url)
      if (path) await deleteProductImage(path)
      if (editing?.id === target.id) resetForm()
      showToast('Product deleted.', 'success')
      load()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to delete product', 'error')
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
    }
  }

  const editingImagePreview = previewUrl ?? (editing ? editing.image_url : null)

  return (
    <div>
      <h1 className="font-heading text-3xl text-mocha mb-6">Products</h1>

      {/* ── Add / Edit panel (§6.4 — same page, mirrors the live admin add tab) ── */}
      <div className="bg-white rounded-lg p-5 md:p-6 mb-8">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-heading text-xl text-mocha">
            {editing ? `Edit “${editing.name}”` : 'Add product'}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="product-name" className={labelClasses}>
                Name
              </label>
              <input
                id="product-name"
                type="text"
                value={form.name}
                onChange={event => setField('name', event.target.value)}
                className={inputClasses}
              />
            </div>
            <div>
              <label htmlFor="product-price" className={labelClasses}>
                Price (₹)
              </label>
              <input
                id="product-price"
                type="number"
                min={1}
                step="any"
                value={form.price}
                onChange={event => setField('price', event.target.value)}
                className={inputClasses}
              />
            </div>
            <div>
              <label htmlFor="product-category" className={labelClasses}>
                Category
              </label>
              <select
                id="product-category"
                value={form.category}
                onChange={event => setField('category', event.target.value)}
                className={inputClasses}
              >
                {/* Editing a product whose collection was deleted: keep its key
                    selectable so saving never silently re-categorizes it. */}
                {form.category !== '' && !byKey[form.category] && (
                  <option value={form.category}>{form.category} (removed collection)</option>
                )}
                {collections.map(collection => (
                  <option key={collection.key} value={collection.key}>
                    {collection.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="product-stock" className={labelClasses}>
                Stock
              </label>
              <input
                id="product-stock"
                type="number"
                min={0}
                step={1}
                value={form.stock}
                onChange={event => setField('stock', event.target.value)}
                className={inputClasses}
              />
              <p className="text-xs text-warm mt-1.5">Leave blank to not track stock.</p>
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="product-description" className={labelClasses}>
              Description
            </label>
            <textarea
              id="product-description"
              rows={3}
              value={form.description}
              onChange={event => setField('description', event.target.value)}
              className={`${inputClasses} resize-y`}
            />
          </div>

          <div className="mb-5">
            <label htmlFor="product-image" className={labelClasses}>
              Image {editing ? '(optional — keeps the current image if blank)' : ''}
            </label>
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                id="product-image"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileChange}
                className="text-sm text-warm file:mr-3 file:bg-blush file:text-mocha file:border-none file:rounded file:px-4 file:py-2 file:text-xs file:tracking-[0.12em] file:uppercase file:cursor-pointer"
              />
              {editingImagePreview ? (
                <img
                  src={editingImagePreview}
                  alt="Preview"
                  className="w-16 h-16 rounded object-cover border border-blush shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded bg-sand shrink-0" aria-hidden="true" />
              )}
            </div>
            <p className="text-xs text-warm mt-1.5">JPEG, PNG, WebP, or GIF — 5 MB max.</p>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="bg-rose text-white border-none px-7 py-2.5 text-xs tracking-[0.15em] uppercase rounded cursor-pointer hover:bg-mocha transition-colors disabled:opacity-60 disabled:cursor-default"
          >
            {isSaving ? 'Saving…' : editing ? 'Save changes' : 'Add product'}
          </button>
        </form>
      </div>

      {/* ── Product list (newest first — fetchProducts orders by created_at desc) ── */}
      <h2 className="font-heading text-xl text-mocha mb-3">All products</h2>

      {isLoading ? (
        <LoadingSpinner />
      ) : listError ? (
        <ErrorBlock message={listError} onRetry={retry} />
      ) : products.length === 0 ? (
        <p className="text-sm text-warm py-8 text-center">
          No products yet — add your first one above.
        </p>
      ) : (
        <div className="bg-white rounded-lg overflow-hidden">
          <table className="w-full text-sm text-mocha">
            <thead>
              <tr className="text-left text-[0.65rem] tracking-[0.12em] uppercase text-warm border-b border-blush">
                <th className="px-4 py-3 font-normal" aria-label="Image" />
                <th className="px-4 py-3 font-normal">Name</th>
                <th className="px-4 py-3 font-normal">Price</th>
                <th className="px-4 py-3 font-normal">Category</th>
                <th className="px-4 py-3 font-normal">Stock</th>
                <th className="px-4 py-3 font-normal" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {products.map(product => (
                <tr key={product.id} className="border-b border-blush/40 last:border-b-0">
                  <td className="px-4 py-3 w-14">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-10 h-10 rounded object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-sand" aria-hidden="true" />
                    )}
                  </td>
                  <td className="px-4 py-3">{product.name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{inr(product.price)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {byKey[product.category]?.label ?? product.category}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {product.stock === null ? (
                      '—'
                    ) : product.stock === 0 ? (
                      <span className="inline-block bg-rose/15 text-rose text-[0.65rem] tracking-[0.12em] uppercase rounded-full px-2.5 py-1">
                        Out
                      </span>
                    ) : (
                      product.stock
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <button
                      onClick={() => startEdit(product)}
                      className="bg-transparent border border-sand text-warm px-3 py-1.5 text-[0.65rem] tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-sand/40 transition-colors mr-2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget(product)}
                      className="bg-transparent border border-rose text-rose px-3 py-1.5 text-[0.65rem] tracking-[0.12em] uppercase rounded cursor-pointer hover:bg-rose hover:text-white transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete product"
        message={`Delete ${deleteTarget?.name ?? 'this product'}? This cannot be undone.`}
        confirmLabel={isDeleting ? 'Deleting…' : 'Delete'}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!isDeleting) setDeleteTarget(null)
        }}
      />
    </div>
  )
}
