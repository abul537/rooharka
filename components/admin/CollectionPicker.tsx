'use client'

import { useMemo, useState } from 'react'
import { inputCls } from '@/components/admin/ui'

export interface PickItem { id: string; name: string; status: string; thumb: string | null }

/** Tick the products that belong in the collection. Ticked ones are listed first, in order, and can be moved up or down. */
export default function CollectionPicker({ items, chosen }: { items: PickItem[]; chosen: string[] }) {
  const [picked, setPicked] = useState<string[]>(chosen.filter((id) => items.some((i) => i.id === id)))
  const [q, setQ] = useState('')
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const rest = items.filter((i) => !picked.includes(i.id) && i.name.toLowerCase().includes(q.trim().toLowerCase()))
  const move = (id: string, d: -1 | 1) => setPicked((p) => { const i = p.indexOf(id), j = i + d; if (j < 0 || j >= p.length) return p; const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n })
  const row = (i: PickItem, on: boolean, idx = 0) => (
    <li key={i.id} className="flex items-center gap-3 p-2">
      <input type="checkbox" checked={on} onChange={() => setPicked((p) => (on ? p.filter((x) => x !== i.id) : [...p, i.id]))} className="h-4 w-4" aria-label={`${on ? 'Remove' : 'Add'} ${i.name}`} />
      <span className="h-10 w-10 shrink-0 rounded bg-slate-100 overflow-hidden">{i.thumb && <img src={i.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{i.name}{i.status !== 'ACTIVE' && <span className="ml-2 text-xs text-amber-700">draft: not shown in the shop yet</span>}</span>
      {on && <span className="flex gap-1">
        <button type="button" onClick={() => move(i.id, -1)} disabled={idx === 0} className="rounded border border-slate-300 px-2 text-xs disabled:opacity-40" aria-label={`Move ${i.name} earlier`}>↑</button>
        <button type="button" onClick={() => move(i.id, 1)} disabled={idx === picked.length - 1} className="rounded border border-slate-300 px-2 text-xs disabled:opacity-40" aria-label={`Move ${i.name} later`}>↓</button>
      </span>}
    </li>
  )
  return (
    <div className="space-y-4">
      {picked.map((id) => <input key={id} type="hidden" name="productIds" value={id} />)}
      <div>
        <p className="text-sm font-semibold mb-1">In this collection ({picked.length})</p>
        {picked.length === 0 ? <p className="text-sm text-slate-500">Nothing yet. Tick products below.</p> : <ul className="rounded-lg border border-slate-200 divide-y divide-slate-100">{picked.map((id, idx) => row(byId.get(id)!, true, idx))}</ul>}
      </div>
      <div>
        <p className="text-sm font-semibold mb-1">Add products</p>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your products" className={inputCls} aria-label="Search products to add" onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }} />
        <ul className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
          {rest.length === 0 && <li className="p-3 text-sm text-slate-500">{items.length === picked.length ? 'Every product is already in this collection.' : 'No product matches.'}</li>}
          {rest.slice(0, 200).map((i) => row(i, false))}
        </ul>
      </div>
    </div>
  )
}
