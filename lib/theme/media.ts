/**
 * THE STORE'S MEDIA LIBRARY, as the theme editor uses it: list what the store already uploaded, register a new
 * upload, and check a video before it may be used in a section. Every query names the store.
 */
import { db } from '@/lib/db'
import { getServiceSecrets } from '@/lib/services/store-services'
import { verifyUpload, type UploadReport } from '@/lib/media/cloudinary'
import { destroyCloudFiles } from '@/lib/media/cloud-cleanup'
import { readCloudDetails, videoVerdict } from '@/lib/theme/schema'

export interface LibraryItem { id: string; kind: 'IMAGE' | 'VIDEO'; url: string; bytes: number | null; approved: boolean }
type Result = { item: LibraryItem } | { error: string }
const SELECT = { id: true, kind: true, url: true, sizeBytes: true, durationSec: true, provider: true, publicId: true } as const
const toItem = (m: { id: string; kind: 'IMAGE' | 'VIDEO'; url: string; sizeBytes: number | null; durationSec: number | null }): LibraryItem => ({ id: m.id, kind: m.kind, url: m.url, bytes: m.sizeBytes, approved: m.kind === 'IMAGE' || m.durationSec !== null })

async function creds(storeId: string) {
  const s = await getServiceSecrets(storeId, 'cloudinary')
  return s?.enabled ? { cloudName: s.credentials.cloudName, apiKey: s.credentials.apiKey, apiSecret: s.credentials.apiSecret } : null
}

/** The newest 60 pictures (or videos) this store has uploaded, product photos included. */
export async function listStoreMedia(storeId: string, kind: 'IMAGE' | 'VIDEO'): Promise<LibraryItem[]> {
  const rows = await db.mediaAsset.findMany({ where: { storeId, kind, provider: 'cloudinary' }, orderBy: { createdAt: 'desc' }, take: 60, select: SELECT })
  return rows.map(toItem)
}

/** Sizes of the files a page uses, for the editor's "heavy top of page" warning. Only this store's own files are known. */
export async function mediaSizes(storeId: string, urls: string[]): Promise<Record<string, number>> {
  if (urls.length === 0) return {}
  const rows = await db.mediaAsset.findMany({ where: { storeId, url: { in: [...new Set(urls)].slice(0, 300) }, sizeBytes: { not: null } }, select: { url: true, sizeBytes: true } })
  return Object.fromEntries(rows.map((r) => [r.url, r.sizeBytes ?? 0]))
}

/**
 * Asks Cloudinary itself how long and how large a video is (the store's own key; the browser is not believed).
 * `hint` = the length the browser measured, used only if Cloudinary's answer has no length in it.
 */
async function measure(c: NonNullable<Awaited<ReturnType<typeof creds>>>, publicId: string, hint: number | null) {
  const url = `https://api.cloudinary.com/v1_1/${c.cloudName}/resources/video/upload/${publicId.split('/').map(encodeURIComponent).join('/')}?media_metadata=true`
  const r = await fetch(url, { headers: { Authorization: `Basic ${Buffer.from(`${c.apiKey}:${c.apiSecret}`).toString('base64')}` }, signal: AbortSignal.timeout(10_000), cache: 'no-store' })
  if (!r.ok) throw new Error(`Cloudinary answered ${r.status}`)
  const d = readCloudDetails(await r.json())
  if (d.duration === null && hint !== null) console.warn('[theme video] Cloudinary gave no length; using the length the browser measured')
  return { ...d, duration: d.duration ?? hint }
}

/** Registers a file the browser just uploaded to the store's Cloudinary. A video is measured and refused (and deleted) if too long or too large. */
export async function saveThemeUpload(storeId: string, report: Partial<UploadReport>, hint: number | null): Promise<Result> {
  const c = await creds(storeId)
  if (!c) return { error: 'Cloudinary is not connected. Connect it in Settings first.' }
  const v = verifyUpload(report, c, storeId)
  if (!v.ok) return { error: v.error }
  let durationSec: number | null = null, bytes = v.bytes
  if (v.kind === 'VIDEO') {
    const remove = () => destroyCloudFiles(storeId, [{ provider: 'cloudinary', publicId: v.publicId, kind: 'VIDEO' }])
    let d: Awaited<ReturnType<typeof measure>>
    try { d = await measure(c, v.publicId, hint) } catch (e) { console.error('[theme video]', e); await remove(); return { error: 'The video could not be checked just now, so it was not kept. Please try again.' } }
    const verdict = videoVerdict(d)
    if (!verdict.ok) { await remove(); return { error: `${verdict.error} The file was removed.` } }
    durationSec = d.duration; bytes = d.bytes ?? v.bytes
  }
  const row = await db.mediaAsset.create({ data: { storeId, kind: v.kind, url: v.url, mimeType: v.mimeType, sizeBytes: bytes, width: v.width, height: v.height, provider: 'cloudinary', publicId: v.publicId, durationSec }, select: SELECT })
  return { item: toItem(row) }
}

/** Checks a video that is already in the library (a product video, say) before a section may use it. Nothing is deleted. */
export async function approveVideo(storeId: string, assetId: string): Promise<Result> {
  const m = await db.mediaAsset.findFirst({ where: { id: assetId, storeId, kind: 'VIDEO', provider: 'cloudinary' }, select: SELECT })
  if (!m?.publicId) return { error: 'Video not found. Reload the page.' }
  const c = await creds(storeId)
  if (!c) return { error: 'Cloudinary is not connected. Connect it in Settings first.' }
  let d: Awaited<ReturnType<typeof measure>>
  try { d = await measure(c, m.publicId, null) } catch (e) { console.error('[theme video]', e); return { error: 'The video could not be checked just now. Please try again.' } }
  const verdict = videoVerdict({ ...d, format: m.url.split('.').pop() ?? d.format })
  if (!verdict.ok) return { error: verdict.error }
  await db.mediaAsset.updateMany({ where: { id: m.id, storeId }, data: { durationSec: d.duration, sizeBytes: d.bytes ?? m.sizeBytes } })
  return { item: { id: m.id, kind: 'VIDEO', url: m.url, bytes: d.bytes ?? m.sizeBytes, approved: true } }
}
