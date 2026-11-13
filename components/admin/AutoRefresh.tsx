'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Keeps a dashboard page up to date by itself: every `seconds` it asks the server for fresh numbers (only while the
 * tab is in front, and never while `paused`). This is how a sale at the counter or a new online order shows up on
 * the Overview and Orders pages without anyone pressing reload. It needs no extra service: the page simply re-reads
 * the same database every other screen writes to.
 */
export default function AutoRefresh({ seconds = 30, paused = false }: { seconds?: number; paused?: boolean }) {
  const router = useRouter()
  const [at, setAt] = useState<string | null>(null)
  useEffect(() => {
    if (paused) return
    const tick = () => { if (document.visibilityState === 'visible') { router.refresh(); setAt(new Date().toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' })) } }
    const t = setInterval(tick, seconds * 1000)
    document.addEventListener('visibilitychange', tick) // coming back to the tab: catch up at once
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [router, seconds, paused])
  return <span className="text-xs text-slate-500" aria-live="off"><span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" />{paused ? 'Updates paused' : `Updates by itself${at ? ` · last at ${at}` : ''}`}</span>
}
