'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { parseSale } from '@/lib/pos/rules'
import { PosError, ringUpSale, voidSale } from '@/lib/pos/service'
import type { ActionState } from '@/components/admin/ActionForm'

export type SaleOutcome = { ok: true; orderId: string; number: string; total: number; change: number } | { ok: false; error: string }

/** Called by the sale screen with the cart as plain data. Everything is re-checked and re-priced here. */
export async function ringUpSaleAction(body: unknown): Promise<SaleOutcome> {
  const g = await adminOrError('pos.sell'); if ('error' in g) return { ok: false, error: g.error }
  if (!rateLimit(`pos:${g.admin.id}`, 60, 60_000).ok) return { ok: false, error: 'Too many sales too fast. Wait a moment and try again.' }
  const p = parseSale(body); if (!p.ok) return { ok: false, error: p.error }
  try {
    const r = await ringUpSale(g.admin, p.value)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'pos.sale', entity: 'Order', entityId: r.orderId, after: { number: r.number, total: r.total, method: p.value.paymentMethod } })
    revalidatePath('/admin/pos'); revalidatePath('/admin/orders'); revalidatePath('/admin/products')
    return { ok: true, ...r }
  } catch (e) {
    if (e instanceof PosError) return { ok: false, error: e.message }
    console.error('[pos sale]', e)
    return { ok: false, error: 'Something went wrong and the sale was not saved. Please try again.' }
  }
}

export async function voidSaleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('orders.cancel'); if ('error' in g) return g
  try {
    const r = await voidSale(g.admin, String(fd.get('orderId') ?? ''), String(fd.get('reason') ?? ''))
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'pos.void', entity: 'Order', entityId: String(fd.get('orderId')), after: { number: r.number, refund: r.refund } })
    revalidatePath('/admin/pos'); revalidatePath('/admin/orders'); revalidatePath('/admin/products')
    return { ok: `Sale #${r.number} cancelled and the items are back in stock. Give the customer Rs. ${r.refund.toLocaleString('en-PK')} back.` }
  } catch (e) {
    if (e instanceof PosError) return { error: e.message }
    console.error('[pos void]', e)
    return { error: 'Something went wrong. Nothing was changed; please try again.' }
  }
}
