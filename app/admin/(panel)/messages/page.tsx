import { requireAdmin } from '@/lib/auth/guard'
import { db } from '@/lib/db'
import { formatPkt } from '@/lib/admin/dates'
import { telHref, whatsappHref } from '@/lib/contact/rules'
import ActionForm from '@/components/admin/ActionForm'
import { messageAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function MessagesPage() {
  const admin = await requireAdmin('orders.view')
  const messages = await db.contactMessage.findMany({ where: { storeId: admin.storeId }, orderBy: { createdAt: 'desc' }, take: 100 })
  const unread = messages.filter((m: (typeof messages)[number]) => !m.isRead).length

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Messages</h1>
        {unread > 0 && <ActionForm action={messageAction}><input type="hidden" name="op" value="all" /><button className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Mark all as read</button></ActionForm>}
      </div>
      <p className="text-sm text-slate-600 -mt-3">Messages customers send from your shop’s Contact page. Reply by phone or WhatsApp with the buttons. Showing the latest 100.</p>
      {messages.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No messages yet.</p> : (
        <ul className="space-y-3">
          {messages.map((m: (typeof messages)[number]) => {
            const wa = whatsappHref(m.phone, `Hello ${m.name.split(' ')[0]}, thank you for contacting us. `)
            const tel = telHref(m.phone)
            return (
              <li key={m.id} className={`rounded-xl border bg-white p-5 ${m.isRead ? 'border-slate-200' : 'border-emerald-400 ring-1 ring-emerald-200'}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{m.name} {!m.isRead && <span className="ml-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">New</span>}</p>
                  <p className="text-xs text-slate-500">{formatPkt(m.createdAt)}</p>
                </div>
                <p className="mt-1 text-sm text-slate-600">{m.phone}{m.email ? ` · ${m.email}` : ''}</p>
                <p className="mt-3 whitespace-pre-line text-sm">{m.message}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  {tel && <a href={tel} className="rounded-lg bg-slate-900 px-3 py-1.5 text-white">Call</a>}
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-emerald-700 px-3 py-1.5 text-white">WhatsApp</a>}
                  {m.email && <a href={`mailto:${m.email}`} className="rounded-lg border border-slate-300 px-3 py-1.5">Email</a>}
                  <ActionForm action={messageAction} className="ml-auto flex gap-3"><input type="hidden" name="id" value={m.id} />
                    <button name="op" value={m.isRead ? 'unread' : 'read'} className="text-xs underline">{m.isRead ? 'Mark unread' : 'Mark read'}</button>
                    <button name="op" value="delete" className="text-xs text-red-700 underline">Delete</button>
                  </ActionForm>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
