import { describe, expect, it } from 'vitest'
import { buildOrderMessage, OWNER_WA, UPI_ID, waLink } from './whatsapp'

// WP-12 unit tests — the §6.1 WhatsApp order message is the commercially
// critical artifact; these tests pin it character-for-character.

const baseInput = {
  name: 'Fatima Shaikh',
  phone: '9876543210',
  address: '12 Rose Street, Vashi, Navi Mumbai - 400703',
  items: [
    { name: 'Pearl Chiffon Hijab', quantity: 2, price: 599 },
    { name: 'Hijab Pin Set', quantity: 1, price: 199 },
  ],
  total: 1397,
}

describe('buildOrderMessage', () => {
  it('matches the §6.1 template EXACTLY when an order code is present', () => {
    const message = buildOrderMessage({ orderCode: 'HH-00042', ...baseInput })
    expect(message).toBe(
      '🧕 *New Order — Hijab Haven*\n' +
        '\n' +
        '*Order:* HH-00042\n' +
        '*Customer:* Fatima Shaikh\n' +
        '*WhatsApp:* 9876543210\n' +
        '*Address:* 12 Rose Street, Vashi, Navi Mumbai - 400703\n' +
        '\n' +
        '*Items:*\n' +
        '• Pearl Chiffon Hijab × 2 = ₹1198\n' +
        '• Hijab Pin Set × 1 = ₹199\n' +
        '\n' +
        '*Total: ₹1397*\n' +
        '\n' +
        '_Payment via UPI: 9820517390@ptyes_'
    )
  })

  it('omits ONLY the order line when orderCode is null (§9.4 continuity path)', () => {
    const message = buildOrderMessage({ orderCode: null, ...baseInput })
    expect(message).toBe(
      '🧕 *New Order — Hijab Haven*\n' +
        '\n' +
        '*Customer:* Fatima Shaikh\n' +
        '*WhatsApp:* 9876543210\n' +
        '*Address:* 12 Rose Street, Vashi, Navi Mumbai - 400703\n' +
        '\n' +
        '*Items:*\n' +
        '• Pearl Chiffon Hijab × 2 = ₹1198\n' +
        '• Hijab Pin Set × 1 = ₹199\n' +
        '\n' +
        '*Total: ₹1397*\n' +
        '\n' +
        '_Payment via UPI: 9820517390@ptyes_'
    )
  })

  it('computes per-line totals as price × quantity (single item)', () => {
    const message = buildOrderMessage({
      orderCode: 'HH-00001',
      name: 'A',
      phone: '1',
      address: 'B',
      items: [{ name: 'Hijab', quantity: 3, price: 250 }],
      total: 750,
    })
    expect(message).toContain('• Hijab × 3 = ₹750')
    expect(message).toContain('*Total: ₹750*')
  })

  it('uses the legacy-site item bullet format exactly (• name × qty = ₹line)', () => {
    // Mirrors index.html goStep3(): '• ' + name + ' × ' + qty + ' = ₹' + (price*qty)
    const message = buildOrderMessage({ orderCode: null, ...baseInput })
    const itemSection = message.split('*Items:*\n')[1].split('\n\n')[0]
    expect(itemSection.split('\n')).toEqual([
      '• Pearl Chiffon Hijab × 2 = ₹1198',
      '• Hijab Pin Set × 1 = ₹199',
    ])
  })

  it('ends with the UPI payment line built from the shared UPI_ID constant', () => {
    const message = buildOrderMessage({ orderCode: null, ...baseInput })
    expect(UPI_ID).toBe('9820517390@ptyes')
    expect(message.endsWith(`_Payment via UPI: ${UPI_ID}_`)).toBe(true)
  })
})

// WP-V2-02 additions (§12.6 Payment ID line, §12.5 upiId override). The
// existing assertions above double as the proof that omitting paymentRef and
// upiId keeps the V1 output byte-identical.
describe('buildOrderMessage — V2 payment fields', () => {
  it('adds the *Payment ID:* line directly after the order line (§12.6)', () => {
    const message = buildOrderMessage({
      orderCode: 'HH-00042',
      paymentRef: 'PAY-HH-00042',
      ...baseInput,
    })
    expect(message).toBe(
      '🧕 *New Order — Hijab Haven*\n' +
        '\n' +
        '*Order:* HH-00042\n' +
        '*Payment ID:* PAY-HH-00042\n' +
        '*Customer:* Fatima Shaikh\n' +
        '*WhatsApp:* 9876543210\n' +
        '*Address:* 12 Rose Street, Vashi, Navi Mumbai - 400703\n' +
        '\n' +
        '*Items:*\n' +
        '• Pearl Chiffon Hijab × 2 = ₹1198\n' +
        '• Hijab Pin Set × 1 = ₹199\n' +
        '\n' +
        '*Total: ₹1397*\n' +
        '\n' +
        '_Payment via UPI: 9820517390@ptyes_'
    )
  })

  it('omits the Payment ID line when paymentRef is null (§9.4 continuity path)', () => {
    const withNull = buildOrderMessage({ orderCode: null, paymentRef: null, ...baseInput })
    const without = buildOrderMessage({ orderCode: null, ...baseInput })
    expect(withNull).toBe(without)
    expect(withNull).not.toContain('*Payment ID:*')
  })

  it('uses the settings-driven upiId when provided (§12.5)', () => {
    const message = buildOrderMessage({ orderCode: 'HH-00042', upiId: 'owner@upi', ...baseInput })
    expect(message.endsWith('_Payment via UPI: owner@upi_')).toBe(true)
  })

  it('falls back to the baked-in UPI_ID when upiId is empty (§9.4)', () => {
    const message = buildOrderMessage({ orderCode: 'HH-00042', upiId: '', ...baseInput })
    expect(message.endsWith(`_Payment via UPI: ${UPI_ID}_`)).toBe(true)
  })
})

describe('waLink', () => {
  it('builds the wa.me deep link with the encoded message', () => {
    const url = waLink(OWNER_WA, 'Hello world')
    expect(url).toBe('https://wa.me/919820517390?text=Hello%20world')
  })

  it('percent-encodes newlines, ampersands, emoji, and asterisk-safe chars', () => {
    const message = 'Line 1\nLine 2 & more 🧕 *bold*'
    const url = waLink('919820517390', message)
    expect(url).toContain('%0A') // newline
    expect(url).toContain('%26') // ampersand — must not split the query string
    expect(url).not.toContain('\n')
    expect(url.split('?text=')[1]).not.toContain('&')
    expect(decodeURIComponent(url.split('?text=')[1])).toBe(message)
  })

  it('round-trips the full §6.1 order message through URL encoding', () => {
    const message = buildOrderMessage({ orderCode: 'HH-00042', ...baseInput })
    const url = waLink(OWNER_WA, message)
    expect(url.startsWith(`https://wa.me/${OWNER_WA}?text=`)).toBe(true)
    expect(decodeURIComponent(url.slice(`https://wa.me/${OWNER_WA}?text=`.length))).toBe(message)
  })

  it('handles an empty message (broadcast "Message" buttons pass empty text)', () => {
    expect(waLink('919876543210', '')).toBe('https://wa.me/919876543210?text=')
  })
})
