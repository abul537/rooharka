'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { db } from '@/lib/db'
import { MAX_OPEN_TICKETS, parseReply, parseTicket, statusAfterReply } from '@/lib/support'
import { rateLimit } from '@/lib/rate-limit'
import type { ActionState } from '@/components/admin/ActionForm'

const oops = (e: unknown): ActionState => { console.error('[support]', e); return { error: 'Something went wrong. Nothing was sent; please try again.' } }

/** A new question or problem for the platform. Any signed-in member of the store may write. */
export async function openTicketAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('orders.view'); if ('error' in g) return g
  const parsed = parseTicket((k) => fd.get(k))
  if (!parsed.ok) return { error: parsed.error }
  if (!rateLimit(`ticket:${g.admin.storeId}`, 10, 3_600_000).ok) return { error: 'You have sent several messages in a short time. Please wait a little.' }
  try {
    if ((await db.supportTicket.count({ where: { storeId: g.admin.storeId, status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_STORE'] } } })) >= MAX_OPEN_TICKETS) return { error: `You have ${MAX_OPEN_TICKETS} conversations open. Please reply in one of them, or close one first.` }
    await db.supportTicket.create({ data: { storeId: g.admin.storeId, subject: parsed.value.subject, priority: parsed.value.priority, messages: { create: { authorId: g.admin.id, fromPlatform: false, body: parsed.value.body } } } })
    revalidatePath('/admin/support')
    return { ok: 'Sent. We will answer here; check back on this page.' }
  } catch (e) { return oops(e) }
}

/** A reply in one of the store's own conversations, or closing it. */
export async function ticketAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('orders.view'); if ('error' in g) return g
  const id = String(fd.get('id') ?? ''), what = String(fd.get('what') ?? 'reply')
  try {
    const t = await db.supportTicket.findFirst({ where: { id, storeId: g.admin.storeId }, select: { id: true, status: true } })
    if (!t) return { error: 'Conversation not found. Reload the page.' }
    if (what === 'close') {
      await db.supportTicket.updateMany({ where: { id: t.id, storeId: g.admin.storeId }, data: { status: 'CLOSED', closedAt: new Date() } })
    } else {
      const body = parseReply(fd.get('body'))
      if (!body) return { error: 'Write your message first.' }
      if (!rateLimit(`ticket-reply:${g.admin.storeId}`, 30, 3_600_000).ok) return { error: 'Please wait a little before writing again.' }
      await db.$transaction([
        db.ticketMessage.create({ data: { ticketId: t.id, authorId: g.admin.id, fromPlatform: false, body } }),
        db.supportTicket.updateMany({ where: { id: t.id, storeId: g.admin.storeId }, data: { status: statusAfterReply(false), closedAt: null } }),
      ])
    }
    revalidatePath('/admin/support')
    return { ok: what === 'close' ? 'Closed. You can still read it.' : 'Sent.' }
  } catch (e) { return oops(e) }
}
