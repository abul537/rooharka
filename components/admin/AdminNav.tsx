'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/categories', label: 'Categories' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/admin/security', label: 'My security' },
]

export default function AdminNav({ allowed }: { allowed: string[] }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Dashboard" className="flex lg:flex-col gap-1 overflow-x-auto">
      {ITEMS.filter((i) => allowed.includes(i.href)).map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        return (
          <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200'
            }`}>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
