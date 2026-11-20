import Link from 'next/link'
import { PRO_FEATURES, PRO_FEATURE_KEYS, type ProFeature } from '@/lib/plans/catalog'

/** The small "Pro" mark used beside menu entries and card titles. */
export const ProBadge = () => <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-800">Pro</span>

/**
 * Shown INSTEAD of a Pro page when the store's plan does not include it: what the feature does for the shop, what
 * else Pro brings, and the way to upgrade. The server refuses the feature's actions as well; this is the friendly side.
 */
export function ProLock({ feature, title }: { feature: ProFeature; title?: string }) {
  const f = PRO_FEATURES[feature]
  const others = PRO_FEATURE_KEYS.filter((k) => k !== feature).slice(0, 8)
  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="flex items-center text-2xl font-bold">{title ?? f.short}<ProBadge /></h1>
      <section className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-6">
        <p className="text-lg font-semibold text-slate-900">Part of the Pro plan</p>
        <p className="mt-2 text-sm text-slate-700">{f.why}</p>
        <p className="mt-5 text-sm font-medium text-slate-800">Pro also gives you:</p>
        <ul className="mt-2 grid gap-1.5 text-sm text-slate-700 sm:grid-cols-2">{others.map((k) => <li key={k} className="flex gap-2"><span aria-hidden className="text-violet-700">✓</span>{PRO_FEATURES[k].label}</li>)}</ul>
        <Link href="/admin/billing#plans" className="mt-6 inline-flex rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">See Pro and upgrade</Link>
      </section>
    </div>
  )
}

/** A one-line note inside a settings card whose feature the plan does not include. */
export function ProNote({ feature }: { feature: ProFeature }) {
  return (
    <p className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
      <strong>Pro feature.</strong> {PRO_FEATURES[feature].why} <Link href="/admin/billing#plans" className="font-medium underline">Upgrade to use it</Link>.
    </p>
  )
}
