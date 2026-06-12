import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { addToWishlist, fetchWishlistProductIds, removeFromWishlist } from '@/lib/queries'
import { useAuth } from './AuthContext'

type WishlistContextValue = {
  productIds: number[]
  has: (productId: number) => boolean
  /** Logged-in: optimistic add/remove (throws on DB failure after reverting).
   *  Guests: no-op — the UI layer shows the sign-in toast (§7). */
  toggle: (productId: number) => Promise<void>
}

const WishlistContext = createContext<WishlistContextValue>({
  productIds: [],
  has: () => false,
  toggle: async () => {},
})

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [productIds, setProductIds] = useState<number[]>([])

  useEffect(() => {
    let cancelled = false
    const loadIds = user ? fetchWishlistProductIds(user.id) : Promise.resolve<number[]>([])
    loadIds
      .then(ids => {
        if (!cancelled) setProductIds(ids)
      })
      .catch((error: unknown) => {
        // wishlists table may not exist until the WP-02 migration runs — degrade to empty (§9).
        console.error('Wishlist load failed:', error)
        if (!cancelled) setProductIds([])
      })
    return () => {
      cancelled = true
    }
  }, [user])

  async function toggle(productId: number): Promise<void> {
    if (!user) return // guest no-op; UI layer handles the sign-in nudge
    const wasIn = productIds.includes(productId)
    // Optimistic update…
    setProductIds(prev =>
      wasIn ? prev.filter(id => id !== productId) : [...prev, productId]
    )
    try {
      if (wasIn) await removeFromWishlist(user.id, productId)
      else await addToWishlist(user.id, productId)
    } catch (error) {
      // …reverted on failure; rethrow so the caller can toast.
      setProductIds(prev =>
        wasIn ? [...prev, productId] : prev.filter(id => id !== productId)
      )
      throw error instanceof Error ? error : new Error('Wishlist update failed')
    }
  }

  const has = (productId: number) => productIds.includes(productId)

  return (
    <WishlistContext.Provider value={{ productIds, has, toggle }}>
      {children}
    </WishlistContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useWishlist = () => useContext(WishlistContext)
