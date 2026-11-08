import Link from 'next/link'
import { safeLink, toneOf, TONE_CLASSES, type BannerRow } from '@/lib/banners/rules'

/** The notices you control from CSMI. Text is rendered as plain text (React escapes it) and links are re-checked here. */
export default function BannerBar({ banners, className = '' }: { banners: BannerRow[]; className?: string }) {
  if (banners.length === 0) return null
  return (
    <div role="region" aria-label="Notices" className={className}>
      {banners.map((b) => {
        const href = b.linkUrl ? safeLink(b.linkUrl) : null
        return (
          <p key={b.id} className={`${TONE_CLASSES[toneOf(b.tone)]} text-center text-sm px-4 py-2`}>
            {b.text}
            {href && (href.startsWith('/') ? <Link href={href} className="ml-2 underline font-medium">{b.linkLabel || 'Learn more'}</Link> : <a href={href} target="_blank" rel="noopener noreferrer" className="ml-2 underline font-medium">{b.linkLabel || 'Learn more'}</a>)}
          </p>
        )
      })}
    </div>
  )
}
