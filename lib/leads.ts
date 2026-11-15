/**
 * UNFINISHED CHECKOUTS: the rules (pure). When a customer has typed their name and phone at checkout and moved on
 * to payment, the shop remembers what they were buying. If no order follows, the owner can send a friendly
 * WhatsApp message. An order from the same number closes it.
 */
import { cleanCart, type CartItem } from '@/lib/cart'
import { normalizePkMobile } from '@/lib/phone'

/** How long to wait before a started checkout counts as left behind (people take a while to pay). */
export const LEAD_WAIT_MINUTES = 30
export const LEAD_KEEP_DAYS = 30

export interface LeadInput { phone: string; name: string; items: CartItem[] }
export function parseLead(raw: unknown): LeadInput | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const phone = typeof o.phone === 'string' ? normalizePkMobile(o.phone.trim()) : null
  const name = (typeof o.name === 'string' ? o.name : '').replace(/[\u0000-\u001f\u007f<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  const items = cleanCart(o.items)
  return phone && name.length >= 2 && items.length > 0 ? { phone, name, items } : null
}
export interface LeadLine { variantId: string; quantity: number; name: string; label: string; price: number }
/** The stored lines, read back safely (they are JSON in the database). */
export function readLeadLines(raw: unknown): LeadLine[] {
  return (Array.isArray(raw) ? raw : []).flatMap((x) => {
    const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : {}
    return typeof o.variantId === 'string' && typeof o.quantity === 'number' && typeof o.name === 'string' ? [{ variantId: o.variantId, quantity: o.quantity, name: o.name, label: typeof o.label === 'string' ? o.label : '', price: typeof o.price === 'number' ? o.price : 0 }] : []
  }).slice(0, 20)
}
/** The WhatsApp message the owner sends (from their own WhatsApp) to bring the customer back. */
export function leadMessage(o: { name: string; store: string; first: string; more: number; url: string | null }): string {
  const hi = o.name.trim().split(/\s+/)[0] || 'there'
  return `Assalam o Alaikum ${hi}, this is ${o.store}. You were ordering ${o.first}${o.more > 0 ? ` and ${o.more} more item${o.more === 1 ? '' : 's'}` : ''} but the order was not completed. Can we help?${o.url ? ` You can finish it here: ${o.url}` : ''}`
}
