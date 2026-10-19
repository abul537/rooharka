/**
 * Cloudinary helpers. Each store uses ITS OWN Cloudinary account (the owner pays Cloudinary directly).
 * Files go from the browser straight to Cloudinary using a signature made here, so large videos never
 * pass through our server. Everything the browser reports back is re-verified before it is trusted.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

import { IMAGE_FORMATS, IMAGE_MAX_BYTES, VIDEO_FORMATS, VIDEO_MAX_BYTES, type ResourceType } from '@/lib/media/constants'
export { IMAGE_FORMATS, IMAGE_MAX_BYTES, VIDEO_FORMATS, VIDEO_MAX_BYTES }
export type { ResourceType }

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex')

/** Cloudinary's signing rule: sorted "key=value" pairs joined by "&", the API secret appended, SHA-1. */
export function signParams(params: Record<string, string | number | undefined>, apiSecret: string): string {
  const text = Object.keys(params).sort()
    .filter((k) => params[k] !== undefined && params[k] !== '' && !['file', 'cloud_name', 'resource_type', 'api_key'].includes(k))
    .map((k) => `${k}=${params[k]}`).join('&')
  return sha1(text + apiSecret)
}

/** The folder every upload of a store must live in; also used to reject files that are not the store's own. */
export const productFolder = (storeId: string) => `rooharka/${storeId}/products`

export function uploadUrl(cloudName: string, type: ResourceType) {
  return `https://api.cloudinary.com/v1_1/${cloudName}/${type}/upload`
}

export interface SignedUpload { cloudName: string; apiKey: string; timestamp: number; folder: string; signature: string; uploadUrl: string; resourceType: ResourceType }

export function createUploadSignature(creds: { cloudName: string; apiKey: string; apiSecret: string }, storeId: string, type: ResourceType, now = Date.now()): SignedUpload {
  const timestamp = Math.floor(now / 1000)
  const folder = productFolder(storeId)
  return { cloudName: creds.cloudName, apiKey: creds.apiKey, timestamp, folder, signature: signParams({ folder, timestamp }, creds.apiSecret), uploadUrl: uploadUrl(creds.cloudName, type), resourceType: type }
}

/** What the browser reports after a successful upload (taken from Cloudinary's reply). */
export interface UploadReport {
  public_id: string; version: number; signature: string; resource_type: string; format: string
  bytes: number; width?: number; height?: number
}

export type Verified = { ok: true; kind: 'IMAGE' | 'VIDEO'; url: string; publicId: string; bytes: number; width: number | null; height: number | null; mimeType: string } | { ok: false; error: string }

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' }

/**
 * Trust nothing the browser says: Cloudinary signs `public_id` + `version` with the store's secret, so a
 * valid signature proves the file really exists in this store's account. The address is rebuilt here.
 */
export function verifyUpload(r: Partial<UploadReport>, creds: { cloudName: string; apiSecret: string }, storeId: string): Verified {
  const publicId = typeof r.public_id === 'string' ? r.public_id : ''
  const version = Number(r.version)
  const format = String(r.format ?? '').toLowerCase()
  const type = r.resource_type
  if (!publicId || !Number.isInteger(version) || version < 1 || typeof r.signature !== 'string' || !/^[a-f0-9]{40}$/.test(r.signature)) return { ok: false, error: 'The upload could not be verified.' }
  if (type !== 'image' && type !== 'video') return { ok: false, error: 'Unsupported file type.' }
  if (!publicId.startsWith(`${productFolder(storeId)}/`) || !/^[A-Za-z0-9_\-\/]+$/.test(publicId)) return { ok: false, error: 'That file does not belong to this store.' }
  const expected = Buffer.from(sha1(`public_id=${publicId}&version=${version}${creds.apiSecret}`), 'hex')
  if (!timingSafeEqual(expected, Buffer.from(r.signature, 'hex'))) return { ok: false, error: 'The upload could not be verified.' }
  const allowed: readonly string[] = type === 'image' ? IMAGE_FORMATS : VIDEO_FORMATS
  if (!allowed.includes(format)) return { ok: false, error: `Files of type .${format || '?'} are not supported.` }
  const bytes = Number(r.bytes) || 0
  if (bytes > (type === 'image' ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES)) return { ok: false, error: 'That file is too large.' }
  return {
    ok: true, kind: type === 'image' ? 'IMAGE' : 'VIDEO', publicId, bytes,
    url: `https://res.cloudinary.com/${creds.cloudName}/${type}/upload/v${version}/${publicId}.${format}`,
    width: Number.isInteger(r.width) ? (r.width as number) : null, height: Number.isInteger(r.height) ? (r.height as number) : null,
    mimeType: MIME[format] ?? `${type}/${format}`,
  }
}

/** Parameters for deleting a file from Cloudinary (signed with the store's secret). */
export function createDestroyRequest(creds: { cloudName: string; apiKey: string; apiSecret: string }, publicId: string, type: ResourceType, now = Date.now()) {
  const timestamp = Math.floor(now / 1000)
  const body = new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), api_key: creds.apiKey, signature: signParams({ public_id: publicId, timestamp }, creds.apiSecret) })
  return { url: `https://api.cloudinary.com/v1_1/${creds.cloudName}/${type}/destroy`, body }
}

export { isCloudinaryUrl, imageVariant, videoPoster } from '@/lib/media/urls'

/** Only https links are accepted when an owner pastes an address instead of uploading. */
export function parseExternalMediaUrl(raw: string): { ok: true; url: string; kind: 'IMAGE' | 'VIDEO'; mimeType: string } | { ok: false; error: string } {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return { ok: false, error: 'That is not a valid link.' } }
  if (u.protocol !== 'https:' || u.username || u.password) return { ok: false, error: 'The link must start with https://' }
  if (raw.length > 500) return { ok: false, error: 'That link is too long.' }
  const ext = u.pathname.split('.').pop()?.toLowerCase() ?? ''
  if ((IMAGE_FORMATS as readonly string[]).includes(ext)) return { ok: true, url: u.href, kind: 'IMAGE', mimeType: MIME[ext] }
  if ((VIDEO_FORMATS as readonly string[]).includes(ext)) return { ok: true, url: u.href, kind: 'VIDEO', mimeType: MIME[ext] }
  return { ok: false, error: 'The link must end in .jpg, .png, .webp, .gif, .avif, .mp4, .webm or .mov' }
}
