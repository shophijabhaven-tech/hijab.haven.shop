import { describe, expect, it } from 'vitest'
import { slugifyCollectionKey } from './queries'

// WP-V2-02 unit tests for the §12.4 auto-slug rule:
// lowercase, non-alphanumeric runs → '-', trim '-'.
// (Importing ./queries pulls in ./supabase, which reads VITE_* env vars —
// vitest loads them from app/.env.local via Vite's env handling.)

describe('slugifyCollectionKey', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugifyCollectionKey('Everyday Hijabs')).toBe('everyday-hijabs')
  })

  it('collapses runs of non-alphanumerics into a single hyphen', () => {
    expect(slugifyCollectionKey('Minimal & Neutral')).toBe('minimal-neutral')
  })

  it('trims leading/trailing hyphens', () => {
    expect(slugifyCollectionKey('  ✨ Occasion Wear! ')).toBe('occasion-wear')
  })

  it('keeps digits', () => {
    expect(slugifyCollectionKey('Eid 2026 Edit')).toBe('eid-2026-edit')
  })

  it('reproduces the six seeded keys from their labels where they match', () => {
    expect(slugifyCollectionKey('Accessories')).toBe('accessories')
    expect(slugifyCollectionKey('Pastel Collection')).toBe('pastel-collection')
  })

  it('returns an empty string for purely symbolic input (caller must validate)', () => {
    expect(slugifyCollectionKey('✨✨✨')).toBe('')
  })
})
