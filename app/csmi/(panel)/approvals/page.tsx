import Link from 'next/link'
import { db } from '@/lib/db'
import { requirePlatform } from '@/lib/csmi/guard'
import { canPlatform } from '@/lib/csmi/rules'
import { formatPkt } from '@/lib/admin/dates'
import { serviceDef } from '@/lib/services/registry'
import { decisionMessage, whatsappLink, MAX_REASON, MIN_REASON } from '@/lib/approvals/rules'
import { loadPending } from '@/lib/approvals/service'
import { getPlatformSettings } from '@/lib/signup/store'
import ActionForm from '@/components/admin/ActionForm'
import { Card } from '@/components/admin/ui'
import { Stat } from '@/components/csmi/Pills'
import { approveSignupAction, decideServiceAction, decideShopAction, rejectSignupAction } from '../actions'

export const dynamic = 'force-dynamic'

const approveBtn = 'rounded-lg bg-emerald-700 text-white px-4 py-2 text-sm font-medium'
const denyBtn = 'rounded-lg border border-red-300 text-red-700 px-4 py-2 text-sm font-medium'
const reasonCls = 'rounded border border-slate-300 px-2 py-1.5 text-sm w-full sm:w-72'

/** Approve with one click; "Not now" needs a reason the store owner will read. */
function Decision({ action, hidden, approveLabel, noun }: { action: (p: never, f: FormData) => Promise<never>; hidden: Record<string, string>; approveLabel: string; noun: string }) {
  return (
    <ActionForm action={action as never} className="space-y-2">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input name="reason" maxLength={MAX_REASON} placeholder={`Reason (required to say no; ${noun} owner reads it)`} aria-label="Reason" className={reasonCls} />
      <div className="flex gap-2">
        <button name="decision" value="approve" className={approveBtn}>{approveLabel}</button>
        <button name="decision" value="deny" className={denyBtn} formNoValidate>Not now</button>
      </div>
    </ActionForm>
  )
}

export default async function ApprovalsPage() {
  const user = await requirePlatform()
  const manage = canPlatform(user.role, 'csmi.manage')
  const [pending, settings, plans] = await Promise.all([loadPending(), getPlatformSettings(), db.plan.findMany({ select: { id: true, name: true } })])
  const planName = new Map(plans.map((p: { id: string; name: string }) => [p.id, p.name]))

  const [shopsDone, servicesDone, signupsDone] = await Promise.all([
    db.store.findMany({ where: { shopDecidedAt: { not: null } }, orderBy: { shopDecidedAt: 'desc' }, take: 10, select: { name: true, ownerName: true, ownerPhone: true, shopApproval: true, shopDecisionNote: true, shopDecidedAt: true } }),
    db.storeService.findMany({ where: { decidedAt: { not: null } }, orderBy: { decidedAt: 'desc' }, take: 10, include: { store: { select: { name: true, ownerName: true, ownerPhone: true } } } }),
    db.signupRequest.findMany({ where: { status: 'REJECTED', decidedAt: { not: null } }, orderBy: { decidedAt: 'desc' }, take: 10 }),
  ])
  type Done = { at: Date; title: string; approved: boolean; reason: string; name: string; phone: string | null; subject: 'shop' | 'service' | 'signup'; what: string }
  const done: Done[] = [
    ...shopsDone.map((s: typeof shopsDone[number]): Done => ({ at: s.shopDecidedAt!, title: `${s.name}: shop go-live`, approved: s.shopApproval === 'APPROVED', reason: s.shopDecisionNote ?? '', name: s.ownerName, phone: s.ownerPhone, subject: 'shop', what: 'your shop going live' })),
    ...servicesDone.map((s: typeof servicesDone[number]): Done => ({ at: s.decidedAt!, title: `${s.store.name}: ${serviceDef(s.serviceKey)?.name ?? s.serviceKey}`, approved: s.approval === 'APPROVED', reason: s.decisionNote ?? '', name: s.store.ownerName, phone: s.store.ownerPhone, subject: 'service', what: `the ${serviceDef(s.serviceKey)?.name ?? s.serviceKey} service` })),
    ...signupsDone.map((r: typeof signupsDone[number]): Done => ({ at: r.decidedAt!, title: `${r.storeName}: sign-up`, approved: false, reason: r.decisionNote ?? '', name: r.ownerName, phone: r.phone, subject: 'signup', what: 'your sign-up' })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 15)

  const total = pending.signups.length + pending.shops.length + pending.services.length

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">Approvals</h1>
      <p className="text-sm text-slate-600">
        You are the only authority. Everything that needs your yes is here: new accounts, shops going live to customers, and stores asking to use a service.
        Saying no always needs a reason, and the store owner is told. To close a shop or block a service that is already live, open the store from <Link href="/csmi/stores" className="underline">Stores</Link>.
      </p>
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat title="Waiting for you" value={String(total)} tone={total ? 'bad' : 'good'} />
        <Stat title="New accounts" value={String(pending.signups.length)} />
        <Stat title="Shops to open" value={String(pending.shops.length)} />
        <Stat title="Service requests" value={String(pending.services.length)} />
      </div>

      <Card title={`New accounts (${pending.signups.length})`} hint="Approving creates the store on its free trial. Rules for what is automatic are on the Sign-ups page.">
        {pending.signups.length === 0 ? <p className="text-sm text-slate-500">Nobody is waiting.</p> : (
          <ul className="divide-y divide-slate-100">
            {pending.signups.map((r: typeof pending.signups[number]) => (
              <li key={r.id} className="py-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                <div className="text-sm">
                  <p className="font-semibold">{r.storeName} <span className="font-normal text-slate-500">/{r.slug}</span></p>
                  <p>{r.ownerName} · {r.email} · {r.phone}</p>
                  <p className="text-slate-500">{planName.get(r.planId) ?? 'Plan removed'} ({r.interval.toLowerCase()}) · {formatPkt(r.createdAt)} · email {r.emailVerified ? 'confirmed' : 'NOT confirmed (email is off)'}</p>
                </div>
                {manage && (
                  <div className="space-y-2">
                    <ActionForm action={approveSignupAction} confirm={`Create the store “${r.storeName}” now?`}>
                      <input type="hidden" name="requestId" value={r.id} />
                      <button className={`${approveBtn} w-full`}>Approve</button>
                    </ActionForm>
                    <ActionForm action={rejectSignupAction} confirm={`Reject ${r.ownerName}?`} className="flex gap-2">
                      <input type="hidden" name="requestId" value={r.id} />
                      <input name="reason" required minLength={MIN_REASON} maxLength={MAX_REASON} placeholder="Reason (required; they read it)" aria-label="Reason" className={reasonCls} />
                      <button className={denyBtn}>Reject</button>
                    </ActionForm>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Shops waiting to go live (${pending.shops.length})`} hint="Until you open a shop, customers see 'not open yet'. The owner can still sign in and set up products.">
        {pending.shops.length === 0 ? <p className="text-sm text-slate-500">No shop is waiting.</p> : (
          <ul className="divide-y divide-slate-100">
            {pending.shops.map((s: typeof pending.shops[number]) => (
              <li key={s.id} className="py-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                <div className="text-sm">
                  <p className="font-semibold"><Link href={`/csmi/stores/${s.id}`} className="underline">{s.name}</Link> <span className="font-normal text-slate-500">/{s.slug}</span></p>
                  <p className="text-slate-500">{s.ownerName}{s.ownerPhone ? ` · ${s.ownerPhone}` : ''} · created {formatPkt(s.createdAt)}</p>
                </div>
                {manage && <Decision action={decideShopAction as never} hidden={{ storeId: s.id }} approveLabel="Open the shop" noun="store" />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Service requests (${pending.services.length})`} hint="Only services marked 'needs approval' on the Services page appear here. Until approved, the service does not work for that store.">
        {pending.services.length === 0 ? <p className="text-sm text-slate-500">No requests.</p> : (
          <ul className="divide-y divide-slate-100">
            {pending.services.map((s: typeof pending.services[number]) => (
              <li key={s.id} className="py-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                <div className="text-sm">
                  <p className="font-semibold">{serviceDef(s.serviceKey)?.name ?? s.serviceKey}</p>
                  <p><Link href={`/csmi/stores/${s.store.id}`} className="underline">{s.store.name}</Link> · {s.store.ownerName} · asked {formatPkt(s.updatedAt)}</p>
                </div>
                {manage && <Decision action={decideServiceAction as never} hidden={{ storeId: s.store.id, serviceKey: s.serviceKey }} approveLabel="Approve" noun="store" />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recently decided" hint="Your last decisions. If email is not set up, use the WhatsApp button to send the store owner the message with your reason.">
        {done.length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {done.map((d, i) => {
              const wa = whatsappLink(d.phone, decisionMessage({ brand: settings.brandName, name: d.name, subject: d.subject, what: d.what, approved: d.approved, reason: d.reason }))
              return (
                <li key={i} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p><span className={d.approved ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'}>{d.approved ? 'Approved' : 'Not approved'}</span> · {d.title}</p>
                    <p className="text-slate-500">{formatPkt(d.at)}{d.reason ? ` · “${d.reason}”` : ''}</p>
                  </div>
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded border border-slate-300 px-3 py-1 text-xs">Message on WhatsApp</a>}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
