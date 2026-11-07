import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { getShopClosure } from '@/lib/store'

// Storefront shell (header + footer). The admin area has its own layout without these.
// The owner's reason is for the store owner only, never shown to customers.
// A shop the platform owner has not approved shows a plain notice instead of any page (getCurrentStore is null for it too).
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const closed = await getShopClosure()
  if (closed) {
    const waiting = closed.approval === 'PENDING'
    return (
      <main className="min-h-screen grid place-items-center px-6 py-16 text-center">
        <div className="max-w-md">
          <h1 className="text-2xl font-semibold">{closed.name}</h1>
          <p className="mt-3 text-stone-600">{waiting ? 'This shop is not open yet. Please check back soon.' : 'This shop is not available right now.'}</p>
        </div>
      </main>
    )
  }
  return (
    <>
      <Header />
      <main className="pt-20">{children}</main>
      <Footer />
    </>
  )
}
