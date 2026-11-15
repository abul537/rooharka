/**
 * Tells the advertising pixels the store owner connected (Meta, TikTok, Google) that something happened, using
 * each one's own name for it. Safe to call anywhere in the browser: with no pixel connected it does nothing, and
 * a pixel that fails can never disturb the shop.
 */
export type PixelEvent = 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase'
export interface PixelData { id?: string; name?: string; value?: number; currency?: string; orderId?: string }

const TIKTOK: Record<PixelEvent, string> = { ViewContent: 'ViewContent', AddToCart: 'AddToCart', InitiateCheckout: 'InitiateCheckout', Purchase: 'CompletePayment' }
const GOOGLE: Record<PixelEvent, string> = { ViewContent: 'view_item', AddToCart: 'add_to_cart', InitiateCheckout: 'begin_checkout', Purchase: 'purchase' }

export function track(event: PixelEvent, d: PixelData = {}): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { fbq?: (...a: unknown[]) => void; ttq?: { track: (...a: unknown[]) => void }; gtag?: (...a: unknown[]) => void }
  const value = typeof d.value === 'number' && Number.isFinite(d.value) ? Math.round(d.value) : undefined
  const currency = d.currency ?? 'PKR'
  try { w.fbq?.('track', event, { content_ids: d.id ? [d.id] : undefined, content_name: d.name, content_type: 'product', value, currency }) } catch { /* ignore */ }
  try { w.ttq?.track(TIKTOK[event], { content_id: d.id, content_name: d.name, content_type: 'product', value, currency }) } catch { /* ignore */ }
  try { w.gtag?.('event', GOOGLE[event], { currency, value, transaction_id: d.orderId, items: d.id ? [{ item_id: d.id, item_name: d.name }] : undefined }) } catch { /* ignore */ }
}
