import { supabase } from './supabase'
import type {
  Address,
  AdminRole,
  AdminUser,
  Collection,
  Customer,
  Order,
  OrderStatus,
  Product,
  ShippingAddress,
  ShopSettings,
  UserProfile,
} from './supabase'
import { OWNER_WA, UPI_ID } from './whatsapp'

// All Supabase access goes through this module (§9.1): every function
// returns typed data or throws an Error with a useful message. RLS is the
// security boundary for every call here — these are plain data accessors.

// ── Products ──────────────────────────────────────────────────

const PRODUCT_CACHE_KEY = 'hh_products'

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to load products: ${error.message}`)
  const products = (data ?? []) as Product[]
  try {
    localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(products))
  } catch {
    // Cache write is best-effort (§9.2); a full/blocked localStorage must not break the fetch.
  }
  return products
}

/** §9.2 stale-while-revalidate fallback. Returns null when no usable cache exists. */
export function readCachedProducts(): Product[] | null {
  try {
    const raw = localStorage.getItem(PRODUCT_CACHE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as Product[]) : null
  } catch {
    return null
  }
}

export async function fetchProduct(id: number): Promise<Product> {
  const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`Failed to load product: ${error.message}`)
  if (!data) throw new Error('Product not found')
  return data as Product
}

export type ProductInput = {
  name: string
  price: number
  /** V2 (§12.4): soft reference to collections.key. */
  category: string
  description: string
  image_url: string
  /** null = untracked stock (blank field in the admin form). */
  stock: number | null
  created_by?: string | null
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const { data, error } = await supabase.from('products').insert(input).select().single()
  if (error) throw new Error(`Failed to create product: ${error.message}`)
  return data as Product
}

export async function updateProduct(id: number, patch: Partial<ProductInput>): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`Failed to update product: ${error.message}`)
  return data as Product
}

export async function deleteProduct(id: number): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete product: ${error.message}`)
}

export async function uploadProductImage(file: File): Promise<string> {
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-')
  const path = `products/${Date.now()}_${safeName}`
  const { error } = await supabase.storage.from('product-images').upload(path, file)
  if (error) throw new Error(`Image upload failed: ${error.message}`)
  const { data } = supabase.storage.from('product-images').getPublicUrl(path)
  return data.publicUrl
}

/**
 * WP-09 addition: best-effort storage cleanup after a product delete (§6.4).
 * Errors are swallowed deliberately — orphan files are cosmetic and must
 * never block or fail the delete flow.
 */
export async function deleteProductImage(path: string): Promise<void> {
  try {
    await supabase.storage.from('product-images').remove([path])
  } catch {
    // Orphan files are cosmetic (§6.4) — a failed cleanup never surfaces.
  }
}

// ── Collections (V2 §12.4 — dynamic categories) ───────────────

const COLLECTIONS_CACHE_KEY = 'hh_collections'

export async function fetchCollections(): Promise<Collection[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw new Error(`Failed to load collections: ${error.message}`)
  const collections = (data ?? []) as Collection[]
  try {
    localStorage.setItem(COLLECTIONS_CACHE_KEY, JSON.stringify(collections))
  } catch {
    // Cache write is best-effort (§9.2); a full/blocked localStorage must not break the fetch.
  }
  return collections
}

/** §9.2 stale-while-revalidate fallback. Returns null when no usable cache exists. */
export function readCachedCollections(): Collection[] | null {
  try {
    const raw = localStorage.getItem(COLLECTIONS_CACHE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as Collection[]) : null
  } catch {
    return null
  }
}

export type CollectionInput = {
  key: string
  label: string
  icon: string
  description: string
  sort_order: number
}

/** §12.4 auto-slug rule: lowercase, non-alphanumeric runs → '-', trim '-'. */
export function slugifyCollectionKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function createCollection(input: CollectionInput): Promise<Collection> {
  const { data, error } = await supabase.from('collections').insert(input).select().single()
  if (error) throw new Error(`Failed to create collection: ${error.message}`)
  return data as Collection
}

/** `key` is immutable after create (§12.4) — product soft references must never dangle. */
export async function updateCollection(
  id: number,
  patch: Partial<Omit<CollectionInput, 'key'>>
): Promise<Collection> {
  const { data, error } = await supabase
    .from('collections')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`Failed to update collection: ${error.message}`)
  return data as Collection
}

/**
 * The DB BEFORE DELETE trigger raises COLLECTION_IN_USE while any product
 * still references the key (§12.4) — mapped here to a friendly message that
 * keeps the code token for toast matching.
 */
export async function deleteCollection(id: number): Promise<void> {
  const { error } = await supabase.from('collections').delete().eq('id', id)
  if (error) {
    if (error.message.includes('COLLECTION_IN_USE')) {
      throw new Error(
        'COLLECTION_IN_USE: products still use this collection — move or delete them first.'
      )
    }
    throw new Error(`Failed to delete collection: ${error.message}`)
  }
}

/** §12.4 reorder: two UPDATEs swapping sort_order (admin ↑/↓ buttons). */
export async function swapCollectionOrder(a: Collection, b: Collection): Promise<void> {
  const first = await supabase
    .from('collections')
    .update({ sort_order: b.sort_order })
    .eq('id', a.id)
  if (first.error) throw new Error(`Failed to reorder collections: ${first.error.message}`)
  const second = await supabase
    .from('collections')
    .update({ sort_order: a.sort_order })
    .eq('id', b.id)
  if (second.error) throw new Error(`Failed to reorder collections: ${second.error.message}`)
}

// ── Shop settings (V2 §12.5 — single row, id = 1) ─────────────

const SETTINGS_CACHE_KEY = 'hh_settings'

/**
 * Baked-in fallback mirroring the migration 002 seed (§12.5). Continuity
 * (§9.4): checkout must render payment info even with Supabase down —
 * resolution order is fetch → 'hh_settings' cache → DEFAULT_SETTINGS.
 * UPI_ID / OWNER_WA in lib/whatsapp.ts stay the single source of each value.
 */
export const DEFAULT_SETTINGS: ShopSettings = {
  id: 1,
  upi_id: UPI_ID,
  upi_qr_url: '/images/upi-qr.jpg',
  shop_email: '',
  whatsapp: OWNER_WA,
  updated_at: '',
}

function cacheSettings(settings: ShopSettings): void {
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings))
  } catch {
    // Cache write is best-effort (§9.2).
  }
}

export async function fetchShopSettings(): Promise<ShopSettings> {
  const { data, error } = await supabase
    .from('shop_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle()
  if (error) throw new Error(`Failed to load shop settings: ${error.message}`)
  if (!data) throw new Error('Shop settings row missing — run migration 002')
  const settings = data as ShopSettings
  cacheSettings(settings)
  return settings
}

/** §9.2 stale-while-revalidate fallback. Returns null when no usable cache exists. */
export function readCachedSettings(): ShopSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_CACHE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? (parsed as ShopSettings) : null
  } catch {
    return null
  }
}

export type ShopSettingsPatch = Partial<
  Pick<ShopSettings, 'upi_id' | 'upi_qr_url' | 'shop_email' | 'whatsapp'>
>

export async function updateShopSettings(patch: ShopSettingsPatch): Promise<ShopSettings> {
  const { data, error } = await supabase
    .from('shop_settings')
    .update(patch)
    .eq('id', 1)
    .select()
    .single()
  if (error) throw new Error(`Failed to save settings: ${error.message}`)
  const settings = data as ShopSettings
  cacheSettings(settings)
  return settings
}

/**
 * §12.5: QR uploads reuse the public 'product-images' bucket under settings/
 * (public SELECT + admin INSERT already exist there). Returns the public URL.
 */
export async function uploadSettingsQr(file: File): Promise<string> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `settings/upi-qr_${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('product-images').upload(path, file)
  if (error) throw new Error(`QR upload failed: ${error.message}`)
  const { data } = supabase.storage.from('product-images').getPublicUrl(path)
  return data.publicUrl
}

// ── Orders (insert is RPC-only; no client insert/delete ever) ──

export type PlaceOrderInput = {
  customerName: string
  customerPhone: string
  address: ShippingAddress
  items: { product_id: number; quantity: number }[]
}

export type PlaceOrderResult = {
  order_id: number
  order_code: string
  /** V2 (§12.6): 'PAY-HH-000NN'. Nullable client-side for the pre-002 deploy window. */
  payment_ref: string | null
  total: number
}

/**
 * Sole write path for orders (§4.6). On failure the Error message carries the
 * RPC code (EMPTY_ORDER | MISSING_CONTACT | BAD_QUANTITY | UNKNOWN_PRODUCT |
 * OUT_OF_STOCK:<name>) for the §9.3 toast mapping.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const { data, error } = await supabase.rpc('place_order', {
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_address: input.address,
    p_items: input.items,
  })
  if (error) throw new Error(error.message)
  const result = data as PlaceOrderResult
  // A pre-002 place_order returns no payment_ref key — normalize undefined → null.
  return { ...result, payment_ref: result.payment_ref ?? null }
}

/** Own orders only — RLS scopes the SELECT to auth.uid(). */
export async function fetchMyOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to load your orders: ${error.message}`)
  return (data ?? []) as Order[]
}

/** All orders — succeeds only for admins (RLS). */
export async function fetchAllOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to load orders: ${error.message}`)
  return (data ?? []) as Order[]
}

export async function updateOrderStatus(
  id: number,
  status: OrderStatus,
  adminNote?: string
): Promise<void> {
  const patch: { status: OrderStatus; admin_note?: string } = { status }
  if (adminNote !== undefined) patch.admin_note = adminNote
  const { error } = await supabase.from('orders').update(patch).eq('id', id)
  if (error) throw new Error(`Failed to update order: ${error.message}`)
}

// ── Payment proofs (V2 §12.6–§12.7) ───────────────────────────

/**
 * Uploads to the PRIVATE 'payment-proofs' bucket (anon INSERT allowed;
 * 5MB/mime caps are bucket-enforced). Returns the storage PATH, not a URL —
 * the bucket is admin-read-only via signed URLs.
 */
export async function uploadPaymentProof(orderCode: string, file: File): Promise<string> {
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-')
  const path = `${orderCode}/${Date.now()}_${safeName}`
  const { error } = await supabase.storage.from('payment-proofs').upload(path, file)
  if (error) throw new Error(`Proof upload failed: ${error.message}`)
  return path
}

/**
 * §12.6: the order_code + payment_ref pairing is the guest's bearer token.
 * On failure the Error message carries the RPC code
 * (BAD_PATH | ORDER_NOT_FOUND | ALREADY_VERIFIED) for toast mapping.
 */
export async function submitPaymentProof(
  orderCode: string,
  paymentRef: string,
  proofPath: string
): Promise<void> {
  const { error } = await supabase.rpc('submit_payment_proof', {
    p_order_code: orderCode,
    p_payment_ref: paymentRef,
    p_proof_path: proofPath,
  })
  if (error) throw new Error(error.message)
}

/**
 * Fire-and-forget owner email via the 'notify-payment' edge function.
 * NEVER throws (§12.7 best-effort posture): /admin/orders badges are the
 * source of truth; an email failure must never surface to the customer or
 * block checkout step 3. Call only AFTER submitPaymentProof succeeds.
 */
export async function notifyPaymentEmail(orderCode: string, paymentRef: string): Promise<void> {
  try {
    await supabase.functions.invoke('notify-payment', {
      body: { order_code: orderCode, payment_ref: paymentRef },
    })
  } catch {
    // Swallowed deliberately (§12.7): email is best-effort by design.
  }
}

/** Admin-only in effect: the signed URL (300s) only succeeds under admin storage RLS. */
export async function getPaymentProofUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl(path, 300)
  if (error) throw new Error(`Failed to load payment proof: ${error.message}`)
  return data.signedUrl
}

/** Admin Verify/Reject (§12.6): plain orders UPDATE — the 001 admin policy covers it. */
export async function updatePaymentStatus(
  id: number,
  status: 'verified' | 'rejected'
): Promise<void> {
  const { error } = await supabase.from('orders').update({ payment_status: status }).eq('id', id)
  if (error) throw new Error(`Failed to update payment status: ${error.message}`)
}

// ── Admin dashboard counts (WP-08 additive) ───────────────────

/** null = that count's query failed (e.g. table missing pre-migration, §9). */
export type AdminCounts = {
  pendingOrders: number | null
  totalOrders: number | null
  products: number | null
  customers: number | null
}

async function countRows(table: string, match?: Record<string, string>): Promise<number> {
  let query = supabase.from(table).select('*', { count: 'exact', head: true })
  if (match) query = query.match(match)
  const { count, error } = await query
  if (error) throw new Error(`Failed to count ${table}: ${error.message}`)
  return count ?? 0
}

/**
 * WP-08 addition for Dashboard stat cards. The four head-only count queries
 * run independently (Promise.allSettled) so a failing table nulls only its
 * own card instead of failing the whole dashboard (§9). Never rejects.
 */
export async function fetchAdminCounts(): Promise<AdminCounts> {
  const [pending, total, products, customers] = await Promise.allSettled([
    countRows('orders', { status: 'pending' }),
    countRows('orders'),
    countRows('products'),
    countRows('customers'),
  ])
  const settled = (result: PromiseSettledResult<number>): number | null =>
    result.status === 'fulfilled' ? result.value : null
  return {
    pendingOrders: settled(pending),
    totalOrders: settled(total),
    products: settled(products),
    customers: settled(customers),
  }
}

// ── Customers (gate signups / broadcast list) ─────────────────

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to load customers: ${error.message}`)
  const rows = (data ?? []) as (Omit<Customer, 'email'> & { email: string | null })[]
  // V2 contract: email reads as `email ?? ''` (pre-002 rows are NULL).
  return rows.map(row => ({ ...row, email: row.email ?? '' }))
}

/** en-IN locale date string — matches the format the live site stores. */
function joinedDateNow(): string {
  return new Date().toLocaleDateString('en-IN')
}

/**
 * V2 gate signup (§12.2): NEW RPC register_customer_v2 — NEVER the legacy
 * register_customer with 4 args (PostgREST overload ambiguity would break
 * the live legacy site's 3-arg calls). On phone conflict the RPC backfills
 * email when the existing row has none.
 */
export async function registerCustomerV2(
  name: string,
  phone: string,
  email: string
): Promise<void> {
  const { error } = await supabase.rpc('register_customer_v2', {
    p_name: name,
    p_phone: phone,
    p_joined_date: joinedDateNow(),
    p_email: email,
  })
  if (error) throw new Error(`Customer registration failed: ${error.message}`)
}

// ── Admin users (super_admin-managed; RLS enforces) ───────────

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('admin_users')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Failed to load admins: ${error.message}`)
  return (data ?? []) as AdminUser[]
}

export async function addAdminUser(input: {
  id: string
  email: string
  display_name: string
  role: AdminRole
}): Promise<void> {
  const { error } = await supabase.from('admin_users').insert(input)
  if (error) throw new Error(`Failed to add admin: ${error.message}`)
}

export async function updateAdminRole(id: string, role: AdminRole): Promise<void> {
  const { error } = await supabase.from('admin_users').update({ role }).eq('id', id)
  if (error) throw new Error(`Failed to update admin role: ${error.message}`)
}

export async function removeAdminUser(id: string): Promise<void> {
  const { error } = await supabase.from('admin_users').delete().eq('id', id)
  if (error) throw new Error(`Failed to remove admin: ${error.message}`)
}

// ── User profile ──────────────────────────────────────────────

export async function fetchMyProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(`Failed to load profile: ${error.message}`)
  return (data ?? null) as UserProfile | null
}

export async function upsertMyProfile(input: {
  id: string
  email?: string | null
  full_name?: string
  phone?: string
}): Promise<UserProfile> {
  const { data, error } = await supabase.from('user_profiles').upsert(input).select().single()
  if (error) throw new Error(`Failed to save profile: ${error.message}`)
  return data as UserProfile
}

// ── Addresses ─────────────────────────────────────────────────

export type AddressInput = {
  label: string
  full_name: string
  phone: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  pincode: string
  is_default: boolean
}

/** Own addresses only — RLS scopes the SELECT to auth.uid(). */
export async function fetchMyAddresses(): Promise<Address[]> {
  const { data, error } = await supabase
    .from('addresses')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to load addresses: ${error.message}`)
  return (data ?? []) as Address[]
}

export async function addAddress(userId: string, input: AddressInput): Promise<Address> {
  const { data, error } = await supabase
    .from('addresses')
    .insert({ user_id: userId, ...input })
    .select()
    .single()
  if (error) throw new Error(`Failed to save address: ${error.message}`)
  return data as Address
}

export async function updateAddress(id: number, patch: Partial<AddressInput>): Promise<Address> {
  const { data, error } = await supabase
    .from('addresses')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`Failed to update address: ${error.message}`)
  return data as Address
}

export async function deleteAddress(id: number): Promise<void> {
  const { error } = await supabase.from('addresses').delete().eq('id', id)
  if (error) throw new Error(`Failed to delete address: ${error.message}`)
}

// ── Wishlist ──────────────────────────────────────────────────

export async function fetchWishlistProductIds(userId: string): Promise<number[]> {
  const { data, error } = await supabase
    .from('wishlists')
    .select('product_id')
    .eq('user_id', userId)
  if (error) throw new Error(`Failed to load wishlist: ${error.message}`)
  return ((data ?? []) as { product_id: number }[]).map(row => row.product_id)
}

export async function addToWishlist(userId: string, productId: number): Promise<void> {
  const { error } = await supabase
    .from('wishlists')
    .insert({ user_id: userId, product_id: productId })
  if (error) throw new Error(`Failed to add to wishlist: ${error.message}`)
}

export async function removeFromWishlist(userId: string, productId: number): Promise<void> {
  const { error } = await supabase
    .from('wishlists')
    .delete()
    .eq('user_id', userId)
    .eq('product_id', productId)
  if (error) throw new Error(`Failed to remove from wishlist: ${error.message}`)
}
