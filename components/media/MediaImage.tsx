import type { CSSProperties, ImgHTMLAttributes } from 'react'
import { preload } from 'react-dom'
import { imageSrcSet, imageVariant } from '@/lib/media/urls'

/**
 * THE ONE WAY a product or shop photo is put on a page. It does what next/image does, through the store's own
 * Cloudinary account instead of our server (so photos cost the platform nothing to resize, and any photo host
 * stays possible):
 *   - several sizes are offered (`srcset` + `sizes`) and the browser downloads only the one that fits the screen,
 *     in the lightest format it understands (AVIF / WebP);
 *   - pictures further down the page load only when the visitor scrolls near them (`loading="lazy"`);
 *   - the ONE picture a visitor sees first (`priority`) is fetched ahead of everything else, and announced in the
 *     page's head so the download starts before the rest of the page is read;
 *   - `fill` makes it cover its box, whose shape the page fixes in advance, so nothing jumps while it loads.
 * No script is sent to the browser for any of this.
 */
export default function MediaImage({ src, width = 800, fill = false, priority = false, sizes = '100vw', style, alt, ...rest }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'width' | 'height' | 'loading'> & {
  src: string
  /** The largest width (in CSS pixels) this picture is ever shown at. */
  width?: number
  fill?: boolean
  priority?: boolean
  alt: string
}) {
  const srcSet = imageSrcSet(src, width) ?? undefined
  const fallback = imageVariant(src, width)
  if (priority) preload(fallback, { as: 'image', imageSrcSet: srcSet, imageSizes: srcSet ? sizes : undefined, fetchPriority: 'high' })
  const cover: CSSProperties | undefined = fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...style } : style
  // eslint-disable-next-line @next/next/no-img-element -- this component IS the image component
  return <img {...rest} alt={alt} src={fallback} srcSet={srcSet} sizes={srcSet ? sizes : undefined} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined} decoding={priority ? 'sync' : 'async'} style={cover} />
}
