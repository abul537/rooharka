'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { track, type PixelData, type PixelEvent } from '@/lib/pixels-client'

/**
 * Tells the connected pixels about a page the visitor moved to WITHOUT a full reload (the first page view is
 * recorded by the pixel's own start-up script). Draws nothing.
 */
export function PixelPageViews() {
  const path = usePathname(), first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const w = window as unknown as { fbq?: (...a: unknown[]) => void; ttq?: { page: () => void } }
    try { w.fbq?.('track', 'PageView') } catch { /* ignore */ }
    try { w.ttq?.page() } catch { /* ignore */ }
    // Google Analytics follows page changes by itself.
  }, [path])
  return null
}

/** Reports one event when a page is opened (a product being looked at). Draws nothing. */
export function PixelEventOnce({ event, data }: { event: PixelEvent; data: PixelData }) {
  const key = `${event}:${data.id ?? ''}`
  useEffect(() => { track(event, data) }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
