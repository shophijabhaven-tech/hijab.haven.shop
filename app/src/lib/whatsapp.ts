export const OWNER_WA = '919820517390'
export const HAMPER_GROUP_URL = 'https://chat.whatsapp.com/LWnsTUxGY4G9hmpFCEC06R'
export const INSTAGRAM_URL = 'https://www.instagram.com/_hijab__haven_'
export const UPI_ID = '9820517390@ptyes'

export function waLink(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

export type OrderMessageInput = {
  /** null when DB persistence failed (§9.4) — the order line is omitted. */
  orderCode: string | null
  /**
   * V2 (§12.6): 'PAY-HH-000NN'. Absent/null on the §9.4 continuity path —
   * the Payment ID line is then omitted, same rule as the order line.
   */
  paymentRef?: string | null
  /** V2 (§12.5): shop_settings-driven UPI ID; defaults to the baked-in UPI_ID. */
  upiId?: string
  name: string
  phone: string
  address: string
  items: { name: string; quantity: number; price: number }[]
  total: number
}

/**
 * Builds the EXACT §6.1 WhatsApp order message (V2: §12.6 Payment ID line
 * directly after the order line when paymentRef is present; output is
 * byte-identical to V1 when paymentRef/upiId are omitted).
 */
export function buildOrderMessage(input: OrderMessageInput): string {
  const orderLine = input.orderCode ? `*Order:* ${input.orderCode}\n` : ''
  const paymentLine = input.paymentRef ? `*Payment ID:* ${input.paymentRef}\n` : ''
  const itemLines = input.items
    .map(item => `• ${item.name} × ${item.quantity} = ₹${item.price * item.quantity}`)
    .join('\n')
  return (
    `🧕 *New Order — Hijab Haven*\n\n` +
    orderLine +
    paymentLine +
    `*Customer:* ${input.name}\n` +
    `*WhatsApp:* ${input.phone}\n` +
    `*Address:* ${input.address}\n\n` +
    `*Items:*\n${itemLines}\n\n` +
    `*Total: ₹${input.total}*\n\n` +
    // `||` (not `??`): an empty-string upi_id from settings must still fall back (§9.4).
    `_Payment via UPI: ${input.upiId || UPI_ID}_`
  )
}
