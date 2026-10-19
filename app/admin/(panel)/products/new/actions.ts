'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { AdminError } from '@/lib/admin/orders'
import { parseNewProduct } from '@/lib/admin/product-rules'
import { createProduct } from '@/lib/admin/products'
import type { ActionState } from '@/components/admin/ActionForm'

export async function createProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('products.edit'); if ('error' in g) return g
  const parsed = parseNewProduct(fd)
  if (!parsed.ok) return { error: parsed.error }
  let id: string
  try {
    id = await createProduct(g.admin, parsed.value)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'product.create', entity: 'Product', entityId: id, after: { name: parsed.value.product.name } })
    revalidatePath('/admin/products'); revalidatePath('/shop')
  } catch (e) {
    if (e instanceof AdminError) return { error: e.message }
    console.error('[product create]', e)
    return { error: 'Something went wrong. Nothing was saved; please try again.' }
  }
  redirect(`/admin/products/${id}?created=1`) // outside try: redirect works by throwing
}
