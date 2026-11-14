'use server'

import { adminOrError } from '@/lib/auth/guard'
import { rateLimit } from '@/lib/rate-limit'
import { getServiceSecrets } from '@/lib/services/store-services'
import { createUploadSignature, type SignedUpload, type UploadReport } from '@/lib/media/cloudinary'
import { approveVideo, listStoreMedia, saveThemeUpload, type LibraryItem } from '@/lib/theme/media'

type One = { item: LibraryItem } | { error: string }
const oops = (what: string, e: unknown) => { console.error(`[theme media ${what}]`, e); return { error: 'Something went wrong. Please try again.' } }

/** The store's own pictures or videos, newest first, for the "choose from your library" grid. */
export async function themeMediaListAction(kind: 'IMAGE' | 'VIDEO'): Promise<{ items: LibraryItem[]; cloudReady: boolean } | { error: string }> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  try {
    const [items, s] = await Promise.all([listStoreMedia(g.admin.storeId, kind === 'VIDEO' ? 'VIDEO' : 'IMAGE'), getServiceSecrets(g.admin.storeId, 'cloudinary')])
    return { items, cloudReady: !!s?.enabled }
  } catch (e) { return oops('list', e) }
}

/** Step 1 of an upload: a short-lived signature so the browser can send the file straight to the store's Cloudinary. */
export async function themeMediaSignAction(type: 'image' | 'video'): Promise<{ upload: SignedUpload } | { error: string }> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  if (type !== 'image' && type !== 'video') return { error: 'Invalid file type.' }
  if (!rateLimit(`theme-media-sign:${g.admin.id}`, 60, 60_000).ok) return { error: 'Too many uploads at once. Please wait a minute.' }
  try {
    const s = await getServiceSecrets(g.admin.storeId, 'cloudinary')
    if (!s?.enabled) return { error: 'Connect Cloudinary in Settings first.' }
    return { upload: createUploadSignature({ cloudName: s.credentials.cloudName, apiKey: s.credentials.apiKey, apiSecret: s.credentials.apiSecret }, g.admin.storeId, type) }
  } catch (e) { return oops('sign', e) }
}

/** Step 2: what Cloudinary stored is verified, a video is measured (15 seconds, 10 MB), and the file joins the library. */
export async function themeMediaSaveAction(report: Partial<UploadReport>, seconds: number | null): Promise<One> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  try { return await saveThemeUpload(g.admin.storeId, report ?? {}, typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds : null) } catch (e) { return oops('save', e) }
}

/** Checks a video already in the library before a section may use it. */
export async function themeVideoApproveAction(assetId: string): Promise<One> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  if (!rateLimit(`theme-video-check:${g.admin.id}`, 30, 60_000).ok) return { error: 'Too many checks at once. Please wait a minute.' }
  try { return await approveVideo(g.admin.storeId, String(assetId ?? '')) } catch (e) { return oops('approve', e) }
}
