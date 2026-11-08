'use client'

import { useActionState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { contactAction, type ContactState } from './actions'

const field = 'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600'

export default function ContactForm() {
  const [state, action, pending] = useActionState<ContactState, FormData>(contactAction, {})
  if (state.ok) {
    return (
      <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
        <h2 className="mt-3 text-xl font-bold text-gray-900">Message sent</h2>
        <p className="mt-1 text-gray-600">Thank you. The store will get back to you on the number you gave.</p>
      </div>
    )
  }
  const v = state.values ?? {}
  return (
    <form action={action} className="space-y-4" noValidate>
      {/* Hidden from people; bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px]"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-sm font-medium">Your name</span><input name="name" defaultValue={v.name} required maxLength={60} autoComplete="name" className={field} /></label>
        <label className="block"><span className="mb-1 block text-sm font-medium">Mobile number</span><input name="phone" defaultValue={v.phone} required inputMode="tel" autoComplete="tel" placeholder="03001234567" className={field} /></label>
      </div>
      <label className="block"><span className="mb-1 block text-sm font-medium">Email <span className="font-normal text-gray-500">(optional)</span></span><input name="email" type="email" defaultValue={v.email} maxLength={120} autoComplete="email" className={field} /></label>
      <label className="block"><span className="mb-1 block text-sm font-medium">Your message</span><textarea name="message" defaultValue={v.message} required rows={5} maxLength={1000} className={field} /></label>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-xl bg-brand-700 px-6 py-3.5 font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60 sm:w-auto">{pending ? 'Sending…' : 'Send message'}</button>
    </form>
  )
}
