'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { AdminError } from '@/lib/admin/orders'
import { parseCategory } from '@/lib/admin/category-rules'
import { createCategory, deleteCategory, updateCategory } from '@/lib/admin/categories'
import type { ActionState } from '@/components/admin/ActionForm'

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '')
const refresh = () => ['/admin/categories', '/admin/products', '/shop'].forEach((p) => revalidatePath(p))

function fail(e: unknown): ActionState {
  if (e instanceof AdminError) return { error: e.message }
  console.error('[category]', e)
  return { error: 'Something went wrong. Nothing was changed; please try again.' }
}

export async function createCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('products.edit'); if ('error' in g) return g
  const p = parseCategory(fd); if (!p.ok) return { error: p.error }
  try {
    const id = await createCategory(g.admin, p.value)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'category.create', entity: 'Category', entityId: id, after: { name: p.value.name } })
    refresh(); return { ok: 'Category added.' }
  } catch (e) { return fail(e) }
}

export async function updateCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('products.edit'); if ('error' in g) return g
  const p = parseCategory(fd); if (!p.ok) return { error: p.error }
  try {
    await updateCategory(g.admin, str(fd, 'id'), p.value)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'category.update', entity: 'Category', entityId: str(fd, 'id'), after: { name: p.value.name } })
    refresh(); return { ok: 'Saved.' }
  } catch (e) { return fail(e) }
}

export async function deleteCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('products.edit'); if ('error' in g) return g
  try {
    const name = await deleteCategory(g.admin, str(fd, 'id'))
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'category.delete', entity: 'Category', entityId: str(fd, 'id'), after: { name } })
    refresh(); return { ok: `“${name}” deleted. Its products are kept.` }
  } catch (e) { return fail(e) }
}
