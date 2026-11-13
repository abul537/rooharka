'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { bulkOrderStepAction } from '@/app/admin/(panel)/orders/actions'
import { MAX_BULK_ORDERS, MAX_SLIPS, ORDER_BULK, ORDER_BULK_LABEL, bulkSteps, bulkSummary, type BulkLine, type OrderBulk } from '@/lib/admin/order-list'
import AutoRefresh from '@/components/admin/AutoRefresh'
import { inputCls, primaryBtn } from '@/components/admin/ui'

/**
 * The bar above the orders table: tick orders, choose an action, watch the progress.
 * The work is sent in small groups, one after another; the bar shows how far it is and, at the end, exactly which
 * orders could not be changed and why. `numbers` maps an order id to its number for those messages.
 */
export default function OrderBulkBar({ numbers, canUpdate }: { numbers: Record<string, string>; canUpdate: boolean }) {
  const router = useRouter()
  const [action, setAction] = useState<OrderBulk | ''>('')
  const [run, setRun] = useState<{ total: number; done: number; lines: BulkLine[]; finished: boolean; error?: string } | null>(null)
  const busy = !!run && !run.finished
  const ticked = () => [...document.querySelectorAll<HTMLInputElement>('input[name="orderIds"]:checked')].map((c) => c.value)
  const tickAll = (on: boolean) => document.querySelectorAll<HTMLInputElement>('input[name="orderIds"]').forEach((c) => { c.checked = on })

  async function start() {
    const ids = ticked()
    if (!action) return
    if (ids.length === 0) { setRun({ total: 0, done: 0, lines: [], finished: true, error: 'Tick at least one order first.' }); return }
    if (ids.length > MAX_BULK_ORDERS) { setRun({ total: 0, done: 0, lines: [], finished: true, error: `Select at most ${MAX_BULK_ORDERS} orders at a time.` }); return }
    if (!window.confirm(`${ORDER_BULK_LABEL[action]}: ${ids.length} order${ids.length === 1 ? '' : 's'}?`)) return
    const lines: BulkLine[] = []
    setRun({ total: ids.length, done: 0, lines, finished: false })
    for (const group of bulkSteps(ids)) {
      const r = await bulkOrderStepAction(action, group).catch(() => ({ error: 'The connection dropped. The orders already done stay done; run the rest again.' }))
      if ('error' in r) { setRun({ total: ids.length, done: lines.length, lines: [...lines], finished: true, error: r.error }); router.refresh(); return }
      lines.push(...r.lines)
      setRun({ total: ids.length, done: lines.length, lines: [...lines], finished: false })
    }
    setRun({ total: ids.length, done: lines.length, lines: [...lines], finished: true })
    tickAll(false)
    router.refresh()
  }

  function printSlips() {
    const ids = ticked()
    if (ids.length === 0) { setRun({ total: 0, done: 0, lines: [], finished: true, error: 'Tick at least one order first.' }); return }
    window.open(`/admin/orders/slips?ids=${ids.slice(0, MAX_SLIPS).join(',')}`, '_blank', 'noopener')
  }

  const failed = run?.lines.filter((l) => !l.ok) ?? []
  return (
    <div className="border-b border-slate-200 bg-slate-50 rounded-t-xl">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4" aria-label="Select all orders on this page" onChange={(e) => tickAll(e.target.checked)} disabled={busy} /> Select all</label>
        {canUpdate && (
          <>
            <select value={action} onChange={(e) => setAction(e.target.value as OrderBulk | '')} disabled={busy} className={`${inputCls} !w-auto`} aria-label="Action for selected orders">
              <option value="">With selected…</option>
              {ORDER_BULK.map((a) => <option key={a} value={a}>{ORDER_BULK_LABEL[a]}</option>)}
            </select>
            <button type="button" onClick={start} disabled={!action || busy} className={primaryBtn}>{busy ? 'Working…' : 'Apply'}</button>
          </>
        )}
        <button type="button" onClick={printSlips} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium">Print packing slips</button>
        <span className="ml-auto"><AutoRefresh seconds={30} paused={busy} /></span>
      </div>
      {run && (
        <div className="px-3 pb-3 text-sm" role="status" aria-live="polite">
          {run.total > 0 && (
            <>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={run.total} aria-valuenow={run.done} aria-label="Bulk action progress">
                <div className="h-full bg-slate-900 transition-all" style={{ width: `${Math.round((run.done / run.total) * 100)}%` }} />
              </div>
              <p className="mt-1 text-slate-700">{run.finished ? bulkSummary(run.lines) : `${run.done} of ${run.total} done…`}</p>
            </>
          )}
          {run.error && <p role="alert" className="text-red-700">{run.error}</p>}
          {failed.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-red-700">
              {failed.map((l) => <li key={l.id}>Order #{numbers[l.id] ?? '?'}: {l.message}</li>)}
            </ul>
          )}
          {run.finished && <button type="button" onClick={() => setRun(null)} className="mt-1 text-xs underline text-slate-600">Hide</button>}
        </div>
      )}
    </div>
  )
}
