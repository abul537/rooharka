'use client'

import { useMemo, useState, useTransition } from 'react'
import { ringUpSaleAction, type SaleOutcome } from '@/app/admin/(panel)/pos/actions'
import { MAX_SPLIT_PARTS, POS_METHOD_LABEL, POS_PAYMENT_METHODS, cashChange, posRule, saleTotals, scanMatch, splitPayments, type PosPaymentMethod } from '@/lib/pos/rules'
import { isBuyable, lineTotal, snapQuantity, stepQuantity } from '@/lib/units/quantity'
import { formatQuantity, fromBase, parseAmount, perUnit, toBase } from '@/lib/units/registry'
import { formatPrice } from '@/lib/format'
import { inputCls, primaryBtn } from '@/components/admin/ui'

/** stock is in base units for measured products (grams, millilitres ...), null when stock is not tracked. */
export interface PosVariant { id: string; name: string; label: string; sku: string; barcode?: string | null; price: number; stock: number | null; type: string; unitCode: string | null; qtyMin: number | null; qtyStep: number | null }
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`)
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/,/g, '')))

/** The counter-sale screen: find items, build the basket, take payment, print a receipt. The server re-prices and re-checks everything. */
export default function PosSale({ items, truncated }: { items: PosVariant[]; truncated: boolean }) {
  const [q, setQ] = useState('')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [discount, setDiscount] = useState('')
  const [method, setMethod] = useState<PosPaymentMethod>('CASH')
  const [tendered, setTendered] = useState('')
  // Split payment: other ways of paying part of the total. The main method above pays the rest.
  const [parts, setParts] = useState<{ method: PosPaymentMethod; amount: string }[]>([])
  const [scanNote, setScanNote] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [key, setKey] = useState(newKey)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Extract<SaleOutcome, { ok: true }> | null>(null)
  const [pending, start] = useTransition()

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (t ? items.filter((i) => `${i.name} ${i.label} ${i.sku} ${i.barcode ?? ''}`.toLowerCase().includes(t)) : items).slice(0, 40)
  }, [items, q])
  const ruleOf = (v: PosVariant) => posRule(v, v.stock)
  const lines = Object.entries(cart).map(([id, quantity]) => ({ ...byId.get(id)!, quantity, unitPrice: byId.get(id)!.price }))
  const d = num(discount)
  const totals = saleTotals(lines, d !== null && Number.isFinite(d) && d >= 0 ? d : 0)
  const total = totals.ok ? totals.value.total : 0
  const tend = num(tendered)
  const cleanParts = parts.map((p) => ({ method: p.method, amount: num(p.amount) ?? 0 })).filter((p) => Number.isFinite(p.amount) && p.amount > 0)
  const paid = splitPayments(total, method, cleanParts)
  const rest = paid.ok ? paid.rest : total
  const partsProblem = parts.length > 0 && (cleanParts.length !== parts.length || new Set([method, ...parts.map((p) => p.method)]).size !== parts.length + 1)
    ? 'Each part needs an amount above zero and a different way of paying.' : !paid.ok ? paid.error : null
  const change = method === 'CASH' && tend !== null && Number.isFinite(tend) ? cashChange(rest, tend) : null
  const freeMethod = () => POS_PAYMENT_METHODS.find((m) => m !== method && !parts.some((p) => p.method === m)) ?? 'CARD'
  // A barcode scanner types the code and presses Enter: add the matching item and get ready for the next scan.
  const onScan = () => {
    const hit = scanMatch(items, shown, q)
    if (!hit) { setScanNote(q.trim() ? `No single item matches “${q.trim()}”.` : null); return }
    if (!isBuyable(ruleOf(hit))) { setScanNote(`“${hit.name}” is out of stock.`); return }
    add(hit); setQ(''); setScanNote(`Added: ${hit.name} ${hit.label}`)
  }

  // Quantities always go through the product's rule: whole units, or steps of a kg / litre / metre.
  const setQty = (id: string, qty: number) => setCart((c) => {
    const v = byId.get(id)!
    const next = { ...c }
    if (qty <= 0) delete next[id]; else next[id] = snapQuantity(ruleOf(v), qty)
    return next
  })
  const less = (v: PosVariant) => { const r = ruleOf(v), q = cart[v.id]; if (q <= r.min) setQty(v.id, 0); else setQty(v.id, stepQuantity(r, q, -1)) }
  const add = (v: PosVariant) => { const r = ruleOf(v); if (!isBuyable(r)) return; setQty(v.id, cart[v.id] ? stepQuantity(r, cart[v.id], 1) : r.min); setError(null) }

  const reset = () => { setCart({}); setDiscount(''); setTendered(''); setName(''); setPhone(''); setMethod('CASH'); setParts([]); setScanNote(null); setError(null); setDone(null); setKey(newKey()) }

  const submit = () => {
    setError(null)
    start(async () => {
      const r = await ringUpSaleAction({
        items: lines.map((l) => ({ variantId: l.id, quantity: l.quantity })), discount, paymentMethod: method,
        tendered: method === 'CASH' ? tendered : '', customerName: name, customerPhone: phone, idempotencyKey: key, split: cleanParts,
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
        <label className="block text-xs text-slate-500 mb-1" htmlFor="pos-q">Scan a barcode, or find an item (name, size or code)</label>
        <input id="pos-q" value={q} onChange={(e) => { setQ(e.target.value); setScanNote(null) }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onScan() } }} autoFocus autoComplete="off" placeholder="Scan or type, then Enter" className={inputCls} />
        {scanNote && <p role="status" className="mt-1 text-xs text-slate-600">{scanNote}</p>}
        {items.length === 0 && <p className="mt-3 text-sm text-slate-600">No active products yet. Add products first.</p>}
        <ul className="mt-3 grid sm:grid-cols-2 gap-2">
          {shown.map((v) => {
            const out = !isBuyable(ruleOf(v))
            return (
              <li key={v.id}>
                <button type="button" onClick={() => add(v)} disabled={out} className="w-full text-left rounded-lg border border-slate-200 p-3 hover:bg-slate-50 disabled:opacity-50">
                  <span className="block text-sm font-medium">{v.name} <span className="font-normal text-slate-500">{v.label}</span></span>
                  <span className="block text-sm">{formatPrice(v.price)}{perUnit(v.unitCode) && ` ${perUnit(v.unitCode)}`} <span className="text-xs text-slate-500">{out ? 'out of stock' : v.stock !== null ? `${formatQuantity(v.stock, v.unitCode)} in stock` : ''}</span></span>
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
            {lines.map((l) => {
              const r = ruleOf(l)
              return (
                <li key={l.id} className="py-2 flex items-center justify-between gap-2">
                  <span className="min-w-0"><span className="block truncate">{l.name} <span className="text-slate-500">{l.label}</span></span><span className="text-xs text-slate-500">{formatPrice(l.unitPrice)}{perUnit(l.unitCode) ? ` ${perUnit(l.unitCode)}` : ' each'}</span></span>
                  <span className="flex items-center gap-1 shrink-0">
                    <button type="button" aria-label={`Less ${l.name}`} onClick={() => less(l)} className="w-8 h-8 rounded border border-slate-300">−</button>
                    {r.measured ? (
                      <input aria-label={`Amount of ${l.name} in ${l.unitCode}`} inputMode="decimal" className="w-16 text-center rounded border border-slate-300 py-1"
                        value={typed[l.id] ?? String(fromBase(l.quantity, l.unitCode!))}
                        onChange={(e) => setTyped((t) => ({ ...t, [l.id]: e.target.value }))}
                        onBlur={() => { const n = parseAmount(typed[l.id] ?? '', l.unitCode!); if (n !== null) setQty(l.id, toBase(n, l.unitCode!)); setTyped((t) => { const { [l.id]: _, ...rest } = t; return rest }) }} />
                    ) : <span className="w-8 text-center">{l.quantity}</span>}
                    {r.measured && <span className="text-xs text-slate-500">{l.unitCode}</span>}
                    <button type="button" aria-label={`More ${l.name}`} onClick={() => setQty(l.id, stepQuantity(r, l.quantity, 1))} className="w-8 h-8 rounded border border-slate-300">+</button>
                    <span className="w-24 text-right">{formatPrice(lineTotal(l.unitPrice, l.quantity, l.unitCode))}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-500">Discount (Rs.)<input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" className={`${inputCls} mt-1`} /></label>
          <label className="text-xs text-slate-500">Paid by
            <select value={method} onChange={(e) => setMethod(e.target.value as PosPaymentMethod)} className={`${inputCls} mt-1`}>{POS_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{POS_METHOD_LABEL[m]}</option>)}</select>
          </label>
          <div className="col-span-2 space-y-2">
            {parts.map((p, i) => (
              <div key={i} className="flex items-end gap-2">
                <label className="text-xs text-slate-500 flex-1">Part paid by
                  <select value={p.method} onChange={(e) => setParts((all) => all.map((x, k) => (k === i ? { ...x, method: e.target.value as PosPaymentMethod } : x)))} className={`${inputCls} mt-1`}>{POS_PAYMENT_METHODS.filter((m) => m !== method).map((m) => <option key={m} value={m}>{POS_METHOD_LABEL[m]}</option>)}</select>
                </label>
                <label className="text-xs text-slate-500 flex-1">Amount (Rs.)<input value={p.amount} onChange={(e) => setParts((all) => all.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} inputMode="decimal" className={`${inputCls} mt-1`} /></label>
                <button type="button" onClick={() => setParts((all) => all.filter((_, k) => k !== i))} className="mb-2 text-xs underline text-red-700" aria-label="Remove this part">Remove</button>
              </div>
            ))}
            {parts.length < MAX_SPLIT_PARTS && lines.length > 0 && <button type="button" onClick={() => setParts((all) => [...all, { method: freeMethod(), amount: '' }])} className="text-xs underline text-slate-700">{parts.length ? 'Add another way of paying' : 'Split the payment (e.g. part card, part cash)'}</button>}
            {parts.length > 0 && !partsProblem && <p className="text-xs text-slate-600">Rest by {POS_METHOD_LABEL[method]}: <strong>{formatPrice(rest)}</strong></p>}
            {partsProblem && <p className="text-xs text-red-700">{partsProblem}</p>}
          </div>
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
        <button type="button" onClick={submit} disabled={pending || lines.length === 0 || !totals.ok || !!partsProblem || (change !== null && !change.ok)} className={`${primaryBtn} w-full py-3 text-base`}>{pending ? 'Saving…' : `Complete sale ${totals.ok && lines.length ? formatPrice(total) : ''}`}</button>
        {lines.length > 0 && <button type="button" onClick={reset} className="w-full text-sm underline text-slate-600">Clear basket</button>}
      </section>
    </div>
  )
}
