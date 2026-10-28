'use client'

import { useActionState, useState } from 'react'

export interface SignInState { error?: string; needsCode?: boolean }
type Action = (prev: SignInState, fd: FormData) => Promise<SignInState>

const input = 'w-full rounded-lg border border-slate-300 px-4 py-3 focus:ring-2 focus:ring-amber-500 focus:border-amber-500'
const errorBox = 'rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm'

/**
 * Sign-in for both dashboards. Step 1 is email and password. If the account has two-factor protection the
 * form moves to step 2 (the 6-digit code from the phone app, or a recovery code) without a page reload.
 * If the code step expires, the person is sent back to step 1 with the reason shown.
 */
export default function SignInForm({ next, loginAction, codeAction, restartAction }: {
  next: string; loginAction: Action; codeAction: Action; restartAction: () => Promise<void>
}) {
  const [step, setStep] = useState<'password' | 'code'>('password')
  const [error, setError] = useState<string | undefined>()

  const [, doLogin, loginPending] = useActionState<SignInState, FormData>(async (prev, fd) => {
    const r = await loginAction(prev, fd)
    setError(r.error)
    if (r.needsCode) setStep('code')
    return r
  }, {})

  const [, doCode, codePending] = useActionState<SignInState, FormData>(async (prev, fd) => {
    const r = await codeAction(prev, fd)
    setError(r.error)
    if (r.needsCode === false) setStep('password') // the code step expired: start over
    return r
  }, {})

  if (step === 'code') {
    return (
      <form action={doCode} className="space-y-5" autoComplete="off">
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="code" className="block text-sm font-medium text-slate-700 mb-1">Security code</label>
          <input id="code" name="code" required autoFocus autoComplete="one-time-code" maxLength={20} placeholder="123456"
            className={`${input} tracking-widest text-lg`} />
          <p className="text-xs text-slate-500 mt-2">Open your authenticator app and type the 6-digit code. Lost your phone? Type one of your recovery codes instead.</p>
        </div>
        {error && <p role="alert" className={errorBox}>{error}</p>}
        <button type="submit" disabled={codePending} className="w-full rounded-lg bg-slate-900 text-white py-3 font-semibold hover:bg-slate-800 disabled:opacity-60">
          {codePending ? 'Checking…' : 'Verify and sign in'}
        </button>
        <button type="button" className="w-full text-sm text-slate-600 underline"
          onClick={async () => { await restartAction(); setError(undefined); setStep('password') }}>Start again</button>
      </form>
    )
  }

  return (
    <form action={doLogin} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input id="email" name="email" type="email" required autoComplete="username" autoFocus maxLength={254} className={input} />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" maxLength={200} className={input} />
      </div>
      {error && <p role="alert" className={errorBox}>{error}</p>}
      <button type="submit" disabled={loginPending} className="w-full rounded-lg bg-slate-900 text-white py-3 font-semibold hover:bg-slate-800 disabled:opacity-60">
        {loginPending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
