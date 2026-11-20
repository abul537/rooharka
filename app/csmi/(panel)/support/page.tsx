import Link from 'next/link'
import { db } from '@/lib/db'
import { requirePlatform } from '@/lib/csmi/guard'
import { formatPkt } from '@/lib/admin/dates'
import { MESSAGE_MAX, PRIORITY_LABEL, TICKET_STATUSES, isOpen, type TicketPriority } from '@/lib/support'
import ActionForm from '@/components/admin/ActionForm'
import TicketThread from '@/components/admin/TicketThread'
import { supportAction } from './actions'
import { hasFeature } from '@/lib/plans/access'

export const dynamic = 'force-dynamic'
const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'
const rank: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 }

/** SUPPORT in CSMI: every store's conversations with the platform. Unanswered and urgent ones first. */
export default async function CsmiSupportPage({ searchParams }: { searchParams: Promise<{ t?: string; all?: string }> }) {
  await requirePlatform()
  const sp = await searchParams
  const [tickets, open] = await Promise.all([
    db.supportTicket.findMany({ where: sp.all ? {} : { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_STORE'] } }, orderBy: { updatedAt: 'desc' }, take: 200, select: { id: true, subject: true, status: true, priority: true, updatedAt: true, store: { select: { id: true, name: true } } } }),
    sp.t ? db.supportTicket.findUnique({ where: { id: sp.t }, select: { id: true, subject: true, status: true, priority: true, store: { select: { id: true, name: true, ownerEmail: true, ownerPhone: true } }, messages: { orderBy: { createdAt: 'asc' }, take: 200, select: { id: true, body: true, fromPlatform: true, createdAt: true } } } }) : null,
  ])
  // Shops whose plan includes priority support (Pro) are answered first.
  const storeIds = [...new Set(tickets.map((t) => t.store.id))]
  const priority = new Set((await Promise.all(storeIds.map(async (id) => ((await hasFeature(id, 'priority-support')) ? id : null)))).filter(Boolean))
  // Waiting for US first (open), then priority-support shops, then by urgency, then the most recent.
  const sorted = [...tickets].sort((a, b) => Number(a.status !== 'OPEN') - Number(b.status !== 'OPEN') || Number(!priority.has(a.store.id)) - Number(!priority.has(b.store.id)) || rank[a.priority] - rank[b.priority] || b.updatedAt.getTime() - a.updatedAt.getTime())
  const waiting = tickets.filter((t) => t.status === 'OPEN').length
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Support</h1><p className="mt-1 text-sm text-slate-600">{waiting === 0 ? 'Nobody is waiting for an answer.' : `${waiting} conversation${waiting === 1 ? ' is' : 's are'} waiting for your answer.`}</p></div>
        <Link href={sp.all ? '/csmi/support' : '/csmi/support?all=1'} className="text-sm underline">{sp.all ? 'Show open only' : 'Show closed too'}</Link>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {sorted.length === 0 && <p className="p-6 text-sm text-slate-500">No conversations.</p>}
          {sorted.map((t) => (
            <Link key={t.id} href={`/csmi/support?t=${t.id}${sp.all ? '&all=1' : ''}`} className={`block p-3 hover:bg-slate-50 ${t.id === open?.id ? 'bg-slate-50' : ''}`}>
              <span className="flex items-center justify-between gap-2"><span className="truncate font-medium">{t.subject}</span>{t.status === 'OPEN' && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">answer</span>}</span>
              <span className="text-xs text-slate-500">{priority.has(t.store.id) && <span className="mr-1 rounded bg-violet-100 px-1 font-semibold text-violet-800">PRO</span>}{t.store.name} · {PRIORITY_LABEL[t.priority as TicketPriority]} · {formatPkt(t.updatedAt)}</span>
            </Link>
          ))}
        </div>
        {open ? (
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold">{open.subject}</h2>
            <p className="mb-4 text-sm text-slate-600"><Link href={`/csmi/stores/${open.store.id}`} className="underline">{open.store.name}</Link> · {open.store.ownerEmail}{open.store.ownerPhone && ` · ${open.store.ownerPhone}`} · {PRIORITY_LABEL[open.priority as TicketPriority]}</p>
            <TicketThread messages={open.messages} mine="platform" />
            <ActionForm action={supportAction} className="mt-5 space-y-3">
              <input type="hidden" name="id" value={open.id} />
              <label className="block text-sm font-medium">Your answer<textarea name="body" required maxLength={MESSAGE_MAX} rows={4} className={input} /></label>
              <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Send answer</button>
            </ActionForm>
            <ActionForm action={supportAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
              <input type="hidden" name="id" value={open.id} /><input type="hidden" name="what" value="status" />
              <label className="text-sm font-medium">Status<select name="status" defaultValue={open.status} className={input}>{TICKET_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>)}</select></label>
              <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">Save status</button>
              {!isOpen(open.status) && <span className="text-sm text-slate-500">This conversation is finished.</span>}
            </ActionForm>
          </section>
        ) : <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Choose a conversation on the left.</p>}
      </div>
    </div>
  )
}
