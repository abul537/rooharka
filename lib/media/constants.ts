/** Browser-safe media rules (no Node imports): shared by the upload screen and the server checks. */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024 // Cloudinary free plan limit
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024
export const IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'] as const
export const VIDEO_FORMATS = ['mp4', 'webm', 'mov'] as const
export type ResourceType = 'image' | 'video'

export type FileCheck = { ok: true; type: ResourceType } | { ok: false; error: string }

/** Decides whether a chosen file may be uploaded, before any network traffic. */
export function classifyFile(name: string, size: number): FileCheck {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`
  if ((IMAGE_FORMATS as readonly string[]).includes(ext)) return size > IMAGE_MAX_BYTES ? { ok: false, error: `${name}: photos can be at most ${mb(IMAGE_MAX_BYTES)}.` } : { ok: true, type: 'image' }
  if ((VIDEO_FORMATS as readonly string[]).includes(ext)) return size > VIDEO_MAX_BYTES ? { ok: false, error: `${name}: videos can be at most ${mb(VIDEO_MAX_BYTES)}.` } : { ok: true, type: 'video' }
  return { ok: false, error: `${name}: only JPG, PNG, WebP, GIF, AVIF photos and MP4, WebM, MOV videos are allowed.` }
}
