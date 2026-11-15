'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { AdminError } from '@/lib/admin/orders'
import { parseCollection, parseCollectionProducts } from '@/lib/admin/product-mvp'
import { createCollection, deleteCollection, saveCollection } from '@/lib/admin/collections'
import type { ActionState } from '@/components/admin/ActionForm'
import { db } from '@/lib/db'
import { slugify, uniqueSlug } from '@/lib/admin/slug'

const MAX_CATEGORIES = 60

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


// ------------------------------------------------------------------ shop categories
const catName = (v: unknown) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)

/**
 * Shop categories (the filter on the Shop page): add one, rename one, or delete one. Deleting a category never
 * deletes products: they simply have no category afterwards. Only categories of the admin's own store.
 */
export async function categoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('products.edit'); if ('error' in g) return g
  const storeId = g.admin.storeId, what = String(fd.get('what') ?? ''), id = String(fd.get('id') ?? ''), name = catName(fd.get('name'))
  try {
    if (what === 'create' || what === 'rename') {
      if (name.length < 2) return { error: 'Enter a name for the category (at least 2 letters).' }
      const others = await db.category.findMany({ where: { storeId, ...(what === 'rename' ? { id: { not: id } } : {}) }, select: { name: true, slug: true } })
      if (others.some((c) => c.name.toLowerCase() === name.toLowerCase())) return { error: `You already have a category called “${name}”.` }
      if (what === 'create') {
        if (others.length >= MAX_CATEGORIES) return { error: `You can have up to ${MAX_CATEGORIES} categories.` }
        const c = await db.category.create({ data: { storeId, name, slug: uniqueSlug(slugify(name) || 'category', new Set(others.map((o) => o.slug))), sortOrder: others.length }, select: { id: true } })
        await audit({ storeId, userId: g.admin.id, action: 'category.create', entity: 'Category', entityId: c.id, after: { name } })
      } else {
        // The page address (slug) is kept, so links to the category keep working after a rename.
        const res = await db.category.updateMany({ where: { id, storeId }, data: { name } })
        if (res.count === 0) return { error: 'Category not found. Reload the page.' }
        await audit({ storeId, userId: g.admin.id, action: 'category.rename', entity: 'Category', entityId: id, after: { name } })
      }
    } else if (what === 'delete') {
      const c = await db.category.findFirst({ where: { id, storeId }, select: { id: true, name: true } })
      if (!c) return { error: 'Category not found. Reload the page.' }
      await db.$transaction([
        db.product.updateMany({ where: { storeId, categoryId: c.id }, data: { categoryId: null } }),
        db.category.updateMany({ where: { storeId, parentId: c.id }, data: { parentId: null } }),
        db.category.deleteMany({ where: { id: c.id, storeId } }),
      ])
      await audit({ storeId, userId: g.admin.id, action: 'category.delete', entity: 'Category', entityId: c.id, after: { name: c.name } })
    } else return { error: 'Invalid choice.' }
    revalidatePath('/admin/collections'); revalidatePath('/shop')
    return { ok: what === 'create' ? `Category “${name}” added. Choose it on a product’s page.` : what === 'rename' ? 'Renamed.' : 'Deleted. Its products are kept, without a category.' }
  } catch (e) { return fail(e) }
}
