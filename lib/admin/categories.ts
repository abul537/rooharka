import { db } from '@/lib/db'
import type { StoreAdmin } from '@/lib/auth/guard'
import { AdminError } from './orders'
import { categorySlug, type CategoryInput } from './category-rules'

const isUnique = (e: unknown) => (e as { code?: string })?.code === 'P2002'

export const listCategories = (storeId: string) =>
  db.category.findMany({ where: { storeId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, slug: true, sortOrder: true, isActive: true, _count: { select: { products: true } } } })

export async function createCategory(admin: StoreAdmin, c: CategoryInput) {
  try {
    return (await db.category.create({ data: { storeId: admin.storeId, name: c.name, slug: categorySlug(c), sortOrder: c.sortOrder, isActive: c.isActive }, select: { id: true } })).id
  } catch (e) {
    if (isUnique(e)) throw new AdminError('A category with that address already exists. Change the name or the address.')
    throw e
  }
}

export async function updateCategory(admin: StoreAdmin, id: string, c: CategoryInput) {
  try {
    const res = await db.category.updateMany({ where: { id, storeId: admin.storeId }, data: { name: c.name, ...(c.slug ? { slug: c.slug } : {}), sortOrder: c.sortOrder, isActive: c.isActive } })
    if (res.count === 0) throw new AdminError('Category not found.')
  } catch (e) {
    if (isUnique(e)) throw new AdminError('A category with that address already exists.')
    throw e
  }
}

/** Products in a deleted category are kept; they simply have no category any more. */
export async function deleteCategory(admin: StoreAdmin, id: string) {
  return db.$transaction(async (tx) => {
    const cat = await tx.category.findFirst({ where: { id, storeId: admin.storeId }, select: { name: true } })
    if (!cat) throw new AdminError('Category not found.')
    await tx.product.updateMany({ where: { categoryId: id, storeId: admin.storeId }, data: { categoryId: null } })
    await tx.category.updateMany({ where: { parentId: id, storeId: admin.storeId }, data: { parentId: null } })
    await tx.category.delete({ where: { id } })
    return cat.name
  })
}
