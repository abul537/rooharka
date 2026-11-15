'use client'

import { useState } from 'react'
import { Star } from 'lucide-react'
import { REVIEW_MAX } from '@/lib/reviews'

const input = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900'

/** "Write a review" under a product's reviews. The review waits for the shop's approval before anyone sees it. */
export default function ReviewForm({ productSlug }: { productSlug: string }) {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: string }>({})

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setState({ busy: true })
    try {
      const r = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productSlug, rating, authorName: f.get('authorName'), city: f.get('city'), body: f.get('body'), trackingCode: f.get('trackingCode'), website: f.get('website') }) })
      const d = await r.json().catch(() => ({}))
      setState(r.ok ? { done: d.ok } : { error: d.error ?? 'Could not send your review. Please try again.' })
    } catch { setState({ error: 'We could not reach the shop. Check your connection and try again.' }) }
  }

  if (state.done) return <p role="status" className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-medium text-emerald-900">{state.done}</p>
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-8 rounded-[var(--r-btn,0.75rem)] border-2 border-brand-700 px-6 py-2.5 font-semibold text-brand-800 hover:bg-brand-50">Write a review</button>
  return (
    <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border border-gray-200 bg-white p-5 text-left">
      <h3 className="text-lg font-semibold text-gray-900">Write a review</h3>
      <fieldset>
        <legend className="text-sm font-medium text-gray-700">Your rating</legend>
        <div className="mt-1 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star${n === 1 ? '' : 's'}`} aria-pressed={rating === n} className="rounded p-1">
              <Star className={`h-7 w-7 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} aria-hidden />
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-gray-700">Your name<input name="authorName" required minLength={2} maxLength={60} autoComplete="name" className={input} /></label>
        <label className="block text-sm font-medium text-gray-700">City (optional)<input name="city" maxLength={40} autoComplete="address-level2" className={input} /></label>
      </div>
      <label className="block text-sm font-medium text-gray-700">Your review<textarea name="body" required minLength={10} maxLength={REVIEW_MAX} rows={4} className={input} /></label>
      <label className="block text-sm font-medium text-gray-700">Order tracking code (optional)
        <input name="trackingCode" maxLength={30} autoComplete="off" className={`${input} font-mono uppercase`} />
        <span className="mt-1 block text-xs font-normal text-gray-500">From your order confirmation. With it, your review is marked “Verified buyer”.</span>
      </label>
      {/* Not for people: hidden from sight and from screen readers. Only a robot fills it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <button disabled={state.busy || rating === 0} className="rounded-[var(--r-btn,0.75rem)] bg-brand-700 px-6 py-2.5 font-semibold text-white hover:bg-brand-800 disabled:opacity-50">{state.busy ? 'Sending…' : rating === 0 ? 'Choose a rating first' : 'Send review'}</button>
      <p className="text-xs text-gray-500">Your review appears after the shop has read it.</p>
    </form>
  )
}
