import type { Metadata } from 'next'
import { Hourglass } from 'lucide-react'
import { getPlatformSettings } from '@/lib/signup/store'

export const metadata: Metadata = { title: 'We have your request', robots: { index: false } }

export default async function Pending() {
  const s = await getPlatformSettings()
  const wa = s.supportWhatsapp ? `https://wa.me/${s.supportWhatsapp.replace(/\D/g, '')}` : null
  return (
    <div className="mx-auto max-w-lg px-4 pt-20 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-800"><Hourglass className="h-7 w-7" aria-hidden /></span>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">We have your request</h1>
      <p className="mt-4 text-stone-600">We review every new store personally. We will contact you shortly, and you can sign in with the email and password you chose as soon as it is approved.</p>
      <p className="mt-4 text-sm text-stone-500">{s.supportEmail && <a className="underline mr-4" href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a>}{wa && <a className="underline" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp us</a>}</p>
    </div>
  )
}
