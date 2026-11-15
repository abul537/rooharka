'use client'

import { useEffect } from 'react'

/**
 * Shown inside the shop when a page fails to load (a database hiccup, a bug). The customer gets a calm message
 * and a way to try again; the technical detail goes to the server log and the platform's error list, never on screen.
 */
export default function ShopError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    try { navigator.sendBeacon('/api/client-error', new Blob([JSON.stringify({ message: String(error?.message ?? '').slice(0, 300), digest: error?.digest ?? null, path: location.pathname })], { type: 'application/json' })) } catch { /* reporting must never make things worse */ }
  }, [error])
  return (
    <section className="container mx-auto px-4 py-24 text-center">
      <h1 className="font-playfair text-4xl font-bold text-gray-900">Something went wrong</h1>
      <p className="mx-auto mt-4 max-w-md text-gray-600">This page could not be shown just now. Your order, if you placed one, is safe. Please try again.</p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <button onClick={reset} className="rounded-[var(--r-btn,0.75rem)] bg-brand-700 px-7 py-3.5 font-semibold text-white hover:bg-brand-800">Try again</button>
        <a href="/shop" className="rounded-[var(--r-btn,0.75rem)] border-2 border-brand-700 px-7 py-3.5 font-semibold text-brand-800 hover:bg-brand-50">Browse the shop</a>
      </div>
    </section>
  )
}
