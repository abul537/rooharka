import { randomBytes } from 'node:crypto'
import { slugify, uniqueSlug, type NewProduct, type NewVariant, type SectionEdit } from '@/lib/admin/product-rules'
import { db } from '@/lib/db'
import type { StoreAdmin } from '@/lib/auth/guard'
import type { ProductEdit, VariantEdit } from './product-rules'
import { AdminError } from './orders'

export async function listProducts(storeId: string) {
  return db.product.findMany({
    where: { storeId }, orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, status: true, media: { where: { isPrimary: true }, take: 1, select: { media: { select: { url: true } } } }, variants: { select: { price: true, stock: true, isActive: true, trackStock: true } } },
  })
}

export async function getProductForEdit(storeId: string, id: string) {
  return db.product.findFirst({
    where: { id, storeId },
    select: {
      id: true, name: true, subtitle: true, shortDescription: true, description: true, status: true, slug: true, categoryId: true, seoTitle: true, seoDescription: true, isFeatured: true,
      variants: { orderBy: { sortOrder: 'asc' }, select: { id: true, sku: true, label: true, badge: true, price: true, compareAtPrice: true, stock: true, trackStock: true, isDefault: true, isActive: true } },
    },
  })
}

/** Saves the product and its sizes together. Returns what changed (for the audit log). */
export async function saveProduct(admin: StoreAdmin, productId: string, p: ProductEdit, variants: VariantEdit[], defaultId: string) {
  return db.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: productId, storeId: admin.storeId }, select: { id: true, name: true, status: true, variants: { select: { id: true, price: true, compareAtPrice: true, isActive: true } } } })
    if (!product) throw new AdminError('Product not found.')
    if (product.variants.length !== variants.length || !variants.every((v) => product.variants.some((x) => x.id === v.id))) {
      throw new AdminError('The sizes changed while you were editing. Please reload the page.')
    }
    if (p.categoryId && !(await tx.category.count({ where: { id: p.categoryId, storeId: admin.storeId } }))) throw new AdminError('That category does not exist.')
    await tx.product.update({ where: { id: product.id }, data: p })

    const changes: Record<string, unknown> = {}
    for (const v of variants) {
      const old = product.variants.find((x) => x.id === v.id)!
      if (old.price.toNumber() !== v.price) changes[`${v.label}.price`] = [old.price.toNumber(), v.price]
      if (old.isActive !== v.isActive) changes[`${v.label}.active`] = [old.isActive, v.isActive]
      await tx.productVariant.update({
        where: { id: v.id },
        data: { label: v.label, badge: v.badge, price: v.price, compareAtPrice: v.compareAtPrice, isActive: v.isActive, isDefault: v.id === defaultId },
      })
      const delta = v.stock - v.stockWas
      if (delta !== 0) {
        // Apply the difference so orders placed while the form was open are not overwritten.
        const after = await tx.productVariant.update({ where: { id: v.id }, data: { stock: { increment: delta } }, select: { stock: true } })
        if (after.stock < 0) await tx.productVariant.update({ where: { id: v.id }, data: { stock: 0 } })
        changes[`${v.label}.stockChange`] = delta
      }
    }
    if (product.status !== p.status) changes.status = [product.status, p.status]
    return changes
  })
}

// ============================================================================ create / delete

const isUnique = (e: unknown) => (e as { code?: string })?.code === 'P2002'
const MAX_MEDIA = 12

async function assertCategory(storeId: string, categoryId: string | null) {
  if (!categoryId) return
  const ok = await db.category.count({ where: { id: categoryId, storeId } })
  if (!ok) throw new AdminError('That category does not exist.')
}

const autoSku = (seed: string) => `${slugify(seed).toUpperCase().replace(/-/g, '').slice(0, 6) || 'SKU'}-${randomBytes(2).toString('hex').toUpperCase()}`

export async function createProduct(admin: StoreAdmin, input: NewProduct): Promise<string> {
  await assertCategory(admin.storeId, input.product.categoryId)
  const userChoseSlug = input.slug !== slugify(input.product.name)
  for (let attempt = 0; attempt < 3; attempt++) {
    const taken = new Set((await db.product.findMany({ where: { storeId: admin.storeId, slug: { startsWith: input.slug } }, select: { slug: true } })).map((p) => p.slug))
    if (userChoseSlug && taken.has(input.slug)) throw new AdminError('That page address is already used by another product.')
    const slug = uniqueSlug(input.slug, taken)
    try {
      const created = await db.product.create({
        data: {
          storeId: admin.storeId, slug, ...input.product,
          variants: { create: { ...variantData(input.variant), isDefault: true, sortOrder: 0 } },
        },
        select: { id: true },
      })
      return created.id
    } catch (e) {
      if (!isUnique(e)) throw e // a twin request took the slug: look again
    }
  }
  throw new AdminError('Could not find a free page address. Please try a different name.')
}

function variantData(v: NewVariant) {
  return { label: v.label, badge: v.badge, sku: v.sku || autoSku(v.label), price: v.price, compareAtPrice: v.compareAtPrice, stock: v.stock, isActive: true }
}

async function ownedProduct(tx: Pick<typeof db, 'product'>, admin: StoreAdmin, productId: string) {
  const p = await tx.product.findFirst({ where: { id: productId, storeId: admin.storeId }, select: { id: true, slug: true } })
  if (!p) throw new AdminError('Product not found.')
  return p
}

export async function addVariant(admin: StoreAdmin, productId: string, v: NewVariant) {
  return db.$transaction(async (tx) => {
    await ownedProduct(tx, admin, productId)
    const last = await tx.productVariant.findFirst({ where: { productId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } })
    try {
      const created = await tx.productVariant.create({ data: { productId, ...variantData(v), isDefault: false, sortOrder: (last?.sortOrder ?? -1) + 1 } })
      return created.id
    } catch (e) {
      if (isUnique(e)) throw new AdminError('That SKU is already used by another size of this product.')
      throw e
    }
  })
}

export async function deleteVariant(admin: StoreAdmin, productId: string, variantId: string) {
  return db.$transaction(async (tx) => {
    await ownedProduct(tx, admin, productId)
    const variants = await tx.productVariant.findMany({ where: { productId }, orderBy: { sortOrder: 'asc' }, select: { id: true, isDefault: true, isActive: true, label: true } })
    const target = variants.find((v) => v.id === variantId)
    if (!target) throw new AdminError('Size not found.')
    if (variants.length <= 1) throw new AdminError('A product needs at least one size. Add another size first, or delete the whole product.')
    await tx.cartItem.deleteMany({ where: { variantId } })
    await tx.productVariant.delete({ where: { id: variantId } }) // old orders keep their own copy of the name and price
    if (target.isDefault) {
      const next = variants.find((v) => v.id !== variantId && v.isActive) ?? variants.find((v) => v.id !== variantId)!
      await tx.productVariant.update({ where: { id: next.id }, data: { isDefault: true } })
    }
    return { label: target.label }
  })
}

export interface CloudRef { provider: string; publicId: string | null; kind: 'IMAGE' | 'VIDEO' }

/** Products that were ever ordered can only be archived: deleting them would blur order history. */
export async function deleteProduct(admin: StoreAdmin, productId: string): Promise<{ name: string; slug: string; cloud: CloudRef[] }> {
  return db.$transaction(async (tx) => {
    const p = await tx.product.findFirst({ where: { id: productId, storeId: admin.storeId }, select: { id: true, name: true, slug: true, media: { select: { mediaId: true, media: { select: { provider: true, publicId: true, kind: true } } } } } })
    if (!p) throw new AdminError('Product not found.')
    if (await tx.orderItem.count({ where: { productId } })) {
      throw new AdminError('This product has been ordered, so it cannot be deleted without damaging order history. Set its status to Archived instead: it disappears from the shop and nothing is lost.')
    }
    await tx.cartItem.deleteMany({ where: { productId } })
    await tx.product.delete({ where: { id: productId } }) // sizes, media links, sections and reviews go with it
    const mediaIds = p.media.map((m) => m.mediaId)
    // Files used by this product alone are removed too (files shared with another product stay).
    const stillUsed = new Set((await tx.productMedia.findMany({ where: { mediaId: { in: mediaIds } }, select: { mediaId: true } })).map((m) => m.mediaId))
    const orphan = p.media.filter((m) => !stillUsed.has(m.mediaId))
    await tx.mediaAsset.deleteMany({ where: { id: { in: orphan.map((m) => m.mediaId) } } })
    return { name: p.name, slug: p.slug, cloud: orphan.map((m) => ({ provider: m.media.provider, publicId: m.media.publicId, kind: m.media.kind as 'IMAGE' | 'VIDEO' })) }
  })
}

// ============================================================================ media
export async function listMedia(storeId: string, productId: string) {
  const rows = await db.productMedia.findMany({
    where: { productId, product: { storeId } }, orderBy: { sortOrder: 'asc' },
    select: { id: true, isPrimary: true, media: { select: { id: true, kind: true, url: true, alt: true, provider: true } } },
  })
  return rows.map((r) => ({ id: r.id, isPrimary: r.isPrimary, assetId: r.media.id, kind: r.media.kind as 'IMAGE' | 'VIDEO', url: r.media.url, alt: r.media.alt ?? '', provider: r.media.provider }))
}

export async function attachMedia(admin: StoreAdmin, productId: string, a: { kind: 'IMAGE' | 'VIDEO'; url: string; mimeType: string; provider: 'cloudinary' | 'external'; publicId?: string; bytes?: number; width?: number | null; height?: number | null }) {
  return db.$transaction(async (tx) => {
    await ownedProduct(tx, admin, productId)
    const existing = await tx.productMedia.findMany({ where: { productId }, orderBy: { sortOrder: 'asc' }, select: { sortOrder: true, isPrimary: true, media: { select: { url: true, kind: true } } } })
    if (existing.length >= MAX_MEDIA) throw new AdminError(`A product can have at most ${MAX_MEDIA} photos and videos.`)
    if (existing.some((e) => e.media.url === a.url)) throw new AdminError('That file is already attached to this product.')
    const asset = await tx.mediaAsset.create({
      data: { storeId: admin.storeId, kind: a.kind, url: a.url, mimeType: a.mimeType, provider: a.provider, publicId: a.publicId ?? null, sizeBytes: a.bytes ?? null, width: a.width ?? null, height: a.height ?? null },
    })
    // The first photo becomes the main one; videos are never the main picture.
    const hasPrimary = existing.some((e) => e.isPrimary)
    await tx.productMedia.create({ data: { productId, mediaId: asset.id, isPrimary: a.kind === 'IMAGE' && !hasPrimary, sortOrder: (existing.at(-1)?.sortOrder ?? -1) + 1 } })
    return asset.id
  })
}

export async function removeMedia(admin: StoreAdmin, productId: string, linkId: string): Promise<CloudRef | null> {
  return db.$transaction(async (tx) => {
    await ownedProduct(tx, admin, productId)
    const link = await tx.productMedia.findFirst({ where: { id: linkId, productId }, select: { id: true, isPrimary: true, mediaId: true, media: { select: { provider: true, publicId: true, kind: true } } } })
    if (!link) throw new AdminError('That file was not found.')
    await tx.productMedia.delete({ where: { id: link.id } })
    if (link.isPrimary) {
      const next = await tx.productMedia.findFirst({ where: { productId, media: { kind: 'IMAGE' } }, orderBy: { sortOrder: 'asc' }, select: { id: true } })
      if (next) await tx.productMedia.update({ where: { id: next.id }, data: { isPrimary: true } })
    }
    const shared = await tx.productMedia.count({ where: { mediaId: link.mediaId } })
    if (shared > 0) return null
    await tx.mediaAsset.delete({ where: { id: link.mediaId } })
    return { provider: link.media.provider, publicId: link.media.publicId, kind: link.media.kind as 'IMAGE' | 'VIDEO' }
  })
}

export async function setPrimaryMedia(admin: StoreAdmin, productId: string, linkId: string) {
  await db.$transaction(async (tx) => {
    await ownedProduct(tx, admin, productId)
    const link = await tx.productMedia.findFirst({ where: { id: linkId, productId }, select: { id: true, media: { select: { kind: true } } } })
    if (!link) throw new AdminError('That file was not found.')
    if (link.media.kind !== 'IMAGE') throw new AdminError('Only a photo can be the main picture.')
    await tx.productMedia.updateMany({ where: { productId }, data: { isPrimary: false } })
    await tx.productMedia.update({ where: { id: link.id }, data: { isPrimary: true } })
  })
}

export async function moveMedia(admin: StoreAdmin, productId: string, linkId: string, dir: 'up' | 'down') {
  await db.$transaction(async (tx) => {
    await ownedProduct(tx, admin, productId)
    const rows = await tx.productMedia.findMany({ where: { productId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true } })
    const i = rows.findIndex((r) => r.id === linkId)
    if (i < 0) throw new AdminError('That file was not found.')
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= rows.length) return
    ;[rows[i], rows[j]] = [rows[j], rows[i]]
    for (let k = 0; k < rows.length; k++) await tx.productMedia.update({ where: { id: rows[k].id }, data: { sortOrder: k } })
  })
}

export async function setMediaAlt(admin: StoreAdmin, productId: string, linkId: string, alt: string) {
  const link = await db.productMedia.findFirst({ where: { id: linkId, productId, product: { storeId: admin.storeId } }, select: { mediaId: true } })
  if (!link) throw new AdminError('That file was not found.')
  await db.mediaAsset.update({ where: { id: link.mediaId }, data: { alt: alt.trim().slice(0, 200) || null } })
}

// ============================================================================ page sections
export async function loadSections(storeId: string, productId: string) {
  const rows = await db.productSection.findMany({ where: { productId, product: { storeId } }, orderBy: { sortOrder: 'asc' } })
  return rows.map((s) => ({ type: s.type, tab: s.tab ?? '', tabLabel: s.tabLabel ?? '', title: s.title, items: Array.isArray(s.items) ? (s.items as { title?: string; text?: string }[]) : [], isVisible: s.isVisible }))
}

export async function saveSections(admin: StoreAdmin, productId: string, sections: SectionEdit[]) {
  await db.$transaction(async (tx) => {
    await ownedProduct(tx, admin, productId)
    await tx.productSection.deleteMany({ where: { productId } })
    if (sections.length) {
      await tx.productSection.createMany({
        data: sections.map((s, i) => ({ productId, type: s.type, tab: s.tab, tabLabel: s.tabLabel, title: s.title, items: s.items as never, sortOrder: i, isVisible: s.isVisible })),
      })
    }
  })
}
