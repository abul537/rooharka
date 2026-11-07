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
import { saveSignupSettingsAction } from '../actions'

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

      <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm">{pending.length > 0 ? <><strong>{pending.length}</strong> waiting for your decision. </> : 'Nobody is waiting. '}<Link href="/csmi/approvals" className="underline font-medium">Open Approvals</Link></p>

      <Card title="Settings">
        <ActionForm action={saveSignupSettingsAction} className="space-y-5">
          <fieldset disabled={!manage} className="space-y-4">
            <Check name="signupsOpen" label="Accept new sign-ups" hint="Your kill switch. Off: the public site says sign-ups are closed. Stores that already exist are not affected." defaultChecked={s.signupsOpen} />
            <Check name="requireApproval" label="I approve every new store myself" hint={mail ? 'People still confirm their email first; then they wait for you.' : 'Always on while email is not set up.'} defaultChecked={s.requireApproval || !mail} />
            <Check name="requireShopApproval" label="New shops stay closed to customers until I open them" hint="The owner can log in and set up, but customers see 'not open yet' until you approve it in Approvals." defaultChecked={s.requireShopApproval} />
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
