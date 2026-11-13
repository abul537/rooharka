'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { AdminError } from '@/lib/admin/orders'
import { parseCollection, parseCollectionProducts } from '@/lib/admin/product-mvp'
import { createCollection, deleteCollection, saveCollection } from '@/lib/admin/collections'
import type { ActionState } from '@/components/admin/ActionForm'

const fail = (e: unknown): ActionState => {
  if (e instanceof AdminError) return { error: e.message }
  console.error('[collection]', e)
  return { error: 'Something went wrong. Nothing was changed; please try again.' }
}
const refresh = (handle?: string) => ['/admin/collections', '/collections', ...(handle ? [`/collections/${handle}`] : [])].forEach((p) => revalidatePath(p))

export async function createCollectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('products.edit'); if ('error' in g) return g
  const p = parseCollection({ get: (k) => (k === 'isActive' ? 'on' : fd.get(k)) }); if (!p.ok) return { error: p.error }
  let id: string
  try {
    id = await createCollection(g.admin, p.value)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'collection.create', entity: 'Collection', entityId: id, after: { title: p.value.title } })
    refresh()
  } catch (e) { return fail(e) }
  redirect(`/admin/collections/${id}`)
}

export async function saveCollectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('products.edit'); if ('error' in g) return g
  const id = String(fd.get('id') ?? '')
  const p = parseCollection(fd); if (!p.ok) return { error: p.error }
  const ids = parseCollectionProducts(fd.getAll('productIds')); if (!ids.ok) return { error: ids.error }
  try {
    await saveCollection(g.admin, id, p.value, ids.value)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'collection.update', entity: 'Collection', entityId: id, after: { title: p.value.title, products: ids.value.length } })
    refresh(p.value.handle)
    return { ok: `Saved. ${ids.value.length} product${ids.value.length === 1 ? '' : 's'} in this collection.` }
  } catch (e) { return fail(e) }
}

export async function deleteCollectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('products.edit'); if ('error' in g) return g
  const id = String(fd.get('id') ?? '')
  try {
    const title = await deleteCollection(g.admin, id)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'collection.delete', entity: 'Collection', entityId: id, after: { title } })
    refresh()
  } catch (e) { return fail(e) }
  redirect('/admin/collections')
}
