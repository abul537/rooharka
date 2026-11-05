import type { Metadata } from 'next'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'
import { getPlatformSettings } from '@/lib/signup/store'

export const metadata: Metadata = { title: 'Check your email', robots: { index: false } }

export default async function CheckEmail() {
  const s = await getPlatformSettings()
  return (
    <div className="mx-auto max-w-lg px-4 pt-20 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-800"><MailCheck className="h-7 w-7" aria-hidden /></span>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Check your email</h1>
      <p className="mt-4 text-stone-600">If the details were fine, we have sent a confirmation link to your email. Open it to finish creating your store. The link works once and lasts 24 hours.</p>
      <p className="mt-4 text-sm text-stone-500">Nothing arrived? Look in spam, or <Link href="/signup" className="underline">try again</Link>.{s.supportEmail && <> You can also write to {s.supportEmail}.</>}</p>
    </div>
  )
}
