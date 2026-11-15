'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { MAX_DISCOUNTS, parseDiscountForm } from '@/lib/discounts'
import type { ActionState } from '@/components/admin/ActionForm'

const oops = (what: string, e: unknown): ActionState => { console.error(`[discount ${what}]`, e); return { error: 'Something went wrong. Nothing was changed; please try again.' } }

/** A new discount code for this store. The code is unique inside the store. */
export async function createDiscountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  const parsed = parseDiscountForm((k) => fd.get(k))
  if (!parsed.ok) return { error: parsed.error }
  try {
    const storeId = g.admin.storeId
    if ((await db.discount.count({ where: { storeId } })) >= MAX_DISCOUNTS) return { error: `You can keep up to ${MAX_DISCOUNTS} codes. Delete old ones first.` }
    if (await db.discount.findUnique({ where: { storeId_code: { storeId, code: parsed.value.code } }, select: { id: true } })) return { error: `You already have a code ${parsed.value.code}.` }
    const d = await db.discount.create({ data: { storeId, ...parsed.value }, select: { id: true } })
    await audit({ storeId, userId: g.admin.id, action: 'discount.create', entity: 'Discount', entityId: d.id, after: { code: parsed.value.code, kind: parsed.value.kind, value: parsed.value.value } })
    revalidatePath('/admin/discounts')
    return { ok: `Code ${parsed.value.code} is ready. Customers can type it at checkout.` }
  } catch (e) { return oops('create', e) }
}

/** Switch a code on or off, or delete it. Orders that already used it keep their discount. */
export async function discountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  const id = String(fd.get('id') ?? ''), what = String(fd.get('what') ?? '')
  try {
    const d = await db.discount.findFirst({ where: { id, storeId: g.admin.storeId }, select: { id: true, code: true, isActive: true } })
    if (!d) return { error: 'Code not found. Reload the page.' }
    if (what === 'toggle') await db.discount.updateMany({ where: { id: d.id, storeId: g.admin.storeId }, data: { isActive: !d.isActive } })
    else if (what === 'delete') await db.discount.deleteMany({ where: { id: d.id, storeId: g.admin.storeId } })
    else return { error: 'Invalid choice.' }
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: `discount.${what}`, entity: 'Discount', entityId: d.id, after: { code: d.code } })
    revalidatePath('/admin/discounts')
    return { ok: what === 'delete' ? `Code ${d.code} deleted.` : `Code ${d.code} is now ${d.isActive ? 'off' : 'on'}.` }
  } catch (e) { return oops(what, e) }
}
