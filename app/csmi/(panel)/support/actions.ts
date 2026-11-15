'use server'

import { revalidatePath } from 'next/cache'
import { platformOrError } from '@/lib/csmi/guard'
import { db } from '@/lib/db'
import { TICKET_STATUSES, parseReply, statusAfterReply, type TicketStatus } from '@/lib/support'

type State = { ok?: string; error?: string } | null

/** The platform's side of a support conversation: answer it, or set its status. Platform staff only. */
export async function supportAction(_: State, fd: FormData): Promise<State> {
  const g = await platformOrError('csmi.view'); if ('error' in g) return g
  const id = String(fd.get('id') ?? ''), what = String(fd.get('what') ?? 'reply')
  try {
    const t = await db.supportTicket.findUnique({ where: { id }, select: { id: true } })
    if (!t) return { error: 'Conversation not found. Reload the page.' }
    if (what === 'status') {
      const status = TICKET_STATUSES.find((s) => s === fd.get('status')) as TicketStatus | undefined
      if (!status) return { error: 'Choose a status.' }
      await db.supportTicket.update({ where: { id: t.id }, data: { status, closedAt: status === 'CLOSED' || status === 'RESOLVED' ? new Date() : null, assignedTo: g.user.id } })
    } else {
      const body = parseReply(fd.get('body'))
      if (!body) return { error: 'Write the answer first.' }
      await db.$transaction([
        db.ticketMessage.create({ data: { ticketId: t.id, authorId: g.user.id, fromPlatform: true, body } }),
        db.supportTicket.update({ where: { id: t.id }, data: { status: statusAfterReply(true), assignedTo: g.user.id, closedAt: null } }),
      ])
    }
    revalidatePath('/csmi/support')
    return { ok: what === 'status' ? 'Status saved.' : 'Answer sent. The store sees it in their dashboard, under Help.' }
  } catch (e) { console.error('[support]', e); return { error: 'Something went wrong. Please try again.' } }
}
