'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { trackNoteAction, trackStatusAction } from '@/app/admin/(panel)/order-tracking/actions'
import { label, type OrderStatus } from '@/lib/admin/order-rules'
import { NOTE_IDEAS, NOTE_MAX } from '@/lib/admin/order-tracking'
import { inputCls } from '@/components/admin/ui'

/**
 * The buttons of one order on the Order tracking page: move it to its next step (the first button is the usual
 * one), with an optional note the customer will read, or post a note without changing the step.
 */
export default function TrackingActions({ orderId, number, next, blocked }: { orderId: string; number: string; next: OrderStatus[]; /** Why the order cannot move yet (an advance payment to check), or null. */ blocked: string | null }) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ bad: boolean; text: string } | null>(null)
  const [busy, start] = useTransition()
  const ideas = [...new Set(next.flatMap((s) => NOTE_IDEAS[s] ?? []))]

  const run = (job: () => Promise<{ ok: string } | { error: string }>) => start(async () => {
    const r = await job().catch(() => ({ error: 'Could not reach the server. Please try again.' }))
    if ('error' in r) return setMsg({ bad: true, text: r.error })
    setMsg({ bad: false, text: r.ok }); setNote(''); router.refresh()
  })
  const move = (to: OrderStatus) => {
    if (to === 'RETURNED' && !window.confirm(`Mark order #${number} as returned?`)) return
    run(() => trackStatusAction(orderId, to, note))
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs text-slate-500">Note for the customer (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX} list={ideas.length ? `ideas-${orderId}` : undefined} placeholder="Shown on their tracking page" className={`${inputCls} mt-1`} />
      </label>
      {ideas.length > 0 && <datalist id={`ideas-${orderId}`}>{ideas.map((i) => <option key={i} value={i} />)}</datalist>}
      {blocked && <p className="text-xs text-amber-800">{blocked}</p>}
      <div className="flex flex-wrap gap-2">
        {next.map((s, i) => (
          <button key={s} type="button" disabled={busy || !!blocked} onClick={() => move(s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${s === 'RETURNED' ? 'border border-red-300 text-red-800 hover:bg-red-50' : i === 0 ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white hover:bg-slate-50'}`}>
            Mark {label(s).toLowerCase()}
          </button>
        ))}
        <button type="button" disabled={busy || !note.trim()} onClick={() => run(() => trackNoteAction(orderId, note))} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50" title="Adds the note to the customer’s tracking page without changing the step">Send note only</button>
      </div>
      {msg && <p role={msg.bad ? 'alert' : 'status'} className={`text-xs ${msg.bad ? 'text-red-700' : 'text-emerald-700'}`}>{msg.text}</p>}
    </div>
  )
}
