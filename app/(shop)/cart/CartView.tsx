'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Minus, Plus, Trash2 } from 'lucide-react'
import MediaImage from '@/components/media/MediaImage'
import { formatPrice } from '@/lib/format'
import { itemsParam, removeFromCart, setCartQuantity, type CartItem } from '@/lib/cart'
import { readCart, writeCart } from '@/lib/cart-client'
import type { CheckoutEntry } from '@/lib/data/checkout'
import { lineTotal, stepQuantity } from '@/lib/units/quantity'
import { formatQuantity, perUnit } from '@/lib/units/registry'

/**
 * The cart page. The browser knows which sizes and how many; names, prices and stock are fetched fresh from the
 * shop each time, and anything no longer for sale is taken out of the cart with a note.
 */
export default function CartView() {
  const [entries, setEntries] = useState<CheckoutEntry[] | null>(null)
  const [currency, setCurrency] = useState('PKR')
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async (cart: CartItem[]) => {
    if (cart.length === 0) { setEntries([]); return }
    try {
      const r = await fetch('/api/cart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: cart }) })
      const d = await r.json()
      if (!r.ok) { setNote(d.error ?? 'Could not load your cart.'); setEntries([]); return }
      const fresh = d.entries as CheckoutEntry[]
      setCurrency(d.currency); setEntries(fresh)
      if (d.dropped > 0) setNote(`${d.dropped} item${d.dropped === 1 ? ' is' : 's are'} no longer available and ${d.dropped === 1 ? 'was' : 'were'} removed from your cart.`)
      // Keep the stored cart in step with what the shop says is possible (removed items, lowered quantities).
      const synced = fresh.map((e) => ({ variantId: e.line.variantId, quantity: e.quantity }))
      if (JSON.stringify(synced) !== JSON.stringify(cart)) writeCart(synced)
    } catch { setNote('We could not reach the shop. Check your connection and try again.'); setEntries([]) }
  }, [])
  useEffect(() => { void load(readCart()) }, [load])

  const change = (variantId: string, quantity: number) => {
    setEntries((all) => all && all.map((e) => (e.line.variantId === variantId ? { ...e, quantity } : e)))
    writeCart(setCartQuantity(readCart(), variantId, quantity))
  }
  const remove = (variantId: string) => { setEntries((all) => all && all.filter((e) => e.line.variantId !== variantId)); writeCart(removeFromCart(readCart(), variantId)) }

  if (entries === null) return <p className="py-16 text-center text-gray-500" aria-busy="true">Loading your cart…</p>
  if (entries.length === 0) {
    return (
      <div className="py-16 text-center">
        {note && <p role="status" className="mx-auto mb-6 max-w-md rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{note}</p>}
        <p className="text-lg text-gray-600">Your cart is empty.</p>
        <Link href="/shop" className="mt-6 inline-flex rounded-[var(--r-btn,0.75rem)] bg-brand-700 px-7 py-3.5 font-semibold text-white hover:bg-brand-800">Browse the shop</Link>
      </div>
    )
  }
  const subtotal = entries.reduce((sum, e) => sum + lineTotal(e.line.unitPrice, e.quantity, e.line.unitCode), 0)
  const href = `/checkout?items=${encodeURIComponent(itemsParam(entries.map((e) => ({ variantId: e.line.variantId, quantity: e.quantity }))))}`
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_340px]">
      <div>
        {note && <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{note}</p>}
        <ul className="divide-y divide-gray-100 rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          {entries.map(({ line, rule, quantity }) => (
            <li key={line.variantId} className="flex gap-4 p-4">
              <Link href={`/product/${line.productSlug}`} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-brand-50">
                {line.imageUrl && <MediaImage src={line.imageUrl} width={200} alt="" fill sizes="96px" className="object-cover" />}
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/product/${line.productSlug}`} className="font-semibold text-gray-900 hover:text-brand-700">{line.productName}</Link>
                <p className="text-sm text-gray-500">{line.variantLabel} · {formatPrice(line.unitPrice, currency)}{perUnit(line.unitCode) ? ` ${perUnit(line.unitCode)}` : ''}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center rounded-lg border" role="group" aria-label={`Quantity of ${line.productName}`}>
                    <button type="button" aria-label="Decrease quantity" disabled={quantity <= rule.min} onClick={() => change(line.variantId, stepQuantity(rule, quantity, -1))} className="flex h-9 w-9 items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40"><Minus className="h-4 w-4" aria-hidden /></button>
                    <span className="flex h-9 min-w-9 items-center justify-center px-1 text-sm font-bold" aria-live="polite">{rule.measured || rule.unit ? formatQuantity(quantity, line.unitCode) : quantity}</span>
                    <button type="button" aria-label="Increase quantity" disabled={quantity >= stepQuantity(rule, Number.MAX_SAFE_INTEGER, 1)} onClick={() => change(line.variantId, stepQuantity(rule, quantity, 1))} className="flex h-9 w-9 items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40"><Plus className="h-4 w-4" aria-hidden /></button>
                  </div>
                  <button type="button" onClick={() => remove(line.variantId)} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-red-700"><Trash2 className="h-4 w-4" aria-hidden />Remove</button>
                </div>
              </div>
              <p className="shrink-0 font-semibold text-gray-900">{formatPrice(lineTotal(line.unitPrice, quantity, line.unitCode), currency)}</p>
            </li>
          ))}
        </ul>
      </div>
      <aside className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 lg:sticky lg:top-24" aria-label="Cart total">
        <div className="flex justify-between text-lg font-bold text-gray-900"><span>Subtotal</span><span>{formatPrice(subtotal, currency)}</span></div>
        <p className="mt-1 text-sm text-gray-500">Delivery and any discount code are added at checkout.</p>
        <Link href={href} className="mt-5 block rounded-[var(--r-btn,0.75rem)] bg-brand-700 px-6 py-3.5 text-center font-semibold text-white hover:bg-brand-800">Checkout</Link>
        <Link href="/shop" className="mt-3 block text-center text-sm font-medium text-brand-700 hover:underline">Continue shopping</Link>
      </aside>
    </div>
  )
}
