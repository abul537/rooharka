'use client'

import { useState } from 'react'
import { RETURN_REASONS } from '@/lib/returns'

interface Line { id: string; name: string; max: number; whole: boolean }
/** "Return items" on the tracking page. The server checks everything again; this form only collects the wish. */
export default function ReturnForm({ code, last4, lines, daysLeft, policy }: { code: string; last4: string; lines: Line[]; daysLeft: number; policy: string }) {
  const [open, setOpen] = useState(false)
  const [qty, setQty] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null)

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const items = lines.filter((l) => (qty[l.id] ?? 0) > 0).map((l) => ({ id: l.id, quantity: l.whole ? l.max : qty[l.id] }))
    if (items.length === 0) return setMsg({ error: 'Choose at least one item to return.' })
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/returns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, last4, reason: fd.get('reason'), note: fd.get('note'), website: fd.get('website'), items }) })
      const data = (await res.json().catch(() => ({}))) as { ok?: string; error?: string }
      setMsg(res.ok && data.ok ? { ok: data.ok } : { error: data.error ?? 'Could not send your request. Please try again.' })
    } catch { setMsg({ error: 'No connection. Please try again.' }) } finally { setBusy(false) }
  }
  if (msg?.ok) return <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{msg.ok}</p>
  if (!open) return (
    <div className="rounded-xl border border-gray-200 p-4 text-sm">
      <p className="text-gray-700">Something not right? You can ask to return items for {daysLeft} more day{daysLeft === 1 ? '' : 's'}.</p>
      <button type="button" onClick={() => setOpen(true)} className="mt-2 font-semibold text-brand-700 underline">Request a return</button>
    </div>
  )
  return (
    <form onSubmit={send} className="space-y-4 rounded-xl border border-gray-200 p-4 text-sm">
      <h3 className="text-base font-bold text-gray-900">Request a return</h3>
      {policy && <p className="whitespace-pre-line rounded-lg bg-gray-50 p-3 text-gray-700">{policy}</p>}
      <fieldset className="space-y-2">
        <legend className="mb-1 font-medium text-gray-800">What would you like to return?</legend>
        {lines.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-3">
            <label className="flex min-w-0 items-center gap-2">
              <input type="checkbox" checked={(qty[l.id] ?? 0) > 0} onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.checked ? (l.whole ? l.max : 1) : 0 }))} className="h-4 w-4" />
              <span className="truncate">{l.name}</span>
            </label>
            {!l.whole && l.max > 1 && (qty[l.id] ?? 0) > 0 && (
              <label className="flex shrink-0 items-center gap-1 text-gray-600">How many
                <select value={qty[l.id]} onChange={(e) => setQty((q) => ({ ...q, [l.id]: Number(e.target.value) }))} className="rounded border border-gray-300 px-2 py-1">
                  {Array.from({ length: Math.min(l.max, 50) }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
              </label>
            )}
          </div>
        ))}
      </fieldset>
      <div>
        <label htmlFor="return-reason" className="mb-1 block font-medium text-gray-800">Reason</label>
        <select id="return-reason" name="reason" required defaultValue="" className="w-full rounded-lg border border-gray-300 px-3 py-2">
          <option value="" disabled>Choose a reason</option>
          {Object.entries(RETURN_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="return-note" className="mb-1 block font-medium text-gray-800">Tell the shop more (optional)</label>
        <textarea id="return-note" name="note" rows={3} maxLength={500} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
      </div>
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      {msg?.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">{msg.error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={busy} className="rounded-lg bg-brand-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send request'}</button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-2.5 text-gray-600 underline">Cancel</button>
      </div>
    </form>
  )
}
