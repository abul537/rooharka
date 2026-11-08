'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { signupAction, type SignupState } from './actions'
import { formatPrice } from '@/lib/format'
import { slugFromName } from '@/lib/signup/rules'
import { describePlan } from '@/lib/signup/plans'
import type { PublicPlan } from '@/components/platform/PlanCards'

type Availability = { state: 'idle' | 'checking' | 'ok' | 'bad'; text?: string }
const input = 'w-full rounded-lg border border-stone-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600'

export default function SignupForm({ plans, defaultPlanId, domainSuffix, trialDays, defaultOffer }: { plans: PublicPlan[]; defaultPlanId: string; domainSuffix: string | null; trialDays: number; defaultOffer?: string }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(signupAction, {})
  const v = state.values ?? {}
  const [planId, setPlanId] = useState(v.planId || defaultPlanId)
  const [interval, setInterval_] = useState(v.interval === 'YEARLY' ? 'YEARLY' : 'MONTHLY')
  const [storeName, setStoreName] = useState(v.storeName ?? '')
  const [slug, setSlug] = useState(v.slug ?? '')
  const [slugEdited, setSlugEdited] = useState(!!v.slug)
  const [avail, setAvail] = useState<Availability>({ state: 'idle' })
  const [showPw, setShowPw] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const plan = plans.find((p) => p.id === planId)
  useEffect(() => { if (interval === 'YEARLY' && !plan?.yearly) setInterval_('MONTHLY') }, [plan, interval])

  // Live "is this address free?" check, a moment after typing stops. The server re-checks on submit; this is a convenience.
  useEffect(() => {
    clearTimeout(timer.current)
    if (slug.length < 3) { setAvail({ state: 'idle' }); return }
    setAvail({ state: 'checking' })
    const ctl = new AbortController()
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/signup/slug?slug=${encodeURIComponent(slug)}`, { signal: ctl.signal })
        const j = (await r.json()) as { available?: boolean; reason?: string }
        if (!r.ok) { setAvail({ state: 'idle', text: j.reason }); return } // a hiccup must never block the person
        setAvail(j.available ? { state: 'ok', text: 'This address is available' } : { state: 'bad', text: j.reason ?? 'This address is not available' })
      } catch (e) { if ((e as Error).name !== 'AbortError') setAvail({ state: 'idle' }) }
    }, 400)
    return () => { clearTimeout(timer.current); ctl.abort() }
  }, [slug])

  return (
    <form action={action} className="space-y-8" noValidate={false}>
      <fieldset className="space-y-3">
        <legend className="font-semibold mb-1">1. Choose your plan</legend>
        <input type="hidden" name="planId" value={planId} />
        <div className="grid gap-3 sm:grid-cols-2">
          {plans.map((p) => {
            const d = describePlan(p)
            const on = p.id === planId
            return (
              <button type="button" key={p.id} onClick={() => setPlanId(p.id)} aria-pressed={on}
                className={`text-left rounded-xl border p-4 transition ${on ? 'border-emerald-600 ring-2 ring-emerald-600 bg-emerald-50/50' : 'border-stone-300 hover:border-stone-400'}`}>
                <span className="flex items-baseline justify-between gap-2"><span className="font-semibold">{p.name}</span>{d.popular && <span className="text-xs rounded-full bg-emerald-700 text-white px-2 py-0.5">Popular</span>}</span>
                <span className="block mt-1 text-sm text-stone-600">{formatPrice(p.monthly)} / month</span>
                {d.tagline && <span className="block mt-1 text-xs text-stone-500">{d.tagline}</span>}
              </button>
            )
          })}
        </div>
        {plan?.yearly ? (
          <div role="radiogroup" aria-label="Billing" className="inline-flex rounded-lg border border-stone-300 p-1 text-sm">
            {(['MONTHLY', 'YEARLY'] as const).map((i) => (
              <button type="button" key={i} role="radio" aria-checked={interval === i} onClick={() => setInterval_(i)} className={`px-4 py-1.5 rounded-md ${interval === i ? 'bg-stone-900 text-white' : 'text-stone-600'}`}>{i === 'MONTHLY' ? 'Pay monthly' : `Pay yearly (${formatPrice(plan.yearly!)})`}</button>
            ))}
          </div>
        ) : null}
        <input type="hidden" name="interval" value={interval} />
        <p className="text-sm text-stone-500">{trialDays > 0 ? `You will not be charged for ${trialDays} days. After the trial we will send you an invoice; you can pay by bank transfer or mobile wallet.` : 'We will send you an invoice after you sign up.'}</p>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-semibold mb-1">2. Your store</legend>
        <label className="block"><span className="block text-sm font-medium mb-1">Store name</span>
          <input name="storeName" required maxLength={50} value={storeName} autoComplete="organization" className={input}
            onChange={(e) => { setStoreName(e.target.value); if (!slugEdited) setSlug(slugFromName(e.target.value)) }} /></label>
        <label className="block"><span className="block text-sm font-medium mb-1">Store address</span>
          <span className="flex items-center rounded-lg border border-stone-300 focus-within:ring-2 focus-within:ring-emerald-600 focus-within:border-emerald-600 overflow-hidden">
            <input name="slug" required minLength={3} maxLength={30} value={slug} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="slug-help"
              onChange={(e) => { setSlugEdited(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')) }} className="flex-1 min-w-0 px-4 py-3 text-base outline-none" />
            {domainSuffix && <span className="px-3 text-stone-500 bg-stone-50 border-l border-stone-200 py-3 text-sm">.{domainSuffix}</span>}
          </span>
          <span id="slug-help" aria-live="polite" className={`block text-xs mt-1 ${avail.state === 'ok' ? 'text-emerald-700' : avail.state === 'bad' ? 'text-red-700' : 'text-stone-500'}`}>
            {avail.state === 'checking' ? 'Checking…' : avail.text ?? 'Lowercase letters, digits and dashes. You can connect your own domain later.'}
          </span></label>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-semibold mb-1">3. About you</legend>
        <label className="block"><span className="block text-sm font-medium mb-1">Full name</span><input name="ownerName" required maxLength={60} defaultValue={v.ownerName} autoComplete="name" className={input} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="block text-sm font-medium mb-1">Email</span><input name="email" type="email" required maxLength={254} defaultValue={v.email} autoComplete="email" className={input} /></label>
          <label className="block"><span className="block text-sm font-medium mb-1">Mobile number</span><input name="phone" type="tel" inputMode="tel" required defaultValue={v.phone} placeholder="0300 1234567" autoComplete="tel" className={input} /></label>
        </div>
        <label className="block"><span className="block text-sm font-medium mb-1">Offer code <span className="font-normal text-stone-500">(optional)</span></span><input name="offerCode" maxLength={24} defaultValue={v.offerCode ?? defaultOffer} autoCapitalize="characters" autoComplete="off" className={`${input} uppercase`} /></label>
        <label className="block"><span className="block text-sm font-medium mb-1">Password</span>
          <span className="flex gap-2"><input name="password" type={showPw ? 'text' : 'password'} required minLength={12} maxLength={128} autoComplete="new-password" className={input} />
            <button type="button" onClick={() => setShowPw((s) => !s)} className="shrink-0 rounded-lg border border-stone-300 px-4 text-sm" aria-pressed={showPw}>{showPw ? 'Hide' : 'Show'}</button></span>
          <span className="block text-xs text-stone-500 mt-1">At least 12 characters. A few random words works well.</span></label>
      </fieldset>

      {/* Honeypot: invisible to people, tempting to bots. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>

      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="terms" required className="mt-1 h-4 w-4" />
        <span>I agree to the <a href="/terms" target="_blank" className="underline">Terms of Service</a> and <a href="/privacy" target="_blank" className="underline">Privacy Policy</a>.</span></label>

      {state.error && <p role="alert" className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">{state.error}</p>}
      <button disabled={pending || avail.state === 'bad'} className="w-full rounded-lg bg-emerald-700 text-white py-3.5 font-semibold hover:bg-emerald-800 disabled:opacity-60">
        {pending ? 'Creating your account…' : trialDays > 0 ? `Start ${trialDays}-day free trial` : 'Create my store'}
      </button>
    </form>
  )
}
