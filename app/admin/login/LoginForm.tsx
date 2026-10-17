'use client'

import { useActionState } from 'react'
import { loginAction, type LoginState } from './actions'

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {})
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input id="email" name="email" type="email" required autoComplete="username" autoFocus maxLength={254}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" maxLength={200}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
      </div>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{state.error}</p>}
      <button type="submit" disabled={pending}
        className="w-full rounded-lg bg-slate-900 text-white py-3 font-semibold hover:bg-slate-800 disabled:opacity-60">
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
