import Link from 'next/link'
import { db } from '@/lib/db'
import { requirePlatform } from '@/lib/csmi/guard'
import { canPlatform } from '@/lib/csmi/rules'
import { formatPkt, startOfPktDay } from '@/lib/admin/dates'
import { mailConfigured } from '@/lib/mail'
import { platformHosts } from '@/lib/platform-host'
import { getPlatformSettings } from '@/lib/signup/store'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { Pill, Stat } from '@/components/csmi/Pills'
import { approveSignupAction, rejectSignupAction, saveSignupSettingsAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function SignupAdminPage() {
  const user = await requirePlatform()
  const manage = canPlatform(user.role, 'csmi.manage')
  const now = new Date()
  const since = startOfPktDay(29, now)
  const [s, plans, pending, byStatus, recent] = await Promise.all([
    getPlatformSettings(),
    db.plan.findMany({ select: { id: true, name: true, isActive: true } }),
    db.signupRequest.findMany({ where: { status: 'PENDING_APPROVAL', expiresAt: { gt: now } }, orderBy: { createdAt: 'asc' }, take: 100 }),
    db.signupRequest.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.signupRequest.findMany({ where: { status: 'COMPLETED', createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ])
  const stores = await db.store.findMany({ where: { id: { in: recent.map((r) => r.storeId).filter((x): x is string => !!x) } }, select: { id: true, name: true, status: true } })
  const storeOf = new Map<string, { id: string; name: string; status: string }>(stores.map((x: { id: string; name: string; status: string }) => [x.id, x]))
  const planName = new Map(plans.map((p) => [p.id, p.name]))
  const count = (st: string) => byStatus.find((b) => b.status === st)?._count._all ?? 0
  const total = byStatus.reduce((n, b) => n + b._count._all, 0)
  const mail = mailConfigured()
  const hosts = platformHosts()
  const offeredPlans = plans.filter((p) => p.isActive).length

  const warnings = [
    !s.signupsOpen && 'Sign-ups are CLOSED. The public site shows a closed notice until you switch them on below.',
    offeredPlans === 0 && 'No plan is offered yet. Add one on the Plans page, otherwise nobody can sign up.',
    !mail && 'Email is not set up (RESEND_API_KEY and MAIL_FROM). People cannot confirm their email, so EVERY sign-up waits for your approval.',
    hosts.length === 0 && 'PLATFORM_HOST is not set. The public site is only reachable at /platform while developing, and stores get no free address.',
  ].filter(Boolean) as string[]

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">Sign-ups</h1>
      <p className="text-sm text-slate-600">How new store owners join from your public site. Nothing exists for a person (no store, no login) until their email is confirmed and, if you want, you approve them.</p>

      {warnings.length > 0 && (
        <ul className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm space-y-1">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="Sign-up attempts (30 days)" value={String(total)} />
        <Stat title="Stores created" value={String(count('COMPLETED'))} tone="good" />
        <Stat title="Waiting for you" value={String(pending.length)} tone={pending.length ? 'bad' : undefined} />
        <Stat title="Never confirmed or rejected" value={String(count('EXPIRED') + count('REJECTED'))} sub={`${count('PENDING_EMAIL')} still confirming`} />
      </div>

      <Card title={`Waiting for your approval (${pending.length})`} hint="Approving creates the store on its free trial and the person signs in with the email and password they chose. Check the details first: you can phone them.">
        {pending.length === 0 ? <p className="text-sm text-slate-500">Nobody is waiting.</p> : (
          <ul className="divide-y divide-slate-100">
            {pending.map((r) => (
              <li key={r.id} className="py-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                <div className="text-sm">
                  <p className="font-semibold">{r.storeName} <span className="font-normal text-slate-500">/{r.slug}</span></p>
                  <p>{r.ownerName} · {r.email} · {r.phone}</p>
                  <p className="text-slate-500">{planName.get(r.planId) ?? 'Plan removed'} ({r.interval.toLowerCase()}) · {formatPkt(r.createdAt)} · email {r.emailVerified ? 'confirmed' : 'NOT confirmed (email is off)'}{r.ip ? ` · ${r.ip}` : ''}</p>
                </div>
                {manage && (
                  <div className="space-y-2">
                    <ActionForm action={approveSignupAction} confirm={`Create the store “${r.storeName}” now?`}>
                      <input type="hidden" name="requestId" value={r.id} />
                      <button className="rounded-lg bg-emerald-700 text-white px-4 py-2 text-sm font-medium w-full">Approve</button>
                    </ActionForm>
                    <ActionForm action={rejectSignupAction} confirm={`Reject ${r.ownerName}?`} className="flex gap-2">
                      <input type="hidden" name="requestId" value={r.id} />
                      <input name="reason" maxLength={200} placeholder="Reason (they may see it)" aria-label="Reason" className="rounded border border-slate-300 px-2 py-1 text-xs w-44" />
                      <button className="rounded border border-red-300 text-red-700 px-3 py-1 text-xs">Reject</button>
                    </ActionForm>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Settings">
        <ActionForm action={saveSignupSettingsAction} className="space-y-5">
          <fieldset disabled={!manage} className="space-y-4">
            <Check name="signupsOpen" label="Accept new sign-ups" hint="Your kill switch. Off: the public site says sign-ups are closed. Stores that already exist are not affected." defaultChecked={s.signupsOpen} />
            <Check name="requireApproval" label="I approve every new store myself" hint={mail ? 'People still confirm their email first; then they wait for you.' : 'Always on while email is not set up.'} defaultChecked={s.requireApproval || !mail} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Free trial (days)" hint="0 = no trial: the first invoice is created straight away."><input name="trialDays" inputMode="numeric" defaultValue={s.trialDays} required className={inputCls} /></Field>
              <Field label="Most sign-ups per day" hint="A brake against floods (Pakistan time)."><input name="dailyCap" inputMode="numeric" defaultValue={s.dailyCap} required className={inputCls} /></Field>
              <Field label="Brand name"><input name="brandName" defaultValue={s.brandName} maxLength={40} required className={inputCls} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Support email"><input name="supportEmail" type="email" defaultValue={s.supportEmail} maxLength={120} className={inputCls} /></Field>
              <Field label="Support WhatsApp"><input name="supportWhatsapp" defaultValue={s.supportWhatsapp} placeholder="0300 1234567" className={inputCls} /></Field>
            </div>
            <Field label="Announcement bar (public site)" hint="One short line shown above every public page. Empty = none."><input name="announcement" defaultValue={s.announcement} maxLength={160} className={inputCls} /></Field>
            <Field label="How store owners pay you" hint="Shown on their Billing page next to each invoice: bank account, JazzCash or EasyPaisa number, name to pay."><textarea name="paymentInstructions" rows={4} maxLength={1000} defaultValue={s.paymentInstructions} className={inputCls} /></Field>
          </fieldset>
          {manage && <button className={primaryBtn}>Save settings</button>}
        </ActionForm>
      </Card>

      <Card title="Recently created from sign-ups">
        {recent.length === 0 ? <p className="text-sm text-slate-500">None in the last 30 days.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {recent.map((r) => { const st = r.storeId ? storeOf.get(r.storeId) : null; return (
              <li key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span>{st ? <Link href={`/csmi/stores/${st.id}`} className="font-medium hover:underline">{st.name}</Link> : r.storeName} <span className="text-slate-500">· {r.ownerName} · {planName.get(r.planId) ?? 'plan removed'} · {formatPkt(r.createdAt)}</span></span>
                {st && <Pill status={st.status} />}
              </li>
            ) })}
          </ul>
        )}
      </Card>
    </div>
  )
}
