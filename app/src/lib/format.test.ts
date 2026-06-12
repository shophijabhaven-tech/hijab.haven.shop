import { describe, expect, it } from 'vitest'
import { formatDate, inr } from './format'

// WP-12 unit tests — lock in en-IN currency grouping and date rendering.

describe('inr', () => {
  it('formats zero', () => {
    expect(inr(0)).toBe('₹0')
  })

  it('formats a thousands value with en-IN grouping', () => {
    expect(inr(1198)).toBe('₹1,198')
  })

  it('formats one lakh with Indian digit grouping (2-2-3)', () => {
    expect(inr(100000)).toBe('₹1,00,000')
  })

  it('formats a crore-scale value with Indian grouping', () => {
    expect(inr(12345678)).toBe('₹1,23,45,678')
  })

  it('rounds to whole rupees (no decimals)', () => {
    expect(inr(1198.4)).toBe('₹1,198')
    expect(inr(1198.5)).toBe('₹1,199')
  })

  it('formats small single-digit amounts', () => {
    expect(inr(7)).toBe('₹7')
  })
})

describe('formatDate', () => {
  it('renders an ISO timestamp as "11 Jun 2026"', () => {
    expect(formatDate('2026-06-11T10:30:00.000Z')).toBe('11 Jun 2026')
  })

  it('renders a date-only ISO string', () => {
    expect(formatDate('2025-01-02')).toBe('2 Jan 2025')
  })

  it('returns the raw input when the date is unparseable', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })

  it('returns the raw input for an empty string', () => {
    expect(formatDate('')).toBe('')
  })
})
