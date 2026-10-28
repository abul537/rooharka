'use client'

import { useActionState, useState } from 'react'
import {
  changePasswordAction, confirmTwoFactorAction, disableTwoFactorAction, regenerateCodesAction, startTwoFactorAction, type SecurityState,
} from '@/lib/auth/security-actions'

const card = 'rounded-xl bg-white border border-slate-200 p-5 sm:p-6'
const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white'
const btn = 'rounded-lg bg-slate-900 text-white px-5 py-2 text-sm font-medium disabled:opacity-50'
const ghost = 'rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50'

function Messages({ s }: { s: SecurityState | null }) {
  return <>
    {s?.error && <p role="alert" className="mt-3 text-sm text-red-700">{s.error}</p>}
    {s?.ok && <p role="status" className="mt-3 text-sm text-emerald-700">{s.ok}</p>}
  </>
}

/** Shown once. The person must save these: they are the way back in if the phone is lost. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p className="font-medium text-sm">Save these recovery codes now</p>
      <p className="text-sm text-slate-700 mt-1">Each code works once and lets you sign in if you lose your phone. They will <strong>not be shown again</strong>. Keep them somewhere safe, such as a password manager or a printed page.</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">{codes.map((c) => <li key={c} className="rounded bg-white border border-amber-200 px-3 py-1.5">{c}</li>)}</ul>
      <button type="button" className={`${ghost} mt-3`}
        onClick={async () => { try { await navigator.clipboard.writeText(codes.join('\n')); setCopied(true) } catch { /* clipboard blocked: codes are still on screen */ } }}>
        {copied ? 'Copied' : 'Copy all'}
      </button>
      <button type="button" className={`${btn} mt-3 ml-2`} onClick={onDone}>I have saved them</button>
    </div>
  )
}

function PasswordCard() {
  const [s, action, pending] = useActionState<SecurityState | null, FormData>(changePasswordAction, null)
  return (
    <section className={card}>
      <h2 className="font-semibold text-lg">Change password</h2>
      <p className="text-sm text-slate-600 mt-1 mb-4">Use at least 12 characters. A few random words is stronger than symbols. Changing it signs you out everywhere else.</p>
      <form action={action} className="space-y-3 max-w-md">
        <label className="block"><span className="block text-sm font-medium mb-1">Current password</span><input name="current" type="password" required autoComplete="current-password" maxLength={200} className={inputCls} /></label>
        <label className="block"><span className="block text-sm font-medium mb-1">New password</span><input name="next" type="password" required autoComplete="new-password" minLength={12} maxLength={128} className={inputCls} /></label>
        <label className="block"><span className="block text-sm font-medium mb-1">New password again</span><input name="confirm" type="password" required autoComplete="new-password" minLength={12} maxLength={128} className={inputCls} /></label>
        <button className={btn} disabled={pending}>{pending ? 'Saving…' : 'Change password'}</button>
        <Messages s={s} />
      </form>
    </section>
  )
}

function ProtectedControls({ recoveryLeft, onCodes }: { recoveryLeft: number; onCodes: (c: string[]) => void }) {
  const [renew, renewAction, renewing] = useActionState<SecurityState | null, FormData>(async (prev, fd) => {
    const r = await regenerateCodesAction(prev, fd)
    if (r.recoveryCodes) onCodes(r.recoveryCodes)
    return { ok: r.ok, error: r.error }
  }, null)
  const [off, offAction, turningOff] = useActionState<SecurityState | null, FormData>(disableTwoFactorAction, null)
  return (
    <div className="space-y-6">
      <p className="text-sm"><span className="inline-block rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-xs font-medium mr-2">On</span>
        Signing in needs your password and a code from your phone. You have <strong>{recoveryLeft}</strong> unused recovery code{recoveryLeft === 1 ? '' : 's'}.
        {recoveryLeft <= 2 && <span className="text-amber-700"> Running low: create new ones below.</span>}</p>

      <form action={renewAction} className="space-y-3 max-w-md">
        <h3 className="font-medium text-sm">Create new recovery codes</h3>
        <input name="password" type="password" required placeholder="Your password" autoComplete="current-password" className={inputCls} />
        <input name="code" required placeholder="Code from your app" autoComplete="one-time-code" maxLength={20} className={inputCls} />
        <button className={ghost} disabled={renewing}>{renewing ? 'Working…' : 'Create new codes'}</button>
        <Messages s={renew} />
      </form>

      <form action={offAction} onSubmit={(e) => { if (!window.confirm('Turn off two-factor protection? Your account will be protected by the password only.')) e.preventDefault() }} className="space-y-3 max-w-md border-t border-slate-200 pt-6">
        <h3 className="font-medium text-sm">Turn off protection</h3>
        <input name="password" type="password" required placeholder="Your password" autoComplete="current-password" className={inputCls} />
        <input name="code" required placeholder="Code from your app" autoComplete="one-time-code" maxLength={20} className={inputCls} />
        <button className="rounded-lg border border-red-300 text-red-700 px-5 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50" disabled={turningOff}>{turningOff ? 'Working…' : 'Turn off'}</button>
        <Messages s={off} />
      </form>
    </div>
  )
}

function SetupFlow({ onCodes }: { onCodes: (c: string[]) => void }) {
  const [start, startAction, starting] = useActionState<SecurityState | null, FormData>(async () => startTwoFactorAction(), null)
  const [done, confirmAction, confirming] = useActionState<SecurityState | null, FormData>(async (prev, fd) => {
    const r = await confirmTwoFactorAction(prev, fd)
    if (r.recoveryCodes) onCodes(r.recoveryCodes)
    return { ok: r.ok, error: r.error }
  }, null)

  if (!start?.setup) {
    return (
      <form action={startAction}>
        <p className="text-sm text-slate-600 mb-4">Adds a second step to signing in: a 6-digit code from an app on your phone (Google Authenticator, Microsoft Authenticator, Authy, 1Password…). Even if someone learns your password, they cannot get in without your phone.</p>
        <button className={btn} disabled={starting}>{starting ? 'Preparing…' : 'Set up two-factor protection'}</button>
        <Messages s={start} />
      </form>
    )
  }
  return (
    <div className="space-y-4 max-w-md">
      <ol className="list-decimal pl-5 space-y-3 text-sm">
        <li>Open your authenticator app and choose <strong>Add account</strong> then <strong>Enter a setup key</strong> (or “manual entry”).</li>
        <li>Type the account name you like, choose <strong>Time based</strong> and enter this key:
          <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 font-mono text-base tracking-wider select-all break-all" data-testid="setup-key">{start.setup.key}</p>
          <p className="mt-1 text-xs text-slate-500">On a phone you can also <a className="underline" href={start.setup.uri}>tap here to open it in your app</a>.</p></li>
        <li>Type the 6-digit code the app now shows:</li>
      </ol>
      <form action={confirmAction} className="space-y-3">
        <input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={10} placeholder="123456" className={`${inputCls} max-w-[10rem] tracking-widest`} />
        <div><button className={btn} disabled={confirming}>{confirming ? 'Checking…' : 'Turn on protection'}</button></div>
        <Messages s={done} />
      </form>
    </div>
  )
}

export default function SecurityPanel({ twoFactorEnabled, recoveryLeft }: { twoFactorEnabled: boolean; recoveryLeft: number }) {
  // Held here (not in the forms) so the codes stay on screen while the page refreshes to its "protected" state.
  const [codes, setCodes] = useState<string[] | null>(null)
  return (
    <div className="space-y-6 max-w-3xl">
      {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}
      <section className={card}>
        <h2 className="font-semibold text-lg mb-3">Two-factor protection</h2>
        {twoFactorEnabled ? <ProtectedControls recoveryLeft={recoveryLeft} onCodes={setCodes} /> : <SetupFlow onCodes={setCodes} />}
      </section>
      <PasswordCard />
    </div>
  )
}
