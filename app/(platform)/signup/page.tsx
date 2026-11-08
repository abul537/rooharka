import type { Metadata } from 'next'
import { getPlatformSettings } from '@/lib/signup/store'
import { getPublicPlans } from '@/lib/signup/public-plans'
import { platformHosts } from '@/lib/platform-host'
import SignupForm from './SignupForm'

export const metadata: Metadata = { title: 'Create your store' }
export const dynamic = 'force-dynamic'

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string; offer?: string }> }) {
  const [s, plans, sp] = await Promise.all([getPlatformSettings(), getPublicPlans(), searchParams])
  const wa = s.supportWhatsapp ? `https://wa.me/${s.supportWhatsapp.replace(/\D/g, '')}` : null
  const unavailable = !s.signupsOpen ? 'Sign-ups are closed at the moment.' : plans.length === 0 ? 'Plans are being prepared.' : null

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-14">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Create your store</h1>
      <p className="mt-3 text-stone-600">{s.trialDays > 0 ? `Free for ${s.trialDays} days. No card needed.` : 'It takes a few minutes.'}</p>
      {unavailable ? (
        <div className="mt-10 rounded-2xl border border-stone-200 bg-stone-50 p-8">
          <p className="font-semibold">{unavailable}</p>
          <p className="mt-2 text-stone-600">Please check back soon{s.supportEmail || wa ? ', or get in touch and we will let you know when it opens.' : '.'}</p>
          <p className="mt-4 text-sm">{s.supportEmail && <a className="underline mr-4" href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a>}{wa && <a className="underline" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp us</a>}</p>
        </div>
      ) : (
        <div className="mt-10"><SignupForm plans={plans} defaultPlanId={plans.find((p) => p.id === sp.plan)?.id ?? plans.find((p) => isPopular(p))?.id ?? plans[0].id} domainSuffix={platformHosts()[0] ?? null} trialDays={s.trialDays} defaultOffer={(sp.offer ?? '').slice(0, 24)} /></div>
      )}
      <p className="mt-10 text-sm text-stone-500">Already have a store? <a href="/admin/login" className="underline">Sign in</a></p>
    </div>
  )
}

const isPopular = (p: { limits: unknown }) => !!p.limits && typeof p.limits === 'object' && (p.limits as { popular?: unknown }).popular === true
