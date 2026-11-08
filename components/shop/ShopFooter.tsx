import Link from 'next/link'
import { Clock, Facebook, Instagram, Mail, MapPin, MessageCircle, Phone, Youtube } from 'lucide-react'
import { navItems } from '@/components/shop/ShopHeader'
import { POLICY_KEYS, POLICY_TITLES } from '@/lib/storefront/rules'
import { telHref, whatsappHref } from '@/lib/contact/rules'
import type { ShopContext } from '@/lib/storefront/data'

const SOCIAL = [['instagram', 'Instagram', Instagram], ['facebook', 'Facebook', Facebook], ['youtube', 'YouTube', Youtube]] as const

/** Footer drawn only from the store's own details: contact from Settings, wording from Storefront. */
export default function ShopFooter({ name, ctx }: { name: string; ctx: ShopContext }) {
  const c = ctx.content
  const policies = POLICY_KEYS.filter((k) => c.policies[k])
  const wa = whatsappHref(ctx.whatsapp), tel = telHref(ctx.phone)
  const tiktok = c.social.tiktok
  return (
    <footer className="mt-24 bg-gray-950 text-gray-300">
      <div className="container mx-auto grid gap-10 px-4 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="font-playfair text-2xl font-bold text-white">{name}</p>
          {c.tagline && <p className="mt-1 text-brand-200">{c.tagline}</p>}
          {c.footerBlurb && <p className="mt-4 max-w-md text-gray-400">{c.footerBlurb}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            {SOCIAL.map(([k, label, Icon]) => c.social[k] && (
              <a key={k} href={c.social[k]} target="_blank" rel="noopener noreferrer nofollow" aria-label={label} className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-800 transition hover:bg-brand-700"><Icon className="h-5 w-5" aria-hidden /></a>
            ))}
            {tiktok && <a href={tiktok} target="_blank" rel="noopener noreferrer nofollow" className="flex h-10 items-center rounded-full bg-gray-800 px-4 text-sm transition hover:bg-brand-700">TikTok</a>}
          </div>
        </div>
        <nav aria-label="Footer">
          <p className="mb-4 font-semibold text-white">Explore</p>
          <ul className="space-y-2.5">
            {navItems(ctx).map((i) => <li key={i.href}><Link href={i.href} className="transition hover:text-white">{i.label}</Link></li>)}
            {policies.map((k) => <li key={k}><Link href={`/policies/${k}`} className="transition hover:text-white">{POLICY_TITLES[k]}</Link></li>)}
          </ul>
        </nav>
        <div>
          <p className="mb-4 font-semibold text-white">Contact us</p>
          <ul className="space-y-3 text-sm">
            {ctx.phone && <li className="flex gap-3"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-brand-200" aria-hidden />{tel ? <a href={tel} className="hover:text-white">{ctx.phone}</a> : ctx.phone}</li>}
            {wa && <li className="flex gap-3"><MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-200" aria-hidden /><a href={wa} target="_blank" rel="noopener noreferrer" className="hover:text-white">Chat on WhatsApp</a></li>}
            {ctx.email && <li className="flex gap-3"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-200" aria-hidden /><a href={`mailto:${ctx.email}`} className="break-all hover:text-white">{ctx.email}</a></li>}
            {c.contact.address && <li className="flex gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-200" aria-hidden />{c.contact.address}</li>}
            {c.contact.hours && <li className="flex gap-3"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand-200" aria-hidden />{c.contact.hours}</li>}
            <li><Link href="/contact" className="font-medium text-brand-200 hover:text-white">Send us a message</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-gray-800 py-6 text-center text-sm text-gray-500">© {new Date().getFullYear()} {name}. All rights reserved.</div>
    </footer>
  )
}
