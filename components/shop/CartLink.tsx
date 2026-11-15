'use client'

import Link from 'next/link'
import { ShoppingBag } from 'lucide-react'
import { useT } from '@/components/shop/Lang'
import { useCartCount } from '@/lib/cart-client'

/** The cart button in the header, with the number of different items in it. */
export default function CartLink() {
  const n = useCartCount(), tr = useT()
  return (
    <Link href="/cart" className="relative rounded-full p-2 text-gray-700 transition hover:bg-gray-100 hover:text-brand-700" aria-label={n > 0 ? `${tr('Cart')}: ${n}` : tr('Cart, empty')}>
      <ShoppingBag className="h-5 w-5" aria-hidden />
      {n > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-700 px-1 text-xs font-bold text-white" aria-hidden>{n}</span>}
    </Link>
  )
}
