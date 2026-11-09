'use client'

import { useMemo, useState, useTransition } from 'react'
import { ringUpSaleAction, type SaleOutcome } from '@/app/admin/(panel)/pos/actions'
import { POS_METHOD_LABEL, POS_PAYMENT_METHODS, cashChange, round2, saleTotals, type PosPaymentMethod } from '@/lib/pos/rules'
import { formatPrice } from '@/lib/format'
import { inputCls, primaryBtn } from '@/components/admin/ui'

export interface PosVariant { id: string; name: string; label: string; sku: string; price: number; stock: number | null }
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`)
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/,/g, '')))

/** The counter-sale screen: find items, build the basket, take payment, print a receipt. The server re-prices and re-checks everything. */
export default function PosSale({ items, truncated }: { items: PosVariant[]; truncated: boolean }) {
  const [q, setQ] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [discount, setDiscount] = useState('')
  const [method, setMethod] = useState<PosPaymentMethod>('CASH')
  const [tendered, setTendered] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [key, setKey] = useState(newKey)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Extract<SaleOutcome, { ok: true }> | null>(null)
  const [pending, start] = useTransition()

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (t ? items.filter((i) => `${i.name} ${i.label} ${i.sku}`.toLowerCase().includes(t)) : items).slice(0, 40)
  }, [items, q])
  const lines = Object.entries(cart).map(([id, quantity]) => ({ ...byId.get(id)!, quantity, unitPrice: byId.get(id)!.price }))
  const d = num(discount)
  const totals = saleTotals(lines, d !== null && Number.isFinite(d) && d >= 0 ? d : 0)
  const total = totals.ok ? totals.value.total : 0
  const tend = num(tendered)
  const change = method === 'CASH' && tend !== null && Number.isFinite(tend) ? cashChange(total, tend) : null

  const setQty = (id: string, qty: number) => setCart((c) => {
    const max = byId.get(id)?.stock ?? 999
    const next = { ...c }
    if (qty <= 0) delete next[id]; else next[id] = Math.min(qty, max, 999)
    return next
  })
  const add = (v: PosVariant) => { if (v.stock !== null && v.stock <= 0) return; setQty(v.id, (cart[v.id] ?? 0) + 1); setError(null) }

  const reset = () => { setCart({}); setDiscount(''); setTendered(''); setName(''); setPhone(''); setMethod('CASH'); setError(null); setDone(null); setKey(newKey()) }

  const submit = () => {
    setError(null)
    start(async () => {
      const r = await ringUpSaleAction({
        items: lines.map((l) => ({ variantId: l.id, quantity: l.quantity })), discount, paymentMethod: method,
        tendered: method === 'CASH' ? tendered : '', customerName: name, customerPhone: phone, idempotencyKey: key,
      })
      if (r.ok) setDone(r); else setError(r.error)
    })
  }

  if (done) {
    return (
      <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-6 space-y-3 max-w-xl">
        <p className="text-lg font-semibold">Sale #{done.number} saved: {formatPrice(done.total)}</p>
        {done.change > 0 && <p className="text-2xl font-bold">Give change: {formatPrice(done.change)}</p>}
        <div className="flex gap-3">
          <a href={`/admin/pos/receipt/${done.orderId}`} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-medium">Print receipt</a>
          <button onClick={reset} className={primaryBtn}>New sale</button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6">
      <section className="rounded-xl bg-white border border-slate-200 p-4">
        <label className="block text-xs text-slate-500 mb-1" htmlFor="pos-q">Find an item (name, size or code)</label>
        <input id="pos-q" value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Type to search" className={inputCls} />
        {items.length === 0 && <p className="mt-3 text-sm text-slate-600">No active products yet. Add products first.</p>}
        <ul className="mt-3 grid sm:grid-cols-2 gap-2">
          {shown.map((v) => {
            const out = v.stock !== null && v.stock <= 0
            return (
              <li key={v.id}>
                <button type="button" onClick={() => add(v)} disabled={out} className="w-full text-left rounded-lg border border-slate-200 p-3 hover:bg-slate-50 disabled:opacity-50">
                  <span className="block text-sm font-medium">{v.name} <span className="font-normal text-slate-500">{v.label}</span></span>
                  <span className="block text-sm">{formatPrice(v.price)} <span className="text-xs text-slate-500">{out ? 'out of stock' : v.stock !== null ? `${v.stock} in stock` : ''}</span></span>
                </button>
              </li>
            )
          })}
        </ul>
        {truncated && <p className="mt-2 text-xs text-slate-500">Showing the first items only: search to find the others.</p>}
      </section>

      <section className="rounded-xl bg-white border border-slate-200 p-4 space-y-4">
        <h2 className="font-semibold">Basket</h2>
        {lines.length === 0 ? <p className="text-sm text-slate-500">Tap an item to add it.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {lines.map((l) => (
              <li key={l.id} className="py-2 flex items-center justify-between gap-2">
                <span className="min-w-0"><span className="block truncate">{l.name} <span className="text-slate-500">{l.label}</span></span><span className="text-xs text-slate-500">{formatPrice(l.unitPrice)} each</span></span>
                <span className="flex items-center gap-1 shrink-0">
                  <button type="button" aria-label={`One less ${l.name}`} onClick={() => setQty(l.id, l.quantity - 1)} className="w-8 h-8 rounded border border-slate-300">−</button>
                  <span className="w-8 text-center">{l.quantity}</span>
                  <button type="button" aria-label={`One more ${l.name}`} onClick={() => setQty(l.id, l.quantity + 1)} className="w-8 h-8 rounded border border-slate-300">+</button>
                  <span className="w-24 text-right">{formatPrice(round2(l.unitPrice * l.quantity))}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-500">Discount (Rs.)<input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" className={`${inputCls} mt-1`} /></label>
          <label className="text-xs text-slate-500">Paid by
            <select value={method} onChange={(e) => setMethod(e.target.value as PosPaymentMethod)} className={`${inputCls} mt-1`}>{POS_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{POS_METHOD_LABEL[m]}</option>)}</select>
          </label>
          {method === 'CASH' && <label className="text-xs text-slate-500 col-span-2">Cash received (Rs.), empty if exact<input value={tendered} onChange={(e) => setTendered(e.target.value)} inputMode="decimal" className={`${inputCls} mt-1`} /></label>}
          <label className="text-xs text-slate-500">Customer name (optional)<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={`${inputCls} mt-1`} /></label>
          <label className="text-xs text-slate-500">Mobile (optional, keeps their history)<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={`${inputCls} mt-1`} /></label>
        </div>

        <div className="border-t border-slate-100 pt-3 space-y-1">
          <p className="flex justify-between text-sm"><span>Items</span><span>{totals.ok ? formatPrice(totals.value.subtotal) : '-'}</span></p>
          {totals.ok && totals.value.discount > 0 && <p className="flex justify-between text-sm"><span>Discount</span><span>− {formatPrice(totals.value.discount)}</span></p>}
          <p className="flex justify-between text-xl font-bold"><span>Total</span><span>{totals.ok ? formatPrice(total) : '-'}</span></p>
          {!totals.ok && <p className="text-sm text-red-700">{totals.error}</p>}
          {change && (change.ok ? <p className="flex justify-between text-sm"><span>Change to give</span><span className="font-semibold">{formatPrice(change.change)}</span></p> : <p className="text-sm text-red-700">{change.error}</p>)}
        </div>

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="button" onClick={submit} disabled={pending || lines.length === 0 || !totals.ok || (change !== null && !change.ok)} className={`${primaryBtn} w-full py-3 text-base`}>{pending ? 'Saving…' : `Complete sale ${totals.ok && lines.length ? formatPrice(total) : ''}`}</button>
        {lines.length > 0 && <button type="button" onClick={reset} className="w-full text-sm underline text-slate-600">Clear basket</button>}
      </section>
    </div>
  )
}
