/**
 * THE SHOPPING CART: the rules (pure). The cart lives in the customer's own browser (no account, no cookie sent
 * to the server) as a short list of "which size, how many". Names, prices and stock are ALWAYS read from the
 * database when the cart or the checkout is shown, so a cart can never carry an old price.
 */
export interface CartItem { variantId: string; quantity: number }
export const CART_KEY = 'rk_cart_v1'
export const CART_EVENT = 'rk-cart-change'
export const MAX_CART_LINES = 20
const ID = /^[A-Za-z0-9_-]{8,40}$/
const qty = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 10_000_000 ? n : null)

/** Whatever is in storage or a web address, made safe: real-looking ids, whole positive quantities, no duplicates, at most 20 lines. */
export function cleanCart(raw: unknown): CartItem[] {
  const out: CartItem[] = []
  for (const it of Array.isArray(raw) ? raw : []) {
    const o = it && typeof it === 'object' ? (it as Record<string, unknown>) : {}
    const q = qty(o.quantity)
    if (typeof o.variantId !== 'string' || !ID.test(o.variantId) || q === null || out.some((x) => x.variantId === o.variantId)) continue
    out.push({ variantId: o.variantId, quantity: q })
    if (out.length === MAX_CART_LINES) break
  }
  return out
}
export const parseCart = (text: string | null | undefined): CartItem[] => { try { return cleanCart(JSON.parse(text ?? '[]')) } catch { return [] } }

/** Adds to the cart; the same size again raises its quantity. Returns the new cart and whether there was room. */
export function addToCart(cart: CartItem[], variantId: string, quantity: number): { cart: CartItem[]; added: boolean } {
  if (!ID.test(variantId) || qty(quantity) === null) return { cart, added: false }
  const at = cart.findIndex((x) => x.variantId === variantId)
  if (at >= 0) return { cart: cart.map((x, i) => (i === at ? { ...x, quantity: Math.min(x.quantity + quantity, 10_000_000) } : x)), added: true }
  if (cart.length >= MAX_CART_LINES) return { cart, added: false }
  return { cart: [...cart, { variantId, quantity }], added: true }
}
export const setCartQuantity = (cart: CartItem[], variantId: string, quantity: number) => (qty(quantity) === null ? cart : cart.map((x) => (x.variantId === variantId ? { ...x, quantity } : x)))
export const removeFromCart = (cart: CartItem[], variantId: string) => cart.filter((x) => x.variantId !== variantId)

/** The cart as it travels in the checkout address: "id:2,id:1". */
export const itemsParam = (cart: CartItem[]) => cart.map((x) => `${x.variantId}:${x.quantity}`).join(',')
/**
 * Reads the checkout address: the cart form (?items=id:2,id:1) or the single-product form the "Order now"
 * button uses (?variant=id&qty=2).
 */
export function readItems(sp: { items?: string | string[]; variant?: string | string[]; qty?: string | string[] }): CartItem[] {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
  if (one(sp.items)) return cleanCart(one(sp.items).slice(0, 1500).split(',').map((part) => { const [variantId, q] = part.split(':'); return { variantId, quantity: /^\d{1,8}$/.test(q ?? '') ? Number(q) : 1 } }))
  return one(sp.variant) ? cleanCart([{ variantId: one(sp.variant), quantity: /^\d{1,8}$/.test(one(sp.qty)) ? Number(one(sp.qty)) : 1 }]) : []
}
