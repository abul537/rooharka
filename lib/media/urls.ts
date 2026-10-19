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
