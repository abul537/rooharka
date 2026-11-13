'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const send = (view: boolean) => {
  try { void fetch('/api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ view }), keepalive: true }).catch(() => {}) } catch { /* counting must never break the shop */ }
}

/**
 * Tells the shop's own server "a page was opened" and, once a minute while the tab is in front, "still here".
 * This feeds the visitor numbers on the owner's Overview page. No cookie is set and nothing personal is sent.
 */
export default function VisitBeacon() {
  const path = usePathname()
  useEffect(() => { send(true) }, [path])
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') send(false) }, 60_000)
    return () => clearInterval(t)
  }, [])
  return null
}
