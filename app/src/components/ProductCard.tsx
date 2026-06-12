import { Link } from 'react-router'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { useToast } from '@/context/ToastContext'
import { useWishlist } from '@/context/WishlistContext'
import { inr } from '@/lib/format'
import type { Product } from '@/lib/supabase'

// Ported from App Build + §7 additions:
// stock === 0 → "Out of stock" overlay + disabled add; wishlist heart only when logged in.
export default function ProductCard({ product }: { product: Product }) {
  const { user } = useAuth()
  const { addToCart } = useCart()
  const { has, toggle } = useWishlist()
  const { showToast } = useToast()

  const outOfStock = product.stock === 0
  const wishlisted = has(product.id)

  function handleAddToCart() {
    if (outOfStock) return
    addToCart(product)
    showToast('Added to cart', 'success')
  }

  async function handleToggleWishlist() {
    try {
      await toggle(product.id)
    } catch {
      showToast('Could not update wishlist — please try again.', 'error')
    }
  }

  return (
    <div className="bg-white rounded-md overflow-hidden border border-sand hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
      <div className="relative">
        <Link to={`/product/${product.id}`}>
          <img
            src={product.image_url}
            alt={product.name}
            className={`w-full h-40 object-cover bg-blush ${outOfStock ? 'opacity-60' : ''}`}
          />
        </Link>
        {user && (
          <button
            onClick={handleToggleWishlist}
            aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center cursor-pointer border-none text-lg hover:scale-110 transition-transform"
          >
            {wishlisted ? '❤️' : '🤍'}
          </button>
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-mocha/45 flex items-center justify-center pointer-events-none">
            <span className="bg-white/90 text-mocha text-[0.65rem] tracking-[0.15em] uppercase px-3 py-1.5 rounded">
              Out of stock
            </span>
          </div>
        )}
      </div>
      <div className="p-3">
        <Link to={`/product/${product.id}`} className="no-underline">
          <p className="font-heading text-lg text-mocha mb-0.5">{product.name}</p>
        </Link>
        <p className="text-rose font-medium mb-1">{inr(product.price)}</p>
        {product.description && (
          <p className="text-xs text-warm leading-relaxed mb-3 font-light">{product.description}</p>
        )}
        <button
          onClick={handleAddToCart}
          disabled={outOfStock}
          className={`w-full border-none py-2.5 text-xs tracking-[0.12em] uppercase rounded transition-colors ${
            outOfStock
              ? 'bg-sand text-warm cursor-not-allowed'
              : 'bg-rose text-white cursor-pointer hover:bg-mocha'
          }`}
        >
          {outOfStock ? 'Out of Stock' : '🛒 Add to Cart'}
        </button>
      </div>
    </div>
  )
}
