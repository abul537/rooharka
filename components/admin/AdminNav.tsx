'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/pos', label: 'POS (counter sale)' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/order-tracking', label: 'Order tracking' },
  { href: '/admin/returns', label: 'Returns' },
  { href: '/admin/abandoned', label: 'Unfinished checkouts' },
  { href: '/admin/messages', label: 'Messages' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/collections', label: 'Collections' },
  { href: '/admin/discounts', label: 'Discount codes' },
  { href: '/admin/reviews', label: 'Reviews' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/storefront', label: 'Storefront' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/admin/team', label: 'Team' },
  { href: '/admin/billing', label: 'Plan and billing' },
  { href: '/admin/support', label: 'Help' },
  { href: '/admin/security', label: 'My security' },
]

export default function AdminNav({ allowed, unread = 0, pro = [] }: { allowed: string[]; unread?: number; pro?: readonly string[] }) {
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
            {pro.includes(item.href) && <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${active ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-800'}`}>Pro</span>}
            {item.href === '/admin/messages' && unread > 0 && <span className="ml-2 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">{unread}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
