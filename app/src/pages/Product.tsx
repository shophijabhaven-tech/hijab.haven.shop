import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import ErrorBlock from '@/components/ErrorBlock'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { useCollections } from '@/context/CollectionsContext'
import { useToast } from '@/context/ToastContext'
import { useWishlist } from '@/context/WishlistContext'
import { inr } from '@/lib/format'
import { fetchProduct } from '@/lib/queries'
import type { Product as ProductRow } from '@/lib/supabase'

// WP-05: /product/:id (§3.1). Stock semantics per the Product type:
// null = untracked (always purchasable), 0 = out of stock, 1–5 = low-stock hint.

type FetchOutcome =
  | { status: 'notFound' }
  | { status: 'error'; message: string }
  | { status: 'ready'; product: ProductRow }

type ProductState = FetchOutcome | { status: 'loading' }

/** Branded not-found state — never crash on a bad/missing id. */
function NotFoundBlock() {
  return (
    <div className="text-center py-12">
      <div className="text-5xl mb-4">🌸</div>
      <h1 className="font-heading text-3xl font-light text-mocha mb-2">Product not found</h1>
      <p className="text-sm text-warm leading-7 mb-6">
        This piece may have sold out or been removed from the collection.
      </p>
      <Link
        to="/shop"
        className="inline-block bg-rose text-white px-7 py-2.5 text-xs tracking-[0.15em] uppercase rounded no-underline hover:bg-mocha transition-colors"
      >
        Back to Shop
      </Link>
    </div>
  )
}

export default function Product() {
  const { id } = useParams()
  const { user } = useAuth()
  const { addToCart } = useCart()
  const { byKey } = useCollections()
  const { has, toggle } = useWishlist()
  const { showToast } = useToast()

  // Strictly numeric id; anything else is a branded not-found, no fetch.
  const productId = id && /^\d+$/.test(id) ? Number(id) : null

  // Outcome is keyed by the id it was fetched for, so the view below derives
  // "loading" whenever the URL id changes — no synchronous setState in the effect
  // (react-hooks/set-state-in-effect).
  const [outcome, setOutcome] = useState<{ id: number; result: FetchOutcome } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [qty, setQty] = useState(1)

  useEffect(() => {
    if (productId === null) return // bad id → derived notFound, nothing to fetch
    let cancelled = false
    fetchProduct(productId)
      .then(product => {
        if (cancelled) return
        setOutcome({ id: productId, result: { status: 'ready', product } })
        setQty(1)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Failed to load product.'
        // fetchProduct throws exactly this for a missing row (lib/queries.ts).
        const result: FetchOutcome =
          message === 'Product not found' ? { status: 'notFound' } : { status: 'error', message }
        setOutcome({ id: productId, result })
      })
    return () => {
      cancelled = true
    }
  }, [productId, attempt])

  function retry() {
    setOutcome(null)
    setAttempt(current => current + 1)
  }

  const state: ProductState =
    productId === null
      ? { status: 'notFound' }
      : outcome && outcome.id === productId
        ? outcome.result
        : { status: 'loading' }

  if (state.status === 'loading') {
    return (
      <section className="min-h-[60vh] pt-32 pb-16 px-[5%]">
        <LoadingSpinner />
      </section>
    )
  }

  if (state.status === 'notFound') {
    return (
      <section className="min-h-[60vh] pt-32 pb-16 px-[5%]">
        <NotFoundBlock />
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="min-h-[60vh] pt-32 pb-16 px-[5%]">
        <ErrorBlock message={state.message} onRetry={retry} />
      </section>
    )
  }

  const { product } = state
  // §12.4: product.category is a soft reference to collections.key — the row
  // may be missing (legacy/free-text category), so fall back gracefully.
  const collection = byKey[product.category]
  const categoryLabel = collection?.label ?? product.category
  const categoryIcon = collection?.icon ?? '🌸'
  const outOfStock = product.stock === 0
  const lowStock = product.stock !== null && product.stock > 0 && product.stock <= 5
  const maxQty = Math.min(10, product.stock ?? 10)
  const wishlisted = has(product.id)

  function handleAddToCart() {
    if (outOfStock) return
    // CartContext.addToCart adds one unit per call (its public signature);
    // functional setState inside makes repeated calls in one tick safe.
    for (let i = 0; i < qty; i++) addToCart(product)
    showToast(qty > 1 ? `Added ${qty} × ${product.name} to cart` : 'Added to cart', 'success')
  }

  async function handleToggleWishlist() {
    if (!user) {
      // Guests: WishlistContext.toggle is a no-op — nudge to sign in (§7).
      showToast('Sign in to save favourites', 'info')
      return
    }
    try {
      await toggle(product.id)
    } catch {
      showToast('Could not update wishlist — please try again.', 'error')
    }
  }

  const qtyButtonClass =
    'w-7 h-7 rounded-full border border-sand bg-white text-mocha flex items-center justify-center transition-all enabled:cursor-pointer enabled:hover:bg-rose enabled:hover:text-white enabled:hover:border-rose disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <section className="min-h-[60vh] pt-32 pb-16 px-[5%]">
      <div className="max-w-5xl mx-auto">
        <Link
          to="/shop"
          className="inline-block text-xs tracking-[0.12em] uppercase text-warm no-underline hover:text-rose transition-colors mb-6"
        >
          ← Back to Shop
        </Link>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* Image */}
          <div className="aspect-[3/4] rounded-md overflow-hidden bg-sand">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className={`w-full h-full object-cover ${outOfStock ? 'opacity-60' : ''}`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl" aria-hidden="true">
                {categoryIcon}
              </div>
            )}
          </div>

          {/* Details */}
          <div>
            <Link
              to={`/shop/${product.category}`}
              className="inline-block text-rose text-[0.69rem] tracking-[0.24em] uppercase font-medium no-underline hover:text-mocha transition-colors mb-3"
            >
              ✦ {categoryLabel}
            </Link>
            <h1 className="font-heading text-4xl md:text-5xl font-light text-mocha leading-tight mb-2">
              {product.name}
            </h1>
            <p className="text-rose text-2xl font-medium mb-4">{inr(product.price)}</p>

            {product.description && (
              <p className="text-sm text-warm leading-7 font-light mb-6">{product.description}</p>
            )}

            {outOfStock && (
              <p className="inline-block bg-sand/60 text-mocha text-[0.65rem] tracking-[0.15em] uppercase px-3 py-1.5 rounded mb-4">
                Out of stock
              </p>
            )}
            {lowStock && <p className="text-sm text-rose mb-4">Only {product.stock} left</p>}

            {/* Quantity — mirrors the cart drawer's qty controls */}
            <div className="flex items-center gap-3 mb-5">
              <span className="text-xs tracking-[0.14em] uppercase text-warm">Quantity</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQty(current => Math.max(1, current - 1))}
                  disabled={outOfStock || qty <= 1}
                  aria-label="Decrease quantity"
                  className={qtyButtonClass}
                >
                  −
                </button>
                <span className="text-sm font-medium min-w-[20px] text-center" aria-live="polite">
                  {qty}
                </span>
                <button
                  onClick={() => setQty(current => Math.min(maxQty, current + 1))}
                  disabled={outOfStock || qty >= maxQty}
                  aria-label="Increase quantity"
                  className={qtyButtonClass}
                >
                  +
                </button>
              </div>
            </div>

            {/* Add to cart + wishlist heart */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleAddToCart}
                disabled={outOfStock}
                className={`flex-1 border-none py-3 text-xs tracking-[0.15em] uppercase rounded transition-colors ${
                  outOfStock
                    ? 'bg-sand text-warm cursor-not-allowed'
                    : 'bg-rose text-white cursor-pointer hover:bg-mocha'
                }`}
              >
                {outOfStock ? 'Out of Stock' : '🛒 Add to Cart'}
              </button>
              <button
                onClick={handleToggleWishlist}
                aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                className="w-11 h-11 shrink-0 rounded-full bg-white border border-sand flex items-center justify-center cursor-pointer text-xl hover:scale-110 transition-transform"
              >
                {wishlisted ? '❤️' : '🤍'}
              </button>
            </div>

            {/* Toasts carry no actions, so guests get a real link near the heart. */}
            {!user && (
              <p className="text-xs text-warm mt-3 text-right">
                <Link to="/auth" className="text-rose hover:text-mocha transition-colors">
                  Sign in
                </Link>{' '}
                to save favourites
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
