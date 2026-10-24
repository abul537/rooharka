'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/csmi', label: 'Overview', exact: true },
  { href: '/csmi/stores', label: 'Stores' },
  { href: '/csmi/billing', label: 'Billing' },
  { href: '/csmi/plans', label: 'Plans' },
  { href: '/csmi/costs', label: 'Costs and profit' },
  { href: '/csmi/services', label: 'Services' },
  { href: '/csmi/reports', label: 'Reports' },
]

export default function CsmiNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="CSMI" className="flex lg:flex-col gap-1 overflow-x-auto">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        return (
          <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'}`}>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
