import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Product } from '@/lib/supabase'

export type CartItem = {
  id: number
  name: string
  price: number
  img: string
  qty: number
}

type CartContextValue = {
  items: CartItem[]
  addToCart: (product: Product) => void
  removeFromCart: (productId: number) => void
  updateQty: (productId: number, delta: number) => void
  clearCart: () => void
  cartCount: number
  cartTotal: number
  isCartOpen: boolean
  openCart: () => void
  closeCart: () => void
}

const CartContext = createContext<CartContextValue>({
  items: [],
  addToCart: () => {},
  removeFromCart: () => {},
  updateQty: () => {},
  clearCart: () => {},
  cartCount: 0,
  cartTotal: 0,
  isCartOpen: false,
  openCart: () => {},
  closeCart: () => {},
})

const CART_STORAGE_KEY = 'hh_cart'

function readStoredCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CartItem[]) : []
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readStoredCart)
  const [isCartOpen, setCartOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
  }, [items])

  function addToCart(product: Product) {
    setItems(prev => {
      const existing = prev.find(item => item.id === product.id)
      if (existing) {
        return prev.map(item => (item.id === product.id ? { ...item, qty: item.qty + 1 } : item))
      }
      return [
        ...prev,
        { id: product.id, name: product.name, price: product.price, img: product.image_url, qty: 1 },
      ]
    })
  }

  function removeFromCart(productId: number) {
    setItems(prev => prev.filter(item => item.id !== productId))
  }

  function updateQty(productId: number, delta: number) {
    setItems(prev =>
      prev
        .map(item => (item.id === productId ? { ...item, qty: item.qty + delta } : item))
        .filter(item => item.qty > 0)
    )
  }

  function clearCart() {
    setItems([])
  }

  const cartCount = items.reduce((sum, item) => sum + item.qty, 0)
  const cartTotal = items.reduce((sum, item) => sum + item.price * item.qty, 0)

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQty,
        clearCart,
        cartCount,
        cartTotal,
        isCartOpen,
        openCart: () => setCartOpen(true),
        closeCart: () => setCartOpen(false),
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useCart = () => useContext(CartContext)
