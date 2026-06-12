import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import ErrorBlock from '@/components/ErrorBlock'
import LoadingSpinner from '@/components/LoadingSpinner'
import ProductCard from '@/components/ProductCard'
import { useWishlist } from '@/context/WishlistContext'
import { fetchProducts } from '@/lib/queries'
import type { Product } from '@/lib/supabase'

// WP-07: wishlist ids from WishlistContext joined client-side to the catalogue.
// Removal happens through the ProductCard heart (optimistic toggle in context),
// so the filter below drops the card immediately.
export default function Wishlist() {
  const { productIds } = useWishlist()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [version, setVersion] = useState(0)

  // loading starts true and is re-armed by retry() — no synchronous setState in the effect body.
  useEffect(() => {
    let cancelled = false
    fetchProducts()
      .then(rows => {
        if (!cancelled) setProducts(rows)
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Failed to load wishlist')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [version])

  function retry() {
    setLoading(true)
    setLoadError('')
    setVersion(current => current + 1)
  }

  if (loading) return <LoadingSpinner />
  if (loadError) return <ErrorBlock message={loadError} onRetry={retry} />

  // Deleted products simply drop out of the join — only live catalogue rows render.
  const wishlistProducts = products.filter(product => productIds.includes(product.id))

  if (wishlistProducts.length === 0) {
    return (
      <div className="text-center py-12 animate-fade-in">
        <div className="text-5xl mb-3">❤️</div>
        <p className="text-sm text-warm mb-5">Your wishlist is empty</p>
        <Link
          to="/shop"
          className="inline-block bg-rose text-white no-underline px-7 py-2.5 text-xs tracking-[0.15em] uppercase rounded hover:bg-mocha transition-colors"
        >
          Browse the Shop
        </Link>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 animate-fade-in">
      {wishlistProducts.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
