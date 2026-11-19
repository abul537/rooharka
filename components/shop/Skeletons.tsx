/**
 * LOADING SKELETONS: grey building blocks that each shop page's own `loading.tsx` puts together in the shape of
 * that page, so what the customer sees while waiting matches what arrives (nothing jumps). Drawn on the server:
 * no JavaScript is sent to the browser for them.
 */
import type { ReactNode } from 'react'

/** The wrapper every skeleton uses: the pulse, and "busy" for screen readers, named after the page. */
export function Skeleton({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return <div className={`animate-pulse ${className}`} aria-busy="true" aria-live="polite" aria-label={`Loading ${label}`}>{children}</div>
}
/** One grey shape. */
export const Bar = ({ className }: { className: string }) => <div className={`rounded bg-gray-200 ${className}`} />

/** The centred heading band many pages open with (title + one line under it). */
export function PageTitle({ band = true, narrow = false }: { band?: boolean; narrow?: boolean }) {
  return (
    <div className={band ? 'bg-gradient-to-b from-brand-50 to-white py-12 md:py-14' : 'pb-8'}>
      <div className={`container mx-auto flex flex-col items-center px-4 ${narrow ? 'max-w-md' : ''}`}>
        <Bar className="h-10 w-2/3 max-w-sm md:h-12" />
        <Bar className="mt-4 h-4 w-3/4 max-w-md" />
      </div>
    </div>
  )
}

/** A grid of product cards (picture, name, price), the same columns as the real grids. */
export function ProductGrid({ count = 8 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}><div className="aspect-square rounded-2xl bg-gray-200" /><Bar className="mt-3 h-4 w-3/4" /><Bar className="mt-2 h-4 w-1/3" /></li>
      ))}
    </ul>
  )
}

/** Lines of text, the last one shorter, like a paragraph. */
export function Paragraph({ lines = 4 }: { lines?: number }) {
  return <div className="space-y-3">{Array.from({ length: lines }, (_, i) => <Bar key={i} className={`h-4 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />)}</div>
}

/** A label and an input box, as in the shop's forms. */
export const FormField = () => <div><Bar className="mb-2 h-4 w-24" /><div className="h-12 rounded-lg border border-gray-200 bg-gray-100" /></div>

/** The order summary box on the right of the cart and checkout pages. */
export function SummaryBox({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <Bar className="h-6 w-1/2" />
      <div className="mt-6 space-y-4">{Array.from({ length: rows }, (_, i) => <div key={i} className="flex justify-between"><Bar className="h-4 w-1/3" /><Bar className="h-4 w-1/5" /></div>)}</div>
      <div className="mt-6 flex justify-between border-t border-gray-100 pt-5"><Bar className="h-6 w-1/4" /><Bar className="h-6 w-1/4" /></div>
      <div className="mt-6 h-12 rounded-xl bg-gray-200" />
    </div>
  )
}
