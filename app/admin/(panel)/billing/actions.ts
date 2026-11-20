'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import type { ActionState } from '@/components/admin/ActionForm'

/**
 * "Switch to this plan": the store owner asks; the platform owner decides and changes it in CSMI (the store cannot
 * change its own plan). The request arrives as a support conversation, so it is answered in the place he already
 * works, with the store's name, the plan and monthly/yearly in the first line.
 */
export async function requestPlanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  const planId = String(fd.get('planId') ?? ''), yearly = fd.get('interval') === 'yearly'
  if (!rateLimit(`plan-request:${g.admin.storeId}`, 3, 86_400_000).ok) return { error: 'Your request was already sent today. We will answer under Help.' }
  try {
    const [plan, sub, open] = await Promise.all([
      db.plan.findFirst({ where: { id: planId, isActive: true, isPublic: true }, select: { id: true, name: true, monthlyPrice: true, yearlyPrice: true } }),
      db.subscription.findUnique({ where: { storeId: g.admin.storeId }, select: { planId: true, plan: { select: { name: true } } } }),
      db.supportTicket.findFirst({ where: { storeId: g.admin.storeId, subject: { startsWith: 'Plan change request' }, status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_STORE'] } }, select: { id: true } }),
    ])
    if (!plan) return { error: 'That plan is not available. Reload the page.' }
    if (sub?.planId === plan.id) return { error: `You are already on ${plan.name}.` }
    if (open) return { error: 'A plan change request is already open. We will answer under Help.' }
    const price = yearly && plan.yearlyPrice ? `Rs. ${plan.yearlyPrice.toNumber().toLocaleString('en-PK')} a year` : `Rs. ${plan.monthlyPrice.toNumber().toLocaleString('en-PK')} a month`
    await db.supportTicket.create({ data: {
      storeId: g.admin.storeId, subject: `Plan change request: ${sub?.plan.name ?? 'no plan'} → ${plan.name}`, priority: 'HIGH',
      messages: { create: { authorId: g.admin.id, fromPlatform: false, body: `Please move my shop to the ${plan.name} plan, paid ${yearly ? 'yearly' : 'monthly'} (${price}).` } },
    } })
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'plan.request', entity: 'Plan', entityId: plan.id, after: { plan: plan.name, yearly } })
    revalidatePath('/admin/support'); revalidatePath('/admin/billing')
    return { ok: `Request sent: ${plan.name}, ${yearly ? 'yearly' : 'monthly'}. We will confirm under Help, usually the same day. Nothing changes until then.` }
  } catch (e) { console.error('[plan request]', e); return { error: 'Something went wrong. Nothing was sent; please try again.' } }
}
