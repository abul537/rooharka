'use client'

import { useId, useState } from 'react'

/** The "leave your email" box of the Newsletter section. Sends the address to the shop's own server; nothing else. */
export default function NewsletterForm({ dark = true }: { dark?: boolean }) {
  const id = useId()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'bad'>('idle')
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get('email') ?? '')
    setState('busy')
    try {
      const r = await fetch('/api/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      setState(r.ok ? 'done' : 'bad')
    } catch { setState('bad') }
  }
  if (state === 'done') return <p role="status" className={`mt-8 font-semibold ${dark ? 'text-white' : 'text-brand-800'}`}>Thank you. You are on the list.</p>
  return (
    <form onSubmit={submit} className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
      <label className="sr-only" htmlFor={id}>Your email address</label>
      <input id={id} name="email" type="email" required maxLength={254} autoComplete="email" placeholder="Your email address" className="min-w-0 flex-1 rounded-[var(--r-btn)] border border-gray-300 bg-white px-4 py-3 text-gray-900" />
      <button disabled={state === 'busy'} className={`rounded-[var(--r-btn)] px-6 py-3 font-semibold disabled:opacity-60 ${dark ? 'bg-white text-brand-800 hover:bg-brand-50' : 'bg-brand-700 text-white hover:bg-brand-800'}`}>{state === 'busy' ? 'Sending…' : 'Sign up'}</button>
      {state === 'bad' && <p role="alert" className={`text-sm sm:basis-full ${dark ? 'text-white' : 'text-red-700'}`}>That did not work. Please check the address and try again.</p>}
    </form>
  )
}
