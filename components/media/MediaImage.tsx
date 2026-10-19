import Image, { type ImageProps } from 'next/image'
import { imageVariant } from '@/lib/media/urls'

/**
 * Product / store photo. Files are served as they are (Cloudinary resizes them itself via `imageVariant`),
 * so Next.js's own image optimizer, which would accept any web address, is not involved. That keeps the
 * store owner's choice of photo host open without turning our server into a public image proxy.
 */
export default function MediaImage({ src, width = 800, ...rest }: Omit<ImageProps, 'src' | 'unoptimized'> & { src: string; width?: number }) {
  // eslint-disable-next-line jsx-a11y/alt-text -- alt is passed through `rest`
  return <Image {...rest} src={imageVariant(src, width)} unoptimized />
}
