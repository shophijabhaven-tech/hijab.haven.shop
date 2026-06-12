import { Link } from 'react-router'
import { useCart } from '@/context/CartContext'
import { inr } from '@/lib/format'

// Ported from App Build; styling mirrors the live site's .cart-drawer (§8).
export default function CartDrawer() {
  const { items, cartTotal, isCartOpen, closeCart, updateQty, removeFromCart } = useCart()

  if (!isCartOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-[900] bg-mocha/55" onClick={closeCart} />
      <div className="fixed top-0 right-0 bottom-0 w-full max-w-[420px] bg-cream flex flex-col shadow-[-10px_0_50px_rgba(0,0,0,.2)] z-[901] animate-fade-in">
        {/* Header */}
        <div className="bg-gradient-to-br from-mocha to-warm px-5 py-4 flex items-center justify-between shrink-0">
          <h2 className="font-heading text-xl text-blush font-light">Your Cart</h2>
          <button
            onClick={closeCart}
            className="bg-transparent border-none text-blush/70 text-2xl cursor-pointer"
            aria-label="Close cart"
          >
            ✕
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
          {items.length === 0 ? (
            <div className="text-center py-12 text-warm">
              <div className="text-5xl mb-3">🛒</div>
              <p>
                Your cart is empty.
                <br />
                Browse our collections!
              </p>
            </div>
          ) : (
            items.map(item => (
              <div
                key={item.id}
                className="bg-white rounded-md p-3 flex gap-3 items-center border border-sand"
              >
                <img
                  src={item.img}
                  alt={item.name}
                  className="w-16 h-16 rounded object-cover bg-blush shrink-0"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-mocha">{item.name}</div>
                  <div className="text-sm text-rose font-medium">{inr(item.price)} each</div>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => updateQty(item.id, -1)}
                      className="w-7 h-7 rounded-full border border-sand bg-white text-mocha flex items-center justify-center cursor-pointer hover:bg-rose hover:text-white hover:border-rose transition-all"
                    >
                      −
                    </button>
                    <span className="text-sm font-medium min-w-[20px] text-center">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.id, 1)}
                      className="w-7 h-7 rounded-full border border-sand bg-white text-mocha flex items-center justify-center cursor-pointer hover:bg-rose hover:text-white hover:border-rose transition-all"
                    >
                      +
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => removeFromCart(item.id)}
                  className="bg-transparent border-none text-sand cursor-pointer text-lg hover:text-rose"
                  aria-label={`Remove ${item.name}`}
                >
                  🗑
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-5 py-4 border-t border-sand bg-white shrink-0">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs tracking-[0.14em] uppercase text-warm">Total</span>
              <span className="font-heading text-2xl text-mocha font-semibold">{inr(cartTotal)}</span>
            </div>
            <Link
              to="/checkout"
              onClick={closeCart}
              className="block w-full bg-rose text-white text-center py-3 rounded-md text-xs tracking-[0.15em] uppercase hover:bg-mocha transition-colors no-underline"
            >
              Proceed to Checkout
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
