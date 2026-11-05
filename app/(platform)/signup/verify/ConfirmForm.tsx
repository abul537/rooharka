'use client'

import { useActionState } from 'react'
import { confirmEmailAction, type SignupState } from '../actions'

export default function ConfirmForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(confirmEmailAction, {})
  return (
    <form action={action} className="mt-8">
      <input type="hidden" name="token" value={token} />
      {state.error && <p role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">{state.error}</p>}
      <button disabled={pending} className="rounded-lg bg-emerald-700 text-white px-8 py-3.5 font-semibold hover:bg-emerald-800 disabled:opacity-60">{pending ? 'Creating your store…' : 'Confirm and create my store'}</button>
    </form>
  )
}
