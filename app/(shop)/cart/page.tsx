import type { Metadata } from 'next'
import CartView from './CartView'

export const metadata: Metadata = { title: 'Your cart', robots: { index: false } }

/** The cart lives in the customer's browser, so this page is a frame; CartView fills it with fresh prices from the shop. */
export default function CartPage() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-8 font-playfair text-4xl font-bold text-gray-900">Your cart</h1>
      <CartView />
    </div>
  )
}
