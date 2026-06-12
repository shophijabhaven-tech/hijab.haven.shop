import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_COLLECTIONS } from '@/lib/supabase'
import type { Collection } from '@/lib/supabase'
import { fetchCollections, readCachedCollections } from '@/lib/queries'

// V2 (§12.4): one near-static collections list shared by four customer
// surfaces + the admin product form — one fetch per session, no flicker.
// Resolution order: fetch → localStorage 'hh_collections' → DEFAULT_COLLECTIONS.
// `collections` is NEVER empty.

type CollectionsContextValue = {
  collections: Collection[]
  /** Lookup by collections.key (e.g. byKey[product.category]?.label). */
  byKey: Record<string, Collection>
  /** True only until the first fetch settles; the list is usable throughout. */
  isLoading: boolean
  refresh: () => Promise<void>
}

const CollectionsContext = createContext<CollectionsContextValue>({
  collections: DEFAULT_COLLECTIONS,
  byKey: Object.fromEntries(DEFAULT_COLLECTIONS.map(c => [c.key, c])),
  isLoading: false,
  refresh: async () => {},
})

export function CollectionsProvider({ children }: { children: ReactNode }) {
  // Seed synchronously from cache (else defaults) so first paint never lacks collections.
  const [collections, setCollections] = useState<Collection[]>(
    () => readCachedCollections() ?? DEFAULT_COLLECTIONS
  )
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const fresh = await fetchCollections()
      // A successful but empty result (table truncated) must not blank the UI.
      if (fresh.length > 0) setCollections(fresh)
    } catch {
      // Fetch failed (offline / table missing pre-002): keep the cache/default
      // seed — §12.4 resolution order, never empty.
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial load: the effect body only kicks off the fetch — every setState
    // lives in async callbacks (react-hooks/set-state-in-effect). Same
    // keep-on-failure semantics as refresh().
    fetchCollections()
      .then(fresh => {
        if (fresh.length > 0) setCollections(fresh)
      })
      .catch(() => {
        // Keep the cache/default seed (§12.4 resolution order).
      })
      .finally(() => setIsLoading(false))
  }, [])

  const byKey = useMemo<Record<string, Collection>>(
    () => Object.fromEntries(collections.map(c => [c.key, c])),
    [collections]
  )

  return (
    <CollectionsContext.Provider value={{ collections, byKey, isLoading, refresh }}>
      {children}
    </CollectionsContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useCollections = () => useContext(CollectionsContext)
