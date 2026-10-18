'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { AdminError } from '@/lib/admin/orders'
import { parseProductEdit } from '@/lib/admin/product-rules'
import { saveProduct } from '@/lib/admin/products'
import type { ActionState } from '@/components/admin/ActionForm'

export async function saveProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('products.edit')
  if ('error' in g) return g
  const productId = String(fd.get('productId') ?? '')
  // Which sizes belong to this product comes from the database, never from the form.
  const owned = await db.product.findFirst({ where: { id: productId, storeId: g.admin.storeId }, select: { slug: true, variants: { select: { id: true } } } })
  if (!owned) return { error: 'Product not found.' }

  const parsed = parseProductEdit(fd, owned.variants.map((v) => v.id))
  if (!parsed.ok) return { error: parsed.error }
  try {
    const changes = await saveProduct(g.admin, productId, parsed.value.product, parsed.value.variants, parsed.value.defaultId)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'product.update', entity: 'Product', entityId: productId, after: changes })
    for (const p of ['/admin/products', `/admin/products/${productId}`, `/product/${owned.slug}`, '/product', '/checkout']) revalidatePath(p)
    return { ok: 'Product saved. The store is updated.' }
  } catch (e) {
    if (e instanceof AdminError) return { error: e.message }
    console.error('[product save]', e)
    return { error: 'Could not save. Nothing was changed; please try again.' }
  }
}
