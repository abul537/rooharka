import { randomBytes } from 'node:crypto'
import { slugify, uniqueSlug, type NewProduct, type NewVariant, type ProductEditResult, type SectionEdit } from '@/lib/admin/product-rules'
import { combinations, planGeneration, readOptionValues, skuFor, variantLabel, type OptionGroup } from '@/lib/variants/rules'
import { db } from '@/lib/db'
import type { StoreAdmin } from '@/lib/auth/guard'
import type { ProductEdit, VariantEdit } from './product-rules'
import { AdminError } from './orders'
import { handleTakenError } from '@/lib/admin/product-mvp'
import { LIST_PAGE_SIZE, LOW_STOCK_AT, cloneName, cloneSku, mergeTags, type BulkRequest, type ListQuery } from '@/lib/admin/product-extras'

/** The database filter for the product list. Always starts from the store, so no filter can reach another store. */
function listWhere(storeId: string, q: ListQuery) {
  const and: object[] = []
  if (q.q) and.push({ OR: [
    { name: { contains: q.q, mode: 'insensitive' } }, { vendor: { contains: q.q, mode: 'insensitive' } }, { tags: { has: q.q } },
    { variants: { some: { OR: [{ sku: { contains: q.q.toUpperCase() } }, { barcode: q.q }] } } },
  ] })
  if (q.status) and.push({ status: q.status })
  if (q.type) and.push({ type: q.type })
  if (q.categoryId) and.push({ categoryId: q.categoryId === 'none' ? null : q.categoryId })
  if (q.tag) and.push({ tags: { has: q.tag } })
  // Sold out: nothing on sale that can still be bought. Low: a counted item on sale with 1..LOW_STOCK_AT left.
  if (q.stock === 'out') and.push({ variants: { none: { isActive: true, OR: [{ trackStock: false }, { stock: { gt: 0 } }] } } })
  if (q.stock === 'low') and.push({ type: { not: 'MEASURABLE' }, variants: { some: { isActive: true, trackStock: true, stock: { gt: 0, lte: LOW_STOCK_AT } } } })
  return { storeId, ...(and.length ? { AND: and } : {}) }
}
const LIST_ORDER = { newest: { createdAt: 'desc' }, oldest: { createdAt: 'asc' }, name: { name: 'asc' }, 'name-desc': { name: 'desc' }, updated: { updatedAt: 'desc' } } as const

export async function listProducts(storeId: string, q: ListQuery) {
  const where = listWhere(storeId, q)
  const [rows, total, byStatus] = await Promise.all([
    db.product.findMany({
      where, orderBy: [LIST_ORDER[q.sort], { id: 'asc' }], skip: (q.page - 1) * LIST_PAGE_SIZE, take: LIST_PAGE_SIZE,
      select: { id: true, name: true, status: true, type: true, unitCode: true, vendor: true, isFeatured: true, category: { select: { name: true } }, media: { where: { isPrimary: true }, take: 1, select: { media: { select: { url: true } } } }, variants: { select: { price: true, stock: true, isActive: true, trackStock: true } } },
    }),
    db.product.count({ where }),
    db.product.groupBy({ by: ['status'], where: { storeId }, _count: { _all: true } }),
  ])
  const counts: Record<string, number> = { ACTIVE: 0, DRAFT: 0, ARCHIVED: 0 }
  for (const r of byStatus as { status: string; _count: { _all: number } }[]) counts[r.status] = r._count._all
  return { rows, total, counts }
}

/** Every tag and vendor the store already uses, for the suggestions under the fields. */
export async function listOrganisation(storeId: string): Promise<{ tags: string[]; vendors: string[] }> {
  const rows = await db.product.findMany({ where: { storeId }, select: { tags: true, vendor: true }, take: 2000 })
  const tags = new Set<string>(), vendors = new Set<string>()
  for (const r of rows as { tags: string[]; vendor: string | null }[]) { r.tags.forEach((t) => tags.add(t)); if (r.vendor) vendors.add(r.vendor) }
  return { tags: [...tags].sort((a, b) => a.localeCompare(b)).slice(0, 200), vendors: [...vendors].sort((a, b) => a.localeCompare(b)).slice(0, 200) }
}

export async function getProductForEdit(storeId: string, id: string) {
  return db.product.findFirst({
    where: { id, storeId },
    select: {
      id: true, name: true, subtitle: true, shortDescription: true, description: true, status: true, slug: true, categoryId: true, seoTitle: true, seoDescription: true, isFeatured: true, type: true, optionGroups: true, unitCode: true, qtyMin: true, qtyStep: true, vendor: true, tags: true, createdAt: true, updatedAt: true, productType: true, taxonomyId: true, taxonomyPath: true, taxable: true, requiresShipping: true, weightUnit: true, originCountry: true, hsCode: true,
      variants: { orderBy: { sortOrder: 'asc' }, select: { id: true, sku: true, barcode: true, costPrice: true, weightGrams: true, allowBackorder: true, imageId: true, optionValues: true, label: true, badge: true, price: true, compareAtPrice: true, stock: true, trackStock: true, isDefault: true, isActive: true } },
    },
  })
}

/** Saves the product and its sizes together. Returns what changed (for the audit log). */
export async function saveProduct(admin: StoreAdmin, productId: string, p: ProductEdit, variants: VariantEdit[], defaultId: string, measure: Pick<ProductEditResult, 'unitCode' | 'qtyMin' | 'qtyStep' | 'slug' | 'allowBackorder'>) {
  return saveProductTx(admin, productId, p, variants, defaultId, measure).catch((e) => {
    // The database refuses a second product with the same page address, or a second variant with the same SKU.
    if (isUnique(e)) throw new AdminError(String((e as { meta?: { target?: unknown } }).meta?.target ?? '').includes('slug') ? 'That page address is already used by another product.' : 'That SKU or page address is already in use. Every SKU must be different.')
    throw e
  })
}

function saveProductTx(admin: StoreAdmin, productId: string, p: ProductEdit, variants: VariantEdit[], defaultId: string, measure: Pick<ProductEditResult, 'unitCode' | 'qtyMin' | 'qtyStep' | 'slug' | 'allowBackorder'>) {
  return db.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: productId, storeId: admin.storeId }, select: { id: true, name: true, status: true, slug: true, variants: { select: { id: true, price: true, compareAtPrice: true, isActive: true, sku: true } } } })
    if (!product) throw new AdminError('Product not found.')
    if (product.variants.length !== variants.length || !variants.every((v) => product.variants.some((x) => x.id === v.id))) {
      throw new AdminError('The variants changed while you were editing. Please reload the page.')
    }
    if (p.categoryId && !(await tx.category.count({ where: { id: p.categoryId, storeId: admin.storeId } }))) throw new AdminError('That category does not exist.')
    if (measure.slug && measure.slug !== product.slug) {
      const taken = await slugsLike(tx, admin.storeId, measure.slug, product.id)
      if (taken.has(measure.slug)) throw new AdminError(handleTakenError(measure.slug, taken))
    }
    await assertSkusFree(tx, admin.storeId, variants.map((v) => v.sku).filter((x): x is string => !!x), product.id)
    // A variant's photo must be one of THIS product's own photos.
    const wanted = [...new Set(variants.map((v) => v.imageId).filter((x): x is string => !!x))]
    if (wanted.length) {
      const own = await tx.productMedia.findMany({ where: { productId: product.id, mediaId: { in: wanted }, media: { kind: 'IMAGE' } }, select: { mediaId: true } })
      if (own.length !== wanted.length) throw new AdminError('A variant photo must be one of this product’s own photos. Please reload the page.')
    }
    await tx.product.update({ where: { id: product.id }, data: { ...p, unitCode: measure.unitCode, qtyMin: measure.qtyMin, qtyStep: measure.qtyStep, ...(measure.slug ? { slug: measure.slug } : {}) } })

    const changes: Record<string, unknown> = {}
    if (measure.slug && measure.slug !== product.slug) changes.slug = [product.slug, measure.slug]
    // SKUs may be swapped between variants in one save: park the changing ones on temporary codes first.
    const reSku = variants.filter((v) => v.sku && v.sku !== product.variants.find((x) => x.id === v.id)!.sku)
    for (const v of reSku) await tx.productVariant.update({ where: { id: v.id }, data: { sku: `TMP-${v.id}`.slice(0, 40) } })
    for (const v of variants) {
      const old = product.variants.find((x) => x.id === v.id)!
      if (old.price.toNumber() !== v.price) changes[`${v.label}.price`] = [old.price.toNumber(), v.price]
      if (old.isActive !== v.isActive) changes[`${v.label}.active`] = [old.isActive, v.isActive]
      if (v.sku && old.sku !== v.sku) changes[`${v.label}.sku`] = [old.sku, v.sku]
      await tx.productVariant.update({
        where: { id: v.id },
        // sku / barcode / cost / weight / trackStock are undefined when the form did not carry them: then they stay as they are.
        data: { label: v.label, badge: v.badge, price: v.price, compareAtPrice: v.compareAtPrice, isActive: v.isActive, isDefault: v.id === defaultId, sku: v.sku, barcode: v.barcode, costPrice: v.costPrice, weightGrams: v.weightGrams, trackStock: v.trackStock, imageId: v.imageId, allowBackorder: measure.allowBackorder, storeId: admin.storeId },
      })
      const delta = v.stock - v.stockWas
      if (delta !== 0) {
        // Apply the difference so orders placed while the form was open are not overwritten.
        const after = await tx.productVariant.update({ where: { id: v.id }, data: { stock: { increment: delta } }, select: { stock: true } })
        if (after.stock < 0 && !measure.allowBackorder) await tx.productVariant.update({ where: { id: v.id }, data: { stock: 0 } })
        changes[`${v.label}.stockChange`] = delta
      }
    }
    if (product.status !== p.status) changes.status = [product.status, p.status]
    return changes
  })
}

// ============================================================================ create / delete
/**
 * A SKU must be unique in the whole store (not just inside one product), so a scan at the counter or a line in a
 * spreadsheet always means exactly one item. The database enforces it too (unique storeId + sku); this gives the
 * readable message, and also covers older rows that do not carry their store yet.
 */
async function assertSkusFree(tx: Pick<typeof db, 'productVariant'>, storeId: string, skus: string[], exceptProductId?: string) {
  if (skus.length === 0) return
  const clash = await tx.productVariant.findFirst({
    where: { sku: { in: skus }, product: { storeId }, ...(exceptProductId ? { productId: { not: exceptProductId } } : {}) },
    select: { sku: true, product: { select: { name: true } } },
  })
  if (clash) throw new AdminError(`The SKU ${clash.sku} is already used by “${clash.product.name}”. Every SKU in your store must be different.`)
}

async function slugsLike(tx: Pick<typeof db, 'product'>, storeId: string, base: string, exceptId?: string): Promise<Set<string>> {
  const rows = await tx.product.findMany({ where: { storeId, slug: { startsWith: base }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { slug: true } })
  return new Set(rows.map((p: { slug: string }) => p.slug))
}


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
    if (userChoseSlug && taken.has(input.slug)) throw new AdminError(handleTakenError(input.slug, taken))
    if (input.variant.sku) await assertSkusFree(db, admin.storeId, [input.variant.sku])
    const slug = uniqueSlug(input.slug, taken)
    try {
      const created = await db.product.create({
        data: {
          storeId: admin.storeId, slug, ...input.product,
          type: input.type, unitCode: input.unitCode, qtyMin: input.qtyMin, qtyStep: input.qtyStep,
          optionGroups: input.optionGroups.length ? (input.optionGroups as never) : undefined,
          variants: { create: initialVariants(input, slug).map((v) => ({ ...v, storeId: admin.storeId })) },
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

/** The variants a new product starts with: every option combination from one template, or a single variant. */
function initialVariants(input: NewProduct, slug: string) {
  if (input.optionGroups.length === 0) return [{ ...variantData(input.variant), isDefault: true, sortOrder: 0 }]
  const taken = new Set<string>()
  return combinations(input.optionGroups).map((values, i) => {
    const sku = skuFor(slug, values, input.optionGroups, taken)
    taken.add(sku)
    return { ...variantData({ ...input.variant, label: variantLabel(values, input.optionGroups), sku, barcode: null }), optionValues: values as never, isDefault: i === 0, sortOrder: i }
  })
}

function variantData(v: NewVariant) {
  return { label: v.label, badge: v.badge, sku: v.sku || autoSku(v.label), price: v.price, compareAtPrice: v.compareAtPrice, stock: v.stock, isActive: true, barcode: v.barcode ?? null, costPrice: v.costPrice ?? null, weightGrams: v.weightGrams ?? null, ...(v.trackStock === undefined ? {} : { trackStock: v.trackStock }), ...(v.allowBackorder === undefined ? {} : { allowBackorder: v.allowBackorder }) }
}

async function ownedProduct(tx: Pick<typeof db, 'product'>, admin: StoreAdmin, productId: string) {
  const p = await tx.product.findFirst({ where: { id: productId, storeId: admin.storeId }, select: { id: true, slug: true, type: true } })
  if (!p) throw new AdminError('Product not found.')
  return p
}

export async function addVariant(admin: StoreAdmin, productId: string, v: NewVariant) {
  return db.$transaction(async (tx) => {
    const owned = await ownedProduct(tx, admin, productId)
    if (owned.type === 'SIMPLE') throw new AdminError('A simple product has one item only. Create it as a product with variants if you need more.')
    const last = await tx.productVariant.findFirst({ where: { productId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } })
    if (v.sku) await assertSkusFree(tx, admin.storeId, [v.sku], productId)
    try {
      const created = await tx.productVariant.create({ data: { productId, storeId: admin.storeId, ...variantData(v), isDefault: false, sortOrder: (last?.sortOrder ?? -1) + 1 } })
      return created.id
    } catch (e) {
      if (isUnique(e)) throw new AdminError('That SKU is already used in your store. Every SKU must be different.')
      throw e
    }
  })
}

export async function deleteVariant(admin: StoreAdmin, productId: string, variantId: string) {
  return db.$transaction(async (tx) => {
    await ownedProduct(tx, admin, productId)
    const variants = await tx.productVariant.findMany({ where: { productId }, orderBy: { sortOrder: 'asc' }, select: { id: true, isDefault: true, isActive: true, label: true } })
    const target = variants.find((v) => v.id === variantId)
    if (!target) throw new AdminError('Variant not found.')
    if (variants.length <= 1) throw new AdminError('A product needs at least one variant. Add another first, or delete the whole product.')
    await tx.cartItem.deleteMany({ where: { variantId } })
    await tx.productVariant.delete({ where: { id: variantId } }) // old orders keep their own copy of the name and price
    if (target.isDefault) {
      const next = variants.find((v) => v.id !== variantId && v.isActive) ?? variants.find((v) => v.id !== variantId)!
      await tx.productVariant.update({ where: { id: next.id }, data: { isDefault: true } })
    }
    return { label: target.label }
  })
}

/**
 * Makes the variants match the options (Size: S, M / Colour: Red, Blue): creates the missing combinations with the
 * given starting price and stock, switches off the ones that no longer exist, and revives ones that came back.
 * Nothing is ever deleted, so past orders and stock history stay intact.
 */
export async function generateVariants(admin: StoreAdmin, productId: string, groups: OptionGroup[], start: { price: number; compareAtPrice: number | null; stock: number }) {
  return db.$transaction(async (tx) => {
    const p = await tx.product.findFirst({ where: { id: productId, storeId: admin.storeId }, select: { id: true, slug: true, type: true, variants: { orderBy: { sortOrder: 'asc' }, select: { id: true, sku: true, optionValues: true, isActive: true, isDefault: true, sortOrder: true } } } })
    if (!p) throw new AdminError('Product not found.')
    if (p.type !== 'VARIANTS') throw new AdminError('Options only apply to products with variants.')
    const plan = planGeneration(groups, p.variants.map((v) => ({ id: v.id, optionValues: readOptionValues(v.optionValues), isActive: v.isActive })))
    const stillActive = p.variants.filter((v) => v.isActive && !plan.deactivate.includes(v.id)).length + plan.reactivate.length + plan.create.length
    if (stillActive === 0) throw new AdminError('That would switch off every variant. Keep at least one option value.')

    const taken = new Set(p.variants.map((v) => v.sku))
    let order = (p.variants.at(-1)?.sortOrder ?? -1) + 1
    for (const c of plan.create) {
      const sku = skuFor(p.slug, c.values, groups, taken)
      taken.add(sku)
      await tx.productVariant.create({ data: { productId, storeId: admin.storeId, label: c.label, sku, optionValues: c.values as never, price: start.price, compareAtPrice: start.compareAtPrice, stock: start.stock, isActive: true, isDefault: false, sortOrder: order++ } })
    }
    if (plan.deactivate.length) await tx.productVariant.updateMany({ where: { productId, id: { in: plan.deactivate } }, data: { isActive: false, isDefault: false } })
    if (plan.reactivate.length) await tx.productVariant.updateMany({ where: { productId, id: { in: plan.reactivate } }, data: { isActive: true } })
    await tx.product.update({ where: { id: productId }, data: { optionGroups: groups as never } })

    // The variant shown first must exist and be on.
    const now = await tx.productVariant.findMany({ where: { productId }, orderBy: { sortOrder: 'asc' }, select: { id: true, isActive: true, isDefault: true } })
    const def = now.find((v) => v.isDefault && v.isActive)
    if (!def) {
      const next = now.find((v) => v.isActive)!
      await tx.productVariant.updateMany({ where: { productId }, data: { isDefault: false } })
      await tx.productVariant.update({ where: { id: next.id }, data: { isDefault: true } })
    }
    return { created: plan.create.length, switchedOff: plan.deactivate.length, switchedOn: plan.reactivate.length, kept: plan.keep }
  })
}

// ============================================================================ duplicate
/**
 * A full copy of a product, following every connection it has in the database:
 *   variants (new SKUs, options kept), photos and videos (the same files, linked again, same order and main picture),
 *   page sections, category, vendor, tags, options, selling unit and search-engine text.
 * NOT copied, on purpose: reviews and orders (they belong to the original), barcodes (a barcode names one physical
 * item) and, unless asked, stock (so the shop never shows stock that does not exist). The copy starts as a DRAFT.
 */
export async function duplicateProduct(admin: StoreAdmin, productId: string, opts: { copyStock: boolean }): Promise<{ id: string; name: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const src = await tx.product.findFirst({
          where: { id: productId, storeId: admin.storeId },
          include: { variants: { orderBy: { sortOrder: 'asc' } }, media: { orderBy: { sortOrder: 'asc' } }, sections: { orderBy: { sortOrder: 'asc' } } },
        })
        if (!src) throw new AdminError('Product not found.')
        const base = `${src.slug}-copy`.slice(0, 56)
        const taken = new Set((await tx.product.findMany({ where: { storeId: admin.storeId, slug: { startsWith: base } }, select: { slug: true } })).map((p: { slug: string }) => p.slug))
        // SKUs are unique in the whole store, so the copy's codes must be free everywhere, not just in this product.
        const skus = new Set<string>([...src.variants.map((v: { sku: string }) => v.sku), ...(await tx.productVariant.findMany({ where: { product: { storeId: admin.storeId }, sku: { contains: '-COPY' } }, select: { sku: true } })).map((v: { sku: string }) => v.sku)])
        const name = cloneName(src.name)
        const created = await tx.product.create({
          data: {
            storeId: admin.storeId, categoryId: src.categoryId, name, slug: uniqueSlug(base, taken), subtitle: src.subtitle, shortDescription: src.shortDescription, description: src.description,
            status: 'DRAFT', isFeatured: false, type: src.type, optionGroups: (src.optionGroups ?? undefined) as never, unitCode: src.unitCode, qtyMin: src.qtyMin, qtyStep: src.qtyStep,
            vendor: src.vendor, tags: src.tags, seoTitle: src.seoTitle, seoDescription: src.seoDescription,
            productType: src.productType, taxonomyId: src.taxonomyId, taxonomyPath: src.taxonomyPath, taxable: src.taxable, requiresShipping: src.requiresShipping, weightUnit: src.weightUnit, originCountry: src.originCountry, hsCode: src.hsCode,
            variants: { create: src.variants.map((v: typeof src.variants[number]) => {
              const sku = cloneSku(v.sku, skus); skus.add(sku)
              return { sku, storeId: admin.storeId, allowBackorder: v.allowBackorder, imageId: v.imageId, label: v.label, badge: v.badge, price: v.price, compareAtPrice: v.compareAtPrice, costPrice: v.costPrice, barcode: null, stock: opts.copyStock ? v.stock : 0, trackStock: v.trackStock, weightGrams: v.weightGrams, optionValues: (v.optionValues ?? undefined) as never, isDefault: v.isDefault, isActive: v.isActive, sortOrder: v.sortOrder }
            }) },
            media: { create: src.media.map((m: typeof src.media[number]) => ({ mediaId: m.mediaId, isPrimary: m.isPrimary, sortOrder: m.sortOrder })) },
            sections: { create: src.sections.map((x: typeof src.sections[number]) => ({ type: x.type, tab: x.tab, tabLabel: x.tabLabel, title: x.title, items: x.items as never, sortOrder: x.sortOrder, isVisible: x.isVisible })) },
          },
          select: { id: true },
        })
        return { id: created.id, name }
      })
    } catch (e) {
      if (!isUnique(e)) throw e // someone took the page address in the same instant: look again
    }
  }
  throw new AdminError('Could not make the copy. Please try again.')
}

// ============================================================================ bulk actions
/** One action on many products. Every statement is limited to the admin's own store. Returns how many changed and how many were skipped (with why). */
export async function bulkProducts(admin: StoreAdmin, r: BulkRequest): Promise<{ changed: number; skipped: number; why: string | null; cloud: CloudRef[]; slugs: string[] }> {
  const mine = { id: { in: r.ids }, storeId: admin.storeId }
  const slugs = (await db.product.findMany({ where: mine, select: { slug: true } })).map((p: { slug: string }) => p.slug)
  const out = (changed: number, why: string | null = null, cloud: CloudRef[] = []) => ({ changed, skipped: slugs.length - changed, why: changed < slugs.length ? why : null, cloud, slugs })
  switch (r.action) {
    case 'activate': // a live product must have something to sell
      return out((await db.product.updateMany({ where: { ...mine, variants: { some: { isActive: true } } }, data: { status: 'ACTIVE' } })).count, 'products with no variant switched on stay as they are')
    case 'draft': return out((await db.product.updateMany({ where: mine, data: { status: 'DRAFT' } })).count)
    case 'archive': return out((await db.product.updateMany({ where: mine, data: { status: 'ARCHIVED' } })).count)
    case 'feature': return out((await db.product.updateMany({ where: mine, data: { isFeatured: true } })).count)
    case 'unfeature': return out((await db.product.updateMany({ where: mine, data: { isFeatured: false } })).count)
    case 'category':
      await assertCategory(admin.storeId, r.categoryId)
      return out((await db.product.updateMany({ where: mine, data: { categoryId: r.categoryId } })).count)
    case 'add-tags': case 'remove-tags': {
      const rows = await db.product.findMany({ where: mine, select: { id: true, tags: true } })
      for (const p of rows as { id: string; tags: string[] }[]) await db.product.update({ where: { id: p.id }, data: { tags: mergeTags(p.tags, r.tags, r.action === 'add-tags' ? 'add' : 'remove') } })
      return out(rows.length)
    }
    case 'delete': {
      let changed = 0
      const cloud: CloudRef[] = []
      for (const id of r.ids) {
        try { cloud.push(...(await deleteProduct(admin, id)).cloud); changed++ } catch (e) { if (!(e instanceof AdminError)) throw e } // ordered products are kept
      }
      return out(changed, 'products that have been ordered cannot be deleted; archive them instead', cloud)
    }
  }
}

// ============================================================================ export
/** Every product and variant of the store, one row per variant, for the spreadsheet download. */
export async function exportRows(storeId: string) {
  return db.product.findMany({
    where: { storeId }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: 5000,
    select: { name: true, slug: true, status: true, type: true, unitCode: true, vendor: true, tags: true, category: { select: { name: true } }, variants: { orderBy: { sortOrder: 'asc' }, select: { label: true, sku: true, barcode: true, price: true, compareAtPrice: true, costPrice: true, stock: true, trackStock: true, isActive: true, weightGrams: true } } },
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
