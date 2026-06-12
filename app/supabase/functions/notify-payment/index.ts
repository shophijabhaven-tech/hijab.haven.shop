// Supabase Edge Function: notify-payment
// Deployed with JWT verification DISABLED (guests have no JWT; the publishable
// anon key is not a JWT). Authorization = the order_code + payment_ref pairing,
// verified against the DB below. Best-effort by design (§12.7): the admin panel
// is the source of truth; this email is a convenience ping.
import { createClient } from 'npm:@supabase/supabase-js@2'

type OrderItem = { name: string; quantity: number; price: number }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  let orderCode = ''
  let paymentRef = ''
  try {
    const body = await req.json()
    orderCode = String(body.order_code ?? '').trim()
    paymentRef = String(body.payment_ref ?? '').trim()
  } catch {
    return json({ error: 'BAD_JSON' }, 400)
  }
  if (!orderCode || !paymentRef) return json({ error: 'MISSING_FIELDS' }, 400)

  // Service-role client: server-side only — this key never reaches the browser.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // The pairing is the bearer token: both values must match one row (§12.6).
  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'order_code, payment_ref, payment_status, customer_name, customer_phone, items, total, shipping_address, payment_proof_path, proof_submitted_at'
    )
    .eq('order_code', orderCode)
    .eq('payment_ref', paymentRef)
    .maybeSingle()
  if (error || !order) return json({ error: 'ORDER_NOT_FOUND' }, 404)
  if (order.payment_status !== 'proof_submitted') return json({ error: 'NO_PROOF_PENDING' }, 409)

  const { data: settings } = await supabase
    .from('shop_settings')
    .select('shop_email')
    .eq('id', 1)
    .maybeSingle()
  const to = settings?.shop_email?.trim()
  if (!to) return json({ skipped: 'shop_email not configured' })

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) return json({ skipped: 'RESEND_API_KEY not set' })

  const itemLines = ((order.items ?? []) as OrderItem[])
    .map((i) => `• ${i.name} × ${i.quantity} = ₹${i.price * i.quantity}`)
    .join('\n')
  const addr = (order.shipping_address ?? {}) as Record<string, string>
  const addressLine = [addr.address_line1, addr.address_line2, addr.city, addr.state, addr.pincode]
    .filter((p) => p && String(p).trim() !== '')
    .join(', ')

  const text =
    `Payment proof submitted on Hijab Haven.\n\n` +
    `Order: ${order.order_code}\n` +
    `Payment ID: ${order.payment_ref}\n` +
    `Status: proof_submitted — verify or reject in the Owner Panel\n\n` +
    `Customer: ${order.customer_name}\n` +
    `WhatsApp: ${order.customer_phone}\n` +
    `Address: ${addressLine}\n\n` +
    `Items:\n${itemLines}\n\n` +
    `Total: ₹${order.total}\n\n` +
    `Proof file: ${order.payment_proof_path}\n` +
    `Submitted at: ${order.proof_submitted_at}\n\n` +
    `Open the Owner Panel: https://hijab-haven.netlify.app/admin/orders`

  const resend = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Hijab Haven <onboarding@resend.dev>',
      to: [to],
      subject: `Payment proof — ${order.order_code} (${order.payment_ref})`,
      text,
    }),
  })
  if (!resend.ok) return json({ error: 'RESEND_FAILED', detail: await resend.text() }, 502)
  return json({ sent: true })
})
