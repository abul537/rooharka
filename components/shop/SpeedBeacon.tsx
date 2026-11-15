'use client'

import { useEffect } from 'react'
import { watchSpeed } from '@/lib/speed-client'
import { SPEED_SAMPLE } from '@/lib/speed'

/**
 * Reports how fast the page really loaded for one visitor in four (lib/speed.ts), so the owner's Overview can show
 * the shop's true speed. No cookie, nothing personal: three numbers and the kind of page.
 */
export default function SpeedBeacon() {
  useEffect(() => {
    if (Math.random() * SPEED_SAMPLE >= 1 || typeof PerformanceObserver === 'undefined') return
    return watchSpeed((report) => {
      try { navigator.sendBeacon('/api/speed', new Blob([JSON.stringify(report)], { type: 'application/json' })) } catch { /* measuring must never disturb the visitor */ }
    })
  }, [])
  return null
}
