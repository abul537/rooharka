import Link from 'next/link'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { formatPkt } from '@/lib/admin/dates'
import { MESSAGE_MAX, PRIORITY_LABEL, SUBJECT_MAX, TICKET_LABEL, TICKET_PRIORITIES, isOpen, type TicketStatus } from '@/lib/support'
import ActionForm from '@/components/admin/ActionForm'
import TicketThread from '@/components/admin/TicketThread'
import { Card, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { openTicketAction, ticketAction } from './actions'

export const dynamic = 'force-dynamic'

/** HELP: the store's conversations with the platform. Only this store's own. */
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const admin = await requireAdmin('orders.view')
  const openId = (await searchParams).t
  const [tickets, open] = await Promise.all([
    db.supportTicket.findMany({ where: { storeId: admin.storeId }, orderBy: { updatedAt: 'desc' }, take: 50, select: { id: true, subject: true, status: true, updatedAt: true } }),
    openId ? db.supportTicket.findFirst({ where: { id: openId, storeId: admin.storeId }, select: { id: true, subject: true, status: true, messages: { orderBy: { createdAt: 'asc' }, take: 200, select: { id: true, body: true, fromPlatform: true, createdAt: true } } } }) : null,
  ])
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Help</h1>
        <p className="mt-1 text-sm text-slate-600">Ask a question or report a problem. We answer here, so the whole conversation stays in one place.</p>
      </div>

      {open && (
        <Card title={open.subject} hint={TICKET_LABEL[open.status as TicketStatus]}>
          <TicketThread messages={open.messages} mine="store" />
          {open.status !== 'CLOSED' ? (
            <div className="mt-5 space-y-3">
              <ActionForm action={ticketAction} className="space-y-3">
                <input type="hidden" name="id" value={open.id} />
                <Field label="Your reply"><textarea name="body" required maxLength={MESSAGE_MAX} rows={3} className={inputCls} /></Field>
                <button className={primaryBtn}>Send reply</button>
              </ActionForm>
              <ActionForm action={ticketAction} confirm="Close this conversation? You can still read it afterwards.">
                <input type="hidden" name="id" value={open.id} /><input type="hidden" name="what" value="close" />
                <button className="text-sm text-slate-600 underline">My problem is solved: close it</button>
              </ActionForm>
            </div>
          ) : <p className="mt-4 text-sm text-slate-500">This conversation is closed. Start a new one below if you need more help.</p>}
        </Card>
      )}

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {tickets.length === 0 && <p className="p-6 text-sm text-slate-500">You have not written to us yet.</p>}
        {tickets.map((t) => (
          <Link key={t.id} href={`/admin/support?t=${t.id}`} className={`flex items-center justify-between gap-3 p-4 hover:bg-slate-50 ${t.id === open?.id ? 'bg-slate-50' : ''}`}>
            <span className="min-w-0"><span className="block truncate font-medium">{t.subject}</span><span className="text-sm text-slate-500">{formatPkt(t.updatedAt)}</span></span>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${t.status === 'WAITING_ON_STORE' ? 'bg-amber-100 text-amber-900' : isOpen(t.status) ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{TICKET_LABEL[t.status as TicketStatus]}</span>
          </Link>
        ))}
      </div>

      <Card title="Write to us" hint="Tell us what you were doing and what happened. If it is about an order or a product, include its number or name.">
        <ActionForm action={openTicketAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field label="Subject"><input name="subject" required maxLength={SUBJECT_MAX} placeholder="Example: PostEx booking fails" className={inputCls} /></Field>
            <Field label="How urgent"><select name="priority" defaultValue="NORMAL" className={inputCls}>{TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select></Field>
          </div>
          <Field label="Message"><textarea name="body" required maxLength={MESSAGE_MAX} rows={5} className={inputCls} /></Field>
          <button className={primaryBtn}>Send</button>
        </ActionForm>
      </Card>
    </div>
  )
}
