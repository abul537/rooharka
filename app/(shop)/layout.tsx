import Header from '@/components/Header'
import Footer from '@/components/Footer'

// Storefront shell (header + footer). The admin area has its own layout without these.
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="pt-20">{children}</main>
      <Footer />
    </>
  )
}
