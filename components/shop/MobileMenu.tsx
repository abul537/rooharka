'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'

/** The phone menu: the only client-side part of the header. */
export default function MobileMenu({ items }: { items: { label: string; href: string }[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="md:hidden">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'} className="rounded-lg p-2 hover:bg-brand-50">
        {open ? <X className="h-6 w-6" aria-hidden /> : <Menu className="h-6 w-6" aria-hidden />}
      </button>
      {open && (
        <nav id="mobile-menu" aria-label="Menu" className="absolute inset-x-0 top-full border-b border-gray-200 bg-white px-4 pb-4 pt-2 shadow-lg">
          <form action="/shop" method="get" role="search" className="mb-2"><input name="q" placeholder="Search products" aria-label="Search products" maxLength={60} className="w-full rounded-lg border border-gray-300 px-3 py-2.5" /></form>
          {items.map((i) => <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 font-medium text-gray-800 hover:bg-brand-50">{i.label}</Link>)}
        </nav>
      )}
    </div>
  )
}
