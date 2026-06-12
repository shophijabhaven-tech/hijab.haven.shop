import { createClient } from '@supabase/supabase-js'

const supabaseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in app/.env.local (see .env.example).'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Shared domain types (WP-02 data contract — definitive) ──

// ── V2: dynamic collections (§12.4) ──

/** Row shape of the `collections` table (migration 002 §12.9 A). */
export type Collection = {
  id: number
  key: string
  label: string
  icon: string
  description: string
  sort_order: number
  created_at: string
}

/**
 * Last-resort fallback (§12.4): the 6 seeded collection rows, ids/sort 1–6,
 * copy identical to the live site's category cards (and to the migration 002
 * seed). The UI must never render zero collections — resolution order is
 * fetch → localStorage 'hh_collections' → DEFAULT_COLLECTIONS.
 * `created_at` is synthetic (these rows are never persisted from here).
 */
export const DEFAULT_COLLECTIONS: Collection[] = (
  [
    {
      key: 'everyday',
      label: 'Everyday Hijabs',
      icon: '🧕',
      description: 'Lightweight, breathable fabrics in versatile colours for your daily wear.',
    },
    {
      key: 'occasion',
      label: 'Occasion Wear',
      icon: '✨',
      description: 'Elegant embellished hijabs for weddings, Eid, and celebrations.',
    },
    {
      key: 'hampers',
      label: 'Gift Hampers',
      icon: '🎁',
      description: 'Beautifully curated hampers — the perfect gift for every occasion.',
    },
    {
      key: 'accessories',
      label: 'Accessories',
      icon: '💎',
      description: 'Pins, underscarves, hijab magnets and more to keep you put-together.',
    },
    {
      key: 'pastel',
      label: 'Pastel Collection',
      icon: '🌸',
      description: 'Soft, dreamy tones that radiate femininity and grace.',
    },
    {
      key: 'minimal',
      label: 'Minimal & Neutral',
      icon: '🖤',
      description: 'Classic blacks, whites, and earth tones for an effortlessly chic look.',
    },
  ] as const
).map((seed, index) => ({
  ...seed,
  id: index + 1,
  sort_order: index + 1,
  created_at: '',
}))

export type Product = {
  id: number
  name: string
  price: number
  /** V2 (§12.4): soft reference to collections.key — free text, CHECK dropped in 002. */
  category: string
  description: string
  image_url: string
  /** null = untracked (always purchasable); 0 = out of stock; >0 = tracked. */
  stock: number | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export type Customer = {
  id: number
  name: string
  phone: string
  joined_date: string
  joined_ts: number
  created_at: string
  /** V2 (§12.2): gate signup email. DB column is nullable — readers normalize via `email ?? ''`. */
  email: string
}

export type AdminRole = 'admin' | 'super_admin'

export type AdminUser = {
  id: string
  email: string
  display_name: string
  role: AdminRole
  created_at: string
}

export type UserProfile = {
  id: string
  email: string | null
  full_name: string
  phone: string
  created_at: string
  updated_at: string
}

export type Address = {
  id: number
  user_id: string
  label: string
  full_name: string
  phone: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  pincode: string
  is_default: boolean
  created_at: string
}

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'

/** V2 (§12.6): payment-proof lifecycle, CHECK-enforced in migration 002 E. */
export type PaymentStatus = 'awaiting_proof' | 'proof_submitted' | 'verified' | 'rejected'

export type OrderItem = {
  product_id: number
  name: string
  price: number
  quantity: number
  image_url: string
}

export type ShippingAddress = {
  full_name: string
  phone: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  pincode: string
}

export type Order = {
  id: number
  order_code: string | null
  user_id: string | null
  customer_name: string
  customer_phone: string
  items: OrderItem[]
  total: number
  status: OrderStatus
  shipping_address: ShippingAddress
  payment_method: string
  admin_note: string
  created_at: string
  updated_at: string
  // V2 payment columns (§12.6, migration 002 E) —
  /** 'PAY-HH-00042'; null only for orders placed before 002 ran. */
  payment_ref: string | null
  payment_status: PaymentStatus
  /** Storage path in the private 'payment-proofs' bucket; admin views via signed URL. */
  payment_proof_path: string | null
  proof_submitted_at: string | null
}

/**
 * V2 (§12.5): single-row `shop_settings` table (id = 1, CHECK-enforced).
 * All text columns are NOT NULL with empty-string semantics.
 */
export type ShopSettings = {
  id: 1
  upi_id: string
  upi_qr_url: string
  shop_email: string
  whatsapp: string
  updated_at: string
}

export type WishlistItem = {
  id: number
  user_id: string
  product_id: number
  created_at: string
}
