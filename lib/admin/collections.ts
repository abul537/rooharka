/**
 * Manual collections: the owner makes a group ("Eid collection") and hand-picks its products.
 * Every statement starts from the admin's own store; product ids from the form are checked against that store
 * before they are linked, so a collection can never contain (or reveal) another store's product.
 */
import { db } from '@/lib/db'
import type { StoreAdmin } from '@/lib/auth/guard'
import { AdminError } from '@/lib/admin/orders'
import { uniqueSlug } from '@/lib/admin/slug'
import type { CollectionInput } from '@/lib/admin/product-mvp'

const isUnique = (e: unknown) => (e as { code?: string })?.code === 'P2002'

export const listCollections = (storeId: string) =>
  db.collection.findMany({ where: { storeId }, orderBy: [{ title: 'asc' }], select: { id: true, title: true, handle: true, isActive: true, _count: { select: { products: true } } } })

export async function getCollection(storeId: string, id: string) {
  return db.collection.findFirst({
    where: { id, storeId },
    select: { id: true, title: true, handle: true, description: true, isActive: true, products: { orderBy: { position: 'asc' }, select: { productId: true } } },
  })
}

/** The store's products for the picker (name, status, picture), newest first. */
export const listPickable = (storeId: string) =>
  db.product.findMany({ where: { storeId, status: { not: 'ARCHIVED' } }, orderBy: { createdAt: 'desc' }, take: 1000, select: { id: true, name: true, status: true, media: { where: { isPrimary: true }, take: 1, select: { media: { select: { url: true } } } } } })

async function handleError(storeId: string, handle: string, exceptId?: string): Promise<AdminError> {
  const rows = await db.collection.findMany({ where: { storeId, handle: { startsWith: handle }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { handle: true } })
  return new AdminError(`That page address is already used by another collection. Try “${uniqueSlug(handle, new Set(rows.map((r: { handle: string }) => r.handle)))}” instead.`)
}

export async function createCollection(admin: StoreAdmin, c: CollectionInput): Promise<string> {
  try {
    return (await db.collection.create({ data: { storeId: admin.storeId, ...c }, select: { id: true } })).id
  } catch (e) {
    if (isUnique(e)) throw await handleError(admin.storeId, c.handle)
    throw e
  }
}

/** Saves the details and replaces the product list with the ticked ones, in the order given. Products themselves are never changed. */
export async function saveCollection(admin: StoreAdmin, id: string, c: CollectionInput, productIds: string[]) {
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.collection.updateMany({ where: { id, storeId: admin.storeId }, data: c })
      if (res.count === 0) throw new AdminError('Collection not found.')
      const own = await tx.product.findMany({ where: { id: { in: productIds }, storeId: admin.storeId }, select: { id: true } })
      const ok = new Set(own.map((p: { id: string }) => p.id))
      const ids = productIds.filter((p) => ok.has(p)) // anything that is not this store's product is dropped silently
      await tx.collectionProduct.deleteMany({ where: { collectionId: id } })
      if (ids.length) await tx.collectionProduct.createMany({ data: ids.map((productId, position) => ({ collectionId: id, productId, position })) })
    })
  } catch (e) {
    if (isUnique(e)) throw await handleError(admin.storeId, c.handle, id)
    throw e
  }
}

export async function deleteCollection(admin: StoreAdmin, id: string): Promise<string> {
  const c = await db.collection.findFirst({ where: { id, storeId: admin.storeId }, select: { title: true } })
  if (!c) throw new AdminError('Collection not found.')
  await db.collection.delete({ where: { id } }) // only the links go with it; the products stay
  return c.title
}

// ------------------------------------------------------------------ storefront
/** A live collection of this store with the ids of its products in the owner's order, or null. */
export async function getPublicCollection(storeId: string, handle: string, preview = false) {
  if (!/^[a-z0-9-]{1,60}$/.test(handle)) return null
  return db.collection.findFirst({
    // In the owner's preview a hidden collection can be looked at too.
    where: { storeId, handle, ...(preview ? {} : { isActive: true }) },
    select: { title: true, handle: true, description: true, products: { orderBy: { position: 'asc' }, select: { productId: true } } },
  })
}
export const listPublicCollections = (storeId: string) =>
  db.collection.findMany({ where: { storeId, isActive: true, products: { some: { product: { status: 'ACTIVE' } } } }, orderBy: { title: 'asc' }, select: { title: true, handle: true } })
