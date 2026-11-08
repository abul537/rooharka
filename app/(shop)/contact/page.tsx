import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { getCurrentStore } from '@/lib/store'
import { getShopContext } from '@/lib/storefront/data'
import { telHref, whatsappHref } from '@/lib/contact/rules'
import ContactForm from './ContactForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Contact us' }

/** Contact page: details come from Settings (phone, WhatsApp, email) and Storefront (address, hours, intro). */
export default async function ContactPage() {
  const store = await getCurrentStore()
  if (!store) return null
  const ctx = await getShopContext(store)
  const { contact, faq } = ctx.content
  const wa = whatsappHref(ctx.whatsapp, `Hello ${store.name}, `), tel = telHref(ctx.phone)
  const card = 'flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-brand-200 hover:shadow-sm'
  const ico = 'mt-0.5 h-5 w-5 shrink-0 text-brand-700'
  return (
    <div className="pb-8">
      <section className="bg-gradient-to-b from-brand-50 to-white py-14 text-center md:py-16">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">Contact us</h1>
          <p className="mx-auto mt-4 max-w-xl text-gray-600">{contact.intro}</p>
        </div>
      </section>
      <div className="container mx-auto grid gap-10 px-4 pt-6 lg:grid-cols-[1fr_22rem] lg:gap-14">
        <div>
          <h2 className="mb-5 text-2xl font-bold text-gray-900">Send a message</h2>
          <ContactForm />
        </div>
        <aside aria-label="Contact details" className="space-y-3">
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={card}><MessageCircle className={ico} aria-hidden /><span><span className="block font-semibold text-gray-900">WhatsApp</span><span className="text-sm text-gray-600">Chat with us now</span></span></a>}
          {ctx.phone && <a href={tel ?? undefined} className={card}><Phone className={ico} aria-hidden /><span><span className="block font-semibold text-gray-900">Call</span><span className="text-sm text-gray-600">{ctx.phone}</span></span></a>}
          {ctx.email && <a href={`mailto:${ctx.email}`} className={card}><Mail className={ico} aria-hidden /><span className="min-w-0"><span className="block font-semibold text-gray-900">Email</span><span className="break-all text-sm text-gray-600">{ctx.email}</span></span></a>}
          {contact.address && <div className={card}><MapPin className={ico} aria-hidden /><span><span className="block font-semibold text-gray-900">Address</span><span className="text-sm text-gray-600">{contact.address}</span></span></div>}
          {contact.hours && <div className={card}><Clock className={ico} aria-hidden /><span><span className="block font-semibold text-gray-900">Opening hours</span><span className="text-sm text-gray-600">{contact.hours}</span></span></div>}
          {ctx.trackingEnabled && <p className="px-1 pt-2 text-sm text-gray-600">Asking about an order? <Link href="/track" className="font-semibold text-brand-700 underline">Track it here</Link> with your tracking code.</p>}
        </aside>
      </div>
      {faq.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 pt-20" aria-labelledby="cfaq">
          <h2 id="cfaq" className="text-center text-2xl font-bold text-gray-900">Common questions</h2>
          <div className="mt-6 divide-y divide-gray-200 border-y border-gray-200">
            {faq.map((f) => <details key={f.q} className="group py-4"><summary className="flex cursor-pointer list-none justify-between gap-4 font-semibold text-gray-900">{f.q}<span className="text-xl leading-none text-gray-400 transition-transform group-open:rotate-45" aria-hidden>+</span></summary><p className="mt-2 leading-relaxed text-gray-600">{f.a}</p></details>)}
          </div>
        </section>
      )}
    </div>
  )
}
