/** Browser-safe helpers for showing media (no Node imports). Mirrors the helpers in cloudinary.ts. */
export const isCloudinaryUrl = (url: string) => url.startsWith('https://res.cloudinary.com/')

/** Resized, auto-format copy served by Cloudinary (images only). Other links are returned unchanged. */
export function imageVariant(url: string, width: number): string {
  return isCloudinaryUrl(url) && url.includes('/image/upload/') ? url.replace('/image/upload/', `/image/upload/f_auto,q_auto,w_${width}/`) : url
}

/** A still picture for a video (thumbnail / poster); null when it cannot be derived. */
export function videoPoster(url: string, width = 800): string | null {
  return isCloudinaryUrl(url) && url.includes('/video/upload/')
    ? url.replace('/video/upload/', `/video/upload/so_0,f_jpg,w_${width}/`).replace(/\.[a-z0-9]+$/i, '.jpg')
    : null
}

/** The widths a picture is offered in. The browser picks the smallest one that is sharp on its screen. */
export const IMAGE_WIDTHS = [320, 480, 640, 960, 1280, 1920] as const

/**
 * Every size of one picture for the browser to choose from (`srcset`), or null for a picture that is not on
 * Cloudinary (it has only its one file). `max` = the largest width the page will ever show it at; sizes up to
 * twice that are offered, for sharp phone and laptop screens. Cloudinary also picks the lightest format the
 * browser understands (AVIF or WebP) and never enlarges a small original.
 */
export function imageSrcSet(url: string, max: number): string | null {
  if (!isCloudinaryUrl(url) || !url.includes('/image/upload/')) return null
  const widths = IMAGE_WIDTHS.filter((w, i) => w <= max * 2 || i === 0 || IMAGE_WIDTHS[i - 1] < max * 2)
  return widths.map((w) => `${url.replace('/image/upload/', `/image/upload/f_auto,q_auto,c_limit,w_${w}/`)} ${w}w`).join(', ')
}
