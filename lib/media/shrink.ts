/**
 * MAKES A PHOTO LIGHT BEFORE IT IS UPLOADED (runs in the owner's browser).
 *
 * A phone photo is often 4000 pixels wide and several megabytes; no shop page shows it larger than about 2000
 * pixels. So a big photo is scaled down to at most 2000 pixels on its long side and saved again as WebP (JPEG
 * where the browser cannot write WebP). Uploads become several times faster on mobile data, the owner's
 * Cloudinary storage stays small, and every later resize starts from a lighter file.
 *
 * Careful by design: the original file is returned untouched whenever shrinking is not clearly a gain or anything
 * at all goes wrong (an animated GIF, an SVG, a browser that cannot decode the file, a result that is not smaller).
 */
export const SHRINK_MAX_SIDE = 2000
/** Files at or under this size with no side over the limit are left alone. */
export const SHRINK_SKIP_BYTES = 300 * 1024
const QUALITY = 0.86

/** The size to scale to: the long side at most `max`, the shape kept. Never larger than the original. */
export function fitWithin(width: number, height: number, max = SHRINK_MAX_SIDE): { width: number; height: number } {
  const long = Math.max(width, height)
  if (!(long > max)) return { width, height }
  const k = max / long
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}
/** Whether a file is worth shrinking at all. */
export const shouldShrink = (type: string, bytes: number, width: number, height: number) =>
  ['image/jpeg', 'image/png', 'image/webp'].includes(type) && (bytes > SHRINK_SKIP_BYTES || Math.max(width, height) > SHRINK_MAX_SIDE)

const toBlob = (c: HTMLCanvasElement, type: string) => new Promise<Blob | null>((r) => c.toBlob(r, type, QUALITY))

export async function shrinkImage(file: File): Promise<File> {
  try {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }) // phone photos keep their right way up
    try {
      if (!shouldShrink(file.type, file.size, bitmap.width, bitmap.height)) return file
      const size = fitWithin(bitmap.width, bitmap.height)
      const canvas = document.createElement('canvas')
      canvas.width = size.width; canvas.height = size.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return file
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, 0, 0, size.width, size.height)
      let blob = await toBlob(canvas, 'image/webp')
      // A browser that cannot write WebP answers with a PNG: use JPEG instead, except for PNGs (they may be see-through).
      if (!blob || blob.type !== 'image/webp') blob = file.type === 'image/png' ? null : await toBlob(canvas, 'image/jpeg')
      if (!blob || blob.size >= file.size * 0.9) return file // not clearly lighter: keep the original
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
      return new File([blob], `${file.name.replace(/\.[a-z0-9]+$/i, '')}.${ext}`, { type: blob.type, lastModified: file.lastModified })
    } finally { bitmap.close() }
  } catch { return file }
}
