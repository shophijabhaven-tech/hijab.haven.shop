import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import ErrorBlock from '@/components/ErrorBlock'
import ProductCard from '@/components/ProductCard'
import { useCollections } from '@/context/CollectionsContext'
import { fetchProducts, readCachedProducts } from '@/lib/queries'
import type { Product } from '@/lib/supabase'

// WP-05: /shop and /shop/:category (§3.1). The URL is the filter state —
// chips are plain <Link>s. V2 (§12.4): chips/heading/validation come from
// CollectionsContext; an invalid :category redirects to /shop only AFTER the
// collections fetch settles (no bouncing deep links to fresh admin-added keys).

// Live-site socials, used verbatim in the empty-category block (index.html .empty-cat).
const WHATSAPP_GROUP_URL = 'https://chat.whatsapp.com/LWnsTUxGY4G9hmpFCEC06R'
const INSTAGRAM_URL = 'https://www.instagram.com/_hijab__haven_'

type CatalogueState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; products: Product[]; fromCache: boolean }

/** Skeleton matching ProductCard's footprint (image h-40 + text block). */
function SkeletonCard() {
  return (
    <div className="bg-white rounded-md overflow-hidden border border-sand" aria-hidden="true">
      <div className="w-full h-40 bg-blush animate-pulse" />
      <div className="p-3">
        <div className="h-5 w-3/4 bg-sand/70 rounded animate-pulse mb-2" />
        <div className="h-4 w-1/3 bg-blush animate-pulse rounded mb-3" />
        <div className="h-9 w-full bg-sand/50 rounded animate-pulse" />
      </div>
    </div>
  )
}

/** Ported from the live site's .empty-cat block (copy verbatim). */
function ComingSoon({ icon }: { icon: string }) {
  return (
    <div className="col-span-full text-center py-12 px-4">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="font-heading text-2xl text-mocha mb-2">Coming Soon!</h3>
      <p className="text-sm text-warm leading-7">
        The owner is updating this collection.
        <br />
        Follow us on{' '}
        <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="text-rose">
          Instagram
        </a>{' '}
        or join our{' '}
        <a href={WHATSAPP_GROUP_URL} target="_blank" rel="noreferrer" className="text-rose">
          WhatsApp Group
        </a>{' '}
        to be notified! 🌸
      </p>
    </div>
  )
}

export default function Shop() {
  const { category } = useParams()
  const { collections, byKey, isLoading: collectionsLoading } = useCollections()
  const [state, setState] = useState<CatalogueState>({ status: 'loading' })
  const [bannerDismissed, setBannerDismissed] = useState(false)
  // Bumped by Retry to re-run the fetch effect; state resets happen in the handler,
  // never synchronously inside the effect (react-hooks/set-state-in-effect).
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetchProducts()
      .then(products => {
        if (!cancelled) setState({ status: 'ready', products, fromCache: false })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // §9.2 stale-while-revalidate: fall back to the cached catalogue if present.
        const cached = readCachedProducts()
        if (cached) {
          setState({ status: 'ready', products: cached, fromCache: true })
        } else {
          const message =
            error instanceof Error ? error.message : 'Failed to load products — please try again.'
          setState({ status: 'error', message })
        }
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  function retry() {
    setState({ status: 'loading' })
    setBannerDismissed(false)
    setAttempt(current => current + 1)
  }

  // :category validates against the loaded collections (§12.4). While the
  // collections fetch is in flight we render the shell instead of redirecting —
  // a deep link to a fresh admin-added key must not bounce before data arrives.
  const activeCollection = category ? (byKey[category] ?? null) : null
  if (category && !activeCollection && !collectionsLoading) {
    return <Navigate to="/shop" replace />
  }
  // Deep link whose key hasn't resolved yet (fetch in flight): keep showing
  // skeletons — never flash "Coming Soon" before the validation verdict.
  const pendingCategory = Boolean(category) && !activeCollection

  const visibleProducts =
    state.status === 'ready'
      ? category
        ? state.products.filter(product => product.category === category)
        : state.products
      : []

  const chipBase =
    'px-4 py-2 rounded-full text-[0.7rem] tracking-[0.12em] uppercase no-underline border transition-colors'
  const chipActive = 'bg-rose text-white border-rose'
  const chipIdle = 'bg-white text-mocha border-sand hover:bg-blush'

  return (
    <section className="min-h-[60vh] pt-32 pb-16 px-[5%]">
      <div className="max-w-6xl mx-auto">
        {/* Header — live .stag / .stitle idiom */}
        <header className="text-center mb-8">
          <span className="inline-block text-rose text-[0.69rem] tracking-[0.24em] uppercase font-medium mb-3">
            ✦ Our Collections
          </span>
          <h1 className="font-heading text-4xl md:text-5xl font-light text-mocha leading-tight mb-3">
            {activeCollection ? activeCollection.label : 'Shop'}
          </h1>
          <p className="text-warm text-sm font-light leading-7 max-w-lg mx-auto">
            {activeCollection
              ? activeCollection.description
              : "Whether it's a casual day out or a special celebration, we have the perfect hijab for you."}
          </p>
        </header>

        {/* Filter chips — URL is the state (collections pre-sorted by sort_order) */}
        <nav aria-label="Product categories" className="flex flex-wrap justify-center gap-2 mb-10">
          <Link to="/shop" className={`${chipBase} ${category ? chipIdle : chipActive}`}>
            All
          </Link>
          {collections.map(collection => (
            <Link
              key={collection.key}
              to={`/shop/${collection.key}`}
              className={`${chipBase} ${category === collection.key ? chipActive : chipIdle}`}
              aria-current={category === collection.key ? 'page' : undefined}
            >
              {collection.label}
            </Link>
          ))}
        </nav>

        {/* §9.2 cached-catalogue banner */}
        {state.status === 'ready' && state.fromCache && !bannerDismissed && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 bg-blush border border-sand rounded-md px-4 py-3 mb-6"
          >
            <p className="text-sm text-mocha m-0">
              Showing recently viewed catalogue — refresh to retry
            </p>
            <button
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss notice"
              className="bg-transparent border-none text-warm text-lg cursor-pointer hover:text-mocha leading-none"
            >
              ✕
            </button>
          </div>
        )}

        {state.status === 'error' && <ErrorBlock message={state.message} onRetry={retry} />}

        {(state.status === 'loading' || state.status === 'ready') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {state.status === 'loading' || pendingCategory ? (
              Array.from({ length: 8 }, (_, index) => <SkeletonCard key={index} />)
            ) : visibleProducts.length === 0 ? (
              <ComingSoon icon={activeCollection ? activeCollection.icon : '🌸'} />
            ) : (
              visibleProducts.map(product => <ProductCard key={product.id} product={product} />)
            )}
          </div>
        )}
      </div>
    </section>
  )
}
