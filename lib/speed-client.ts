/**
 * Runs in the visitor's browser: watches how fast THIS page load was and reports it once, when the visitor
 * leaves the page or switches tab (that is when the numbers are final). Tiny on purpose, and silent: if the
 * browser cannot measure, or sending fails, nothing happens.
 */
export function watchSpeed(send: (report: { path: string; lcp: number; ttfb: number; cls: number }) => void): () => void {
  let lcp = 0, cls = 0, sent = false
  const observers: PerformanceObserver[] = []
  const watch = (type: string, on: (e: PerformanceEntry) => void) => {
    try { const o = new PerformanceObserver((list) => list.getEntries().forEach(on)); o.observe({ type, buffered: true }); observers.push(o) } catch { /* this browser does not measure it */ }
  }
  watch('largest-contentful-paint', (e) => { lcp = e.startTime })
  watch('layout-shift', (e) => { const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean }; if (!s.hadRecentInput) cls += s.value })
  const report = () => {
    if (sent || document.visibilityState !== 'hidden') return
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (!nav || !(lcp > 0) || !(nav.responseStart > 0)) return
    sent = true
    send({ path: location.pathname, lcp: Math.round(lcp), ttfb: Math.round(nav.responseStart), cls: Math.round(cls * 1000) / 1000 })
  }
  document.addEventListener('visibilitychange', report)
  return () => { document.removeEventListener('visibilitychange', report); observers.forEach((o) => o.disconnect()) }
}
