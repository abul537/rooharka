'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminOrError, type StoreAdmin } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { AdminError } from '@/lib/admin/orders'
import { parseProductEdit, parseSections, parseVariantFields } from '@/lib/admin/product-rules'
import { addVariant, attachMedia, deleteProduct, deleteVariant, moveMedia, removeMedia, saveProduct, saveSections, setMediaAlt, setPrimaryMedia } from '@/lib/admin/products'
import { getServiceSecrets } from '@/lib/services/store-services'
import { createUploadSignature, parseExternalMediaUrl, verifyUpload, type SignedUpload, type UploadReport } from '@/lib/media/cloudinary'
import { destroyCloudFiles } from '@/lib/media/cloud-cleanup'
import type { ActionState } from '@/components/admin/ActionForm'

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '')

/** Common wrapper: permission, error to message, audit, refresh. Every export below must be an `async function`. */
async function guarded(
  action: string, productId: string, work: (admin: StoreAdmin) => Promise<string>, entity = 'Product', after?: unknown,
): Promise<ActionState> {
  const g = await adminOrError('products.edit')
  if ('error' in g) return g
  try {
    const ok = await work(g.admin)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: `product.${action}`, entity, entityId: productId, after })
    const slug = (await db.product.findFirst({ where: { id: productId, storeId: g.admin.storeId }, select: { slug: true } }))?.slug
    for (const p of ['/admin/products', `/admin/products/${productId}`, '/shop', '/product', '/checkout', ...(slug ? [`/product/${slug}`] : [])]) revalidatePath(p)
    return { ok }
  } catch (e) {
    if (e instanceof AdminError) return { error: e.message }
    console.error(`[product ${action}]`, e)
    return { error: 'Something went wrong. Nothing was changed; please try again.' }
  }
}

export async function saveProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const productId = str(fd, 'productId')
  const g = await adminOrError('products.edit'); if ('error' in g) return g
  // Which sizes belong to this product comes from the database, never from the form.
  const owned = await db.product.findFirst({ where: { id: productId, storeId: g.admin.storeId }, select: { variants: { select: { id: true } } } })
  if (!owned) return { error: 'Product not found.' }
  const parsed = parseProductEdit(fd, owned.variants.map((v) => v.id))
  if (!parsed.ok) return { error: parsed.error }
  return guarded('update', productId, async (admin) => {
    const changes = await saveProduct(admin, productId, parsed.value.product, parsed.value.variants, parsed.value.defaultId)
    await audit({ storeId: admin.storeId, userId: admin.id, action: 'product.changes', entity: 'Product', entityId: productId, after: changes })
    return 'Product saved. The store is updated.'
  })
}

export async function addVariantAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseVariantFields(fd, 'nv_')
  if (!parsed.ok) return { error: parsed.error }
  return guarded('variant.add', str(fd, 'productId'), async (admin) => {
    await addVariant(admin, str(fd, 'productId'), parsed.value)
    return `Size “${parsed.value.label}” added.`
  })
}

export async function deleteVariantAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return guarded('variant.delete', str(fd, 'productId'), async (admin) => {
    const r = await deleteVariant(admin, str(fd, 'productId'), str(fd, 'variantId'))
    return `Size “${r.label}” deleted.`
  })
}

export async function saveSectionsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const count = Number.parseInt(str(fd, 'count'), 10)
  if (!Number.isInteger(count) || count < 0 || count > 30) return { error: 'Invalid form.' }
  const parsed = parseSections(fd, count)
  if (!parsed.ok) return { error: parsed.error }
  return guarded('sections', str(fd, 'productId'), async (admin) => {
    await saveSections(admin, str(fd, 'productId'), parsed.value)
    return 'Page sections saved.'
  })
}

/** Deleting is only allowed for products that were never ordered; others are archived instead. */
export async function deleteProductAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('products.edit'); if ('error' in g) return g
  const productId = str(fd, 'productId')
  try {
    const r = await deleteProduct(g.admin, productId)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'product.delete', entity: 'Product', entityId: productId, after: { name: r.name } })
    await destroyCloudFiles(g.admin.storeId, r.cloud)
    for (const p of ['/admin/products', '/shop', '/product', `/product/${r.slug}`]) revalidatePath(p)
  } catch (e) {
    if (e instanceof AdminError) return { error: e.message }
    console.error('[product delete]', e)
    return { error: 'Something went wrong. Nothing was changed; please try again.' }
  }
  redirect('/admin/products?deleted=1') // outside try: redirect works by throwing
}

// ------------------------------------------------------------------------------------ media
export type SignResult = { upload: SignedUpload } | { error: string }

/** Step 1 of an upload: a short-lived signature so the browser may upload to THIS store's Cloudinary folder. */
export async function signMediaUploadAction(type: 'image' | 'video'): Promise<SignResult> {
  const g = await adminOrError('products.edit'); if ('error' in g) return g
  if (type !== 'image' && type !== 'video') return { error: 'Invalid file type.' }
  if (!rateLimit(`media-sign:${g.admin.id}`, 60, 60_000).ok) return { error: 'Too many uploads at once. Please wait a minute.' }
  try {
    const s = await getServiceSecrets(g.admin.storeId, 'cloudinary')
    if (!s?.enabled) return { error: 'Connect Cloudinary in Settings first (or paste a link instead).' }
    return { upload: createUploadSignature({ cloudName: s.credentials.cloudName, apiKey: s.credentials.apiKey, apiSecret: s.credentials.apiSecret }, g.admin.storeId, type) }
  } catch (e) {
    console.error('[media sign]', e)
    return { error: 'Could not prepare the upload. Please try again.' }
  }
}

/** Step 2: the browser reports what Cloudinary stored; it is verified before it is saved. */
export async function attachUploadedMediaAction(productId: string, report: Partial<UploadReport>): Promise<ActionState> {
  const g = await adminOrError('products.edit'); if ('error' in g) return g
  const s = await getServiceSecrets(g.admin.storeId, 'cloudinary')
  if (!s) return { error: 'Cloudinary is not connected.' }
  const v = verifyUpload(report, { cloudName: s.credentials.cloudName, apiSecret: s.credentials.apiSecret }, g.admin.storeId)
  if (!v.ok) return { error: v.error }
  return guarded('media.add', productId, async (admin) => {
    await attachMedia(admin, productId, { kind: v.kind, url: v.url, mimeType: v.mimeType, provider: 'cloudinary', publicId: v.publicId, bytes: v.bytes, width: v.width, height: v.height })
    return 'Uploaded.'
  })
}

export async function addExternalMediaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseExternalMediaUrl(str(fd, 'url'))
  if (!parsed.ok) return { error: parsed.error }
  return guarded('media.link', str(fd, 'productId'), async (admin) => {
    await attachMedia(admin, str(fd, 'productId'), { kind: parsed.kind, url: parsed.url, mimeType: parsed.mimeType, provider: 'external' })
    return 'Added.'
  })
}

export async function removeMediaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('products.edit'); if ('error' in g) return g
  let cloud: Awaited<ReturnType<typeof removeMedia>> = null
  const res = await guarded('media.remove', str(fd, 'productId'), async (admin) => { cloud = await removeMedia(admin, str(fd, 'productId'), str(fd, 'linkId')); return 'Removed.' })
  if (res?.ok) await destroyCloudFiles(g.admin.storeId, [cloud])
  return res
}

export async function primaryMediaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return guarded('media.primary', str(fd, 'productId'), async (admin) => { await setPrimaryMedia(admin, str(fd, 'productId'), str(fd, 'linkId')); return 'Main picture changed.' })
}

export async function moveMediaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const dir = str(fd, 'dir') === 'up' ? 'up' : 'down'
  return guarded('media.move', str(fd, 'productId'), async (admin) => { await moveMedia(admin, str(fd, 'productId'), str(fd, 'linkId'), dir); return 'Order changed.' })
}

export async function altMediaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return guarded('media.alt', str(fd, 'productId'), async (admin) => { await setMediaAlt(admin, str(fd, 'productId'), str(fd, 'linkId'), str(fd, 'alt')); return 'Description saved.' })
}
