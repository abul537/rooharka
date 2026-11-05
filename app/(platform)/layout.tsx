import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { normalizeHost } from '@/lib/domains'
import { isPlatformHost, marketingAllowed } from '@/lib/platform-host'
import { getPlatformSettings } from '@/lib/signup/store'

export async function generateMetadata(): Promise<Metadata> {
  const s = await getPlatformSettings()
  return {
    title: { default: `${s.brandName}: online stores built for Pakistan`, template: `%s | ${s.brandName}` },
    description: 'Launch your online store in minutes: Pakistan address dropdowns, fake-order protection, courier booking and tracking, cash on delivery and wallet rules.',
  }
}

/**
 * The public site that sells store accounts. It exists ONLY on the platform's own address (PLATFORM_HOST), so a store's
 * customers never see sign-up pages on a store's web address. Anywhere else these pages simply do not exist (404).
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const host = normalizeHost((await headers()).get('host'))
  if (!marketingAllowed(host)) notFound()
  const home = isPlatformHost(host) ? '/' : '/platform' // on the real platform address the home page IS the root
  const s = await getPlatformSettings()
  const wa = s.supportWhatsapp ? `https://wa.me/${s.supportWhatsapp.replace(/\D/g, '')}` : null
  return (
    <div className="min-h-screen bg-white text-stone-900 antialiased">
      {s.announcement && <div className="bg-stone-900 text-stone-50 text-center text-sm px-4 py-2">{s.announcement}</div>}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-stone-200">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 sm:px-6 h-16">
          <Link href={home} className="font-bold text-xl tracking-tight">{s.brandName}</Link>
          <nav aria-label="Main" className="flex items-center gap-1 sm:gap-3 text-sm">
            <Link href={`${home}#features`} className="hidden sm:inline px-3 py-2 text-stone-600 hover:text-stone-900">Features</Link>
            <Link href="/pricing" className="px-3 py-2 text-stone-600 hover:text-stone-900">Pricing</Link>
            <Link href="/admin/login" className="px-3 py-2 text-stone-600 hover:text-stone-900">Sign in</Link>
            <Link href="/signup" className="rounded-lg bg-emerald-700 text-white px-4 py-2 font-medium hover:bg-emerald-800">Start free trial</Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-stone-200 bg-stone-50 mt-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-3 text-sm">
          <div><p className="font-bold text-lg">{s.brandName}</p><p className="text-stone-600 mt-2 max-w-xs">Online stores built for Pakistan: your customers, your couriers, your rules.</p></div>
          <div><p className="font-semibold mb-2">Product</p><ul className="space-y-1.5 text-stone-600"><li><Link href={`${home}#features`} className="hover:underline">Features</Link></li><li><Link href="/pricing" className="hover:underline">Pricing</Link></li><li><Link href="/signup" className="hover:underline">Start free trial</Link></li><li><Link href="/admin/login" className="hover:underline">Store owner sign in</Link></li></ul></div>
          <div><p className="font-semibold mb-2">Company</p><ul className="space-y-1.5 text-stone-600"><li><Link href="/terms" className="hover:underline">Terms of Service</Link></li><li><Link href="/privacy" className="hover:underline">Privacy Policy</Link></li>
            {s.supportEmail && <li><a href={`mailto:${s.supportEmail}`} className="hover:underline">{s.supportEmail}</a></li>}
            {wa && <li><a href={wa} className="hover:underline" rel="noopener noreferrer" target="_blank">WhatsApp us</a></li>}</ul></div>
        </div>
        <p className="text-center text-xs text-stone-500 pb-8">© {new Date().getFullYear()} {s.brandName}. All rights reserved.</p>
      </footer>
    </div>
  )
}
