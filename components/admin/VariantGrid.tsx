'use client'

import { useMemo, useState } from 'react'
import { margin } from '@/lib/admin/product-extras'
import { rowWindow } from '@/lib/admin/window'
import { formatPrice } from '@/lib/format'
import { inputCls } from '@/components/admin/ui'

export interface GridRow {
  id: string; label: string; badge: string; price: string; compareAt: string; cost: string
  /** Stock as shown (in the selling unit) and the stored number when the page opened: the server applies the difference. */
  stock: string; stockShown: string; stockWas: number
  sku: string; barcode: string; weight: string; image: string; track: boolean; active: boolean; fromOptions: boolean
}
type Field = 'label' | 'badge' | 'price' | 'compareAt' | 'cost' | 'stock' | 'sku' | 'barcode' | 'weight' | 'image'
const BULK: { key: Field; label: string }[] = [{ key: 'price', label: 'Price' }, { key: 'compareAt', label: 'Crossed-out' }, { key: 'cost', label: 'Cost' }, { key: 'stock', label: 'Stock' }, { key: 'weight', label: 'Weight' }]

const ROW_HEIGHT = 92 // px; every row is drawn at exactly this height so the scroll arithmetic is exact
const VIEW_HEIGHT = 560
const WINDOW_FROM = 16 // shorter tables are simply drawn whole

/**
 * The variants table: edit price, crossed-out price, cost, stock, SKU, barcode, weight and photo for every variant
 * in one place, with "set for all" boxes on top. With many variants only the rows on screen are real inputs
 * (the rest travel with the form as hidden values), so 100 variants do not slow typing down.
 */
export default function VariantGrid({ rows: initial, simple, measured, unit, weightUnit, images, defaultId, editable, canDelete }: {
  rows: GridRow[]; simple: boolean; measured: boolean; unit: string | null; weightUnit: string
  images: { id: string; label: string }[]; defaultId: string; editable: boolean; canDelete: boolean
}) {
  const [rows, setRows] = useState(initial)
  const [def, setDef] = useState(defaultId)
  const [scrollTop, setScrollTop] = useState(0)
  const [bulk, setBulk] = useState<Partial<Record<Field, string>>>({})
  const set = (id: string, patch: Partial<GridRow>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const windowed = rows.length > WINDOW_FROM
  const win = useMemo(() => (windowed ? rowWindow(rows.length, ROW_HEIGHT, scrollTop, VIEW_HEIGHT) : { start: 0, end: rows.length, padTop: 0, padBottom: 0 }), [windowed, rows.length, scrollTop])
  const cols = (simple ? 0 : 1) + 8 + (images.length ? 1 : 0) + (simple ? 0 : 3)

  const applyBulk = () => {
    const entries = Object.entries(bulk).filter(([, v]) => v !== undefined && v !== '') as [Field, string][]
    if (!entries.length) return
    setRows((all) => all.map((r) => ({ ...r, ...Object.fromEntries(entries) })))
    setBulk({})
  }
  const num = measured ? 'decimal' : 'numeric'
  const th = 'font-medium pr-2 pb-1 sticky top-0 bg-white z-10'

  /** Everything the server needs for one variant that is NOT on screen right now. */
  const hidden = (r: GridRow) => (
    <span key={r.id}>
      <input type="hidden" name={`v_${r.id}_label`} value={r.label} /><input type="hidden" name={`v_${r.id}_badge`} value={r.badge} />
      <input type="hidden" name={`v_${r.id}_price`} value={r.price} /><input type="hidden" name={`v_${r.id}_compareAt`} value={r.compareAt} /><input type="hidden" name={`v_${r.id}_cost`} value={r.cost} />
      <input type="hidden" name={`v_${r.id}_stock`} value={r.stock} /><input type="hidden" name={`v_${r.id}_sku`} value={r.sku} /><input type="hidden" name={`v_${r.id}_barcode`} value={r.barcode} />
      <input type="hidden" name={`v_${r.id}_weight`} value={r.weight} />{images.length > 0 && <input type="hidden" name={`v_${r.id}_image`} value={r.image} />}
      {r.track && <input type="hidden" name={`v_${r.id}_track`} value="on" />}{(simple || r.active) && <input type="hidden" name={`v_${r.id}_active`} value="on" />}
    </span>
  )

  return (
    <div>
      {/* Values that never depend on what is on screen. */}
      <input type="hidden" name="defaultVariant" value={simple ? rows[0]?.id ?? '' : def} />
      {rows.map((r) => <span key={r.id}><input type="hidden" name={`v_${r.id}_stockWas`} value={r.stockWas} /><input type="hidden" name={`v_${r.id}_stockShown`} value={r.stockShown} /><input type="hidden" name={`v_${r.id}_trackSent`} value="1" /></span>)}
      {rows.slice(0, win.start).map(hidden)}{rows.slice(win.end).map(hidden)}

      {!simple && editable && rows.length > 1 && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 border border-slate-200 p-3">
          <span className="text-sm font-medium mr-1">Set for all {rows.length} variants:</span>
          {BULK.map((b) => (
            <label key={b.key} className="text-xs text-slate-600">{b.label}{b.key === 'weight' ? ` (${weightUnit})` : ''}
              <input value={bulk[b.key] ?? ''} onChange={(e) => setBulk((x) => ({ ...x, [b.key]: e.target.value }))} inputMode="decimal" className={`${inputCls} !w-24 !py-1 block`} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyBulk() } }} />
            </label>
          ))}
          <button type="button" onClick={applyBulk} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium">Apply to all</button>
          <span className="text-xs text-slate-500">Nothing is saved until you press Save product.</span>
        </div>
      )}

      <div className="overflow-auto -mx-2 px-2" style={windowed ? { maxHeight: VIEW_HEIGHT } : undefined} onScroll={windowed ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined}>
        <table className="w-full text-sm border-separate border-spacing-0" style={{ minWidth: simple ? 860 : 1320 }}>
          <thead className="text-left text-xs text-slate-500">
            <tr>
              {!simple && <th className={th}>Variant</th>}
              <th className={th}>Price</th><th className={th}>Crossed-out</th><th className={th}>Cost</th>
              <th className={th}>In stock{measured && unit ? ` (${unit})` : ''}</th><th className={th}>SKU</th><th className={th}>Barcode</th><th className={th}>Weight ({weightUnit})</th>
              {images.length > 0 && <th className={th}>Photo</th>}
              <th className={th}>Track stock</th>{!simple && <><th className={th}>On sale</th><th className={th}>First</th><th className={th} /></>}
            </tr>
          </thead>
          <tbody>
            {win.padTop > 0 && <tr aria-hidden style={{ height: win.padTop }}><td colSpan={cols} /></tr>}
            {rows.slice(win.start, win.end).map((r) => {
              const m = margin(Number(r.price) || null, r.cost.trim() === '' ? null : Number(r.cost.replace(/,/g, '')))
              const inp = (field: Field, extra = '', mode?: 'decimal' | 'numeric') => (
                <input name={`v_${r.id}_${field}`} value={r[field]} onChange={(e) => set(r.id, { [field]: e.target.value })} inputMode={mode} className={`${inputCls} ${extra}`} aria-label={`${field} of ${r.label}`} />
              )
              return (
                <tr key={r.id} className="align-top" style={{ height: ROW_HEIGHT }}>
                  {!simple && (
                    <td className="pr-2 pt-1">
                      <input name={`v_${r.id}_label`} value={r.label} onChange={(e) => set(r.id, { label: e.target.value })} maxLength={40} className={inputCls} aria-label="Variant name" />
                      <input name={`v_${r.id}_badge`} value={r.badge} onChange={(e) => set(r.id, { badge: e.target.value })} maxLength={30} placeholder="Badge, e.g. Most Popular" className={`${inputCls} mt-1 !py-1 text-xs`} aria-label={`Badge for ${r.label}`} />
                    </td>
                  )}
                  <td className="pr-2 pt-1">{simple && <input type="hidden" name={`v_${r.id}_label`} value={r.label} />}{simple && <input type="hidden" name={`v_${r.id}_active`} value="on" />}{inp('price', '', num)}</td>
                  <td className="pr-2 pt-1">{inp('compareAt', '', num)}</td>
                  <td className="pr-2 pt-1">{inp('cost', '', 'decimal')}{m && <span className={`block text-xs mt-1 whitespace-nowrap ${m.profit < 0 ? 'text-red-700' : 'text-slate-500'}`}>Profit {formatPrice(m.profit)} · {m.marginPct}%</span>}</td>
                  <td className="pr-2 pt-1">{inp('stock', '', num)}</td>
                  <td className="pr-2 pt-1">{inp('sku', 'font-mono uppercase')}</td>
                  <td className="pr-2 pt-1">{inp('barcode', 'font-mono')}</td>
                  <td className="pr-2 pt-1">{inp('weight', '', 'decimal')}</td>
                  {images.length > 0 && (
                    <td className="pr-2 pt-1">
                      <select name={`v_${r.id}_image`} value={r.image} onChange={(e) => set(r.id, { image: e.target.value })} className={inputCls} aria-label={`Photo for ${r.label}`}>
                        <option value="">Main photo</option>{images.map((im) => <option key={im.id} value={im.id}>{im.label}</option>)}
                      </select>
                    </td>
                  )}
                  <td className="pr-2 pt-3 text-center"><input type="checkbox" name={`v_${r.id}_track`} checked={r.track} onChange={(e) => set(r.id, { track: e.target.checked })} className="h-4 w-4" aria-label={`Track stock of ${r.label}`} /></td>
                  {!simple && (
                    <>
                      <td className="pr-2 pt-3 text-center"><input type="checkbox" name={`v_${r.id}_active`} checked={r.active} onChange={(e) => set(r.id, { active: e.target.checked })} className="h-4 w-4" aria-label={`${r.label} on sale`} /></td>
                      <td className="pr-2 pt-3 text-center"><input type="radio" checked={def === r.id} onChange={() => setDef(r.id)} aria-label={`Show ${r.label} first`} /></td>
                      <td className="pt-3">{editable && canDelete && <button type="submit" form={`rm-${r.id}`} className="text-xs text-red-700 underline">Delete</button>}</td>
                    </>
                  )}
                </tr>
              )
            })}
            {win.padBottom > 0 && <tr aria-hidden style={{ height: win.padBottom }}><td colSpan={cols} /></tr>}
          </tbody>
        </table>
      </div>
      {windowed && <p className="text-xs text-slate-500 mt-2">{rows.length} variants. Scroll inside the table to see them all.</p>}
    </div>
  )
}
