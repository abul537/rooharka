'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { AdminError } from '@/lib/admin/orders'
import { BULK_LABEL, parseBulk } from '@/lib/admin/product-extras'
import { bulkProducts, duplicateProduct } from '@/lib/admin/products'
import { destroyCloudFiles } from '@/lib/media/cloud-cleanup'
import type { ActionState } from '@/components/admin/ActionForm'

/** One action on every ticked product in the list. */
export async function bulkProductsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('products.edit'); if ('error' in g) return g
  const parsed = parseBulk(fd)
  if (!parsed.ok) return { error: parsed.error }
  try {
    const r = await bulkProducts(g.admin, parsed.value)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: `product.bulk.${parsed.value.action}`, entity: 'Product', after: { ids: parsed.value.ids, changed: r.changed, skipped: r.skipped } })
    if (r.cloud.length) await destroyCloudFiles(g.admin.storeId, r.cloud)
    for (const p of ['/admin/products', '/shop', '/product', '/', ...r.slugs.map((s) => `/product/${s}`)]) revalidatePath(p)
    const what = BULK_LABEL[parsed.value.action].replace('…', '').replace(/ \(.*\)$/, '')
    return { ok: `${what}: ${r.changed} product${r.changed === 1 ? '' : 's'} changed${r.skipped ? `, ${r.skipped} skipped${r.why ? ` (${r.why})` : ''}` : ''}.` }
  } catch (e) {
    if (e instanceof AdminError) return { error: e.message }
    console.error('[product bulk]', e)
    return { error: 'Something went wrong. Please refresh and check what changed.' }
  }
}

/** Makes a full copy of a product (as a draft) and opens the copy. */
export async function duplicateProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('products.edit'); if ('error' in g) return g
  const productId = String(fd.get('productId') ?? '')
  let id: string
  try {
    const r = await duplicateProduct(g.admin, productId, { copyStock: fd.get('copyStock') === 'on' })
    id = r.id
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'product.duplicate', entity: 'Product', entityId: id, after: { from: productId, name: r.name } })
    revalidatePath('/admin/products')
  } catch (e) {
    if (e instanceof AdminError) return { error: e.message }
    console.error('[product duplicate]', e)
    return { error: 'Something went wrong. Nothing was copied; please try again.' }
  }
  redirect(`/admin/products/${id}?copied=1`) // outside try: redirect works by throwing
}
