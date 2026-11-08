import Link from 'next/link'
import { Search } from 'lucide-react'
import MobileMenu from '@/components/shop/MobileMenu'
import type { ShopContext } from '@/lib/storefront/data'

export const navItems = (ctx: ShopContext) => [
  { label: 'Home', href: '/' }, { label: 'Shop', href: '/shop' }, { label: 'About', href: '/about' }, { label: 'Contact', href: '/contact' },
  ...(ctx.trackingEnabled ? [{ label: 'Track order', href: '/track' }] : []),
]

/** Sticky header: the store's own logo and name (from Settings and Storefront), links, search. No fake cart. */
export default function ShopHeader({ name, ctx }: { name: string; ctx: ShopContext }) {
  const items = navItems(ctx)
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="container relative mx-auto flex h-16 items-center justify-between gap-4 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={`${name} home`}>
          {ctx.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={ctx.logoUrl} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            : <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-700 text-lg font-bold text-white">{name.trim().charAt(0).toUpperCase() || 'S'}</span>}
          <span className="min-w-0">
            <span className="block truncate font-playfair text-xl font-bold leading-tight text-gray-900">{name}</span>
            {ctx.content.tagline && <span className="hidden truncate text-xs text-gray-500 sm:block">{ctx.content.tagline}</span>}
          </span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          {items.map((i) => <Link key={i.href} href={i.href} className="font-medium text-gray-700 transition hover:text-brand-700">{i.label}</Link>)}
        </nav>
        <div className="flex items-center gap-1">
          <form action="/shop" method="get" role="search" className="relative hidden lg:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input name="q" placeholder="Search products" aria-label="Search products" maxLength={60} className="w-52 rounded-full border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600" />
          </form>
          <MobileMenu items={items} />
        </div>
      </div>
    </header>
  )
}
