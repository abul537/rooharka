import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { requirePlatform } from '@/lib/csmi/guard'
import { canPlatform, effectiveInvoiceStatus } from '@/lib/csmi/rules'
import { loadPlatform } from '@/lib/csmi/data'
import { formatPrice } from '@/lib/format'
import { formatPkt } from '@/lib/admin/dates'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { Flags, Pill, Stat, pct } from '@/components/csmi/Pills'
import { addDomainAction, checkDomainAction, removeDomainAction, saveSubscriptionAction, setDomainLiveAction, setStatusAction } from '../../actions'

export const dynamic = 'force-dynamic'

export default async function StoreDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatform()
  const { id } = await params
  const manage = canPlatform(user.role, 'csmi.manage')
  const [p, plans, invoices, services, sub, costs, domains] = await Promise.all([
    loadPlatform(30),
    db.plan.findMany({ orderBy: { monthlyPrice: 'asc' }, select: { id: true, name: true, isActive: true } }),
    db.invoice.findMany({ where: { storeId: id }, orderBy: { createdAt: 'desc' }, take: 12 }),
    db.storeService.findMany({ where: { storeId: id }, include: { service: { select: { name: true, type: true } } }, orderBy: { serviceKey: 'asc' } }),
    db.subscription.findUnique({ where: { storeId: id } }),
    db.platformCost.findMany({ where: { storeId: id }, orderBy: { createdAt: 'desc' } }),
    db.storeDomain.findMany({ where: { storeId: id }, orderBy: { createdAt: 'asc' } }),
  ])
  const r = p.rows.find((x) => x.id === id)
  if (!r) notFound()
  const now = new Date()

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/csmi/stores" className="text-sm text-slate-600 underline">← All stores</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{r.name}</h1><Pill status={r.status} />
        <span className="text-sm text-slate-500">{r.slug} · since {formatPkt(r.createdAt).split(',').slice(0, 2).join(',')}</span>
      </div>
      <p className="text-sm text-slate-600">{r.ownerName} · {r.ownerEmail}{r.ownerPhone ? ` · ${r.ownerPhone}` : ''}</p>
      {r.flags.length > 0 && <div className="rounded-xl bg-amber-50 border border-amber-200 p-4"><Flags flags={r.flags} /></div>}

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat title="Monthly revenue" value={r.bucket === 'MRR' ? formatPrice(r.monthly) : formatPrice(0)} sub={r.bucket === 'MRR' ? `${r.planName}${r.addOnMonthly ? `, incl. ${formatPrice(r.addOnMonthly)} add-ons` : ''}` : r.bucket === 'NONE' ? 'not counted' : `${r.bucket.replace('_', ' ').toLowerCase()}: ${formatPrice(r.monthly)} not counted`} />
        <Stat title="Monthly cost to serve" value={formatPrice(r.cost)} sub="own costs plus a share of shared costs" />
        <Stat title="Profit from this store" value={formatPrice(r.profit.profit)} tone={r.profit.profit < 0 ? 'bad' : 'good'} sub={r.profit.marginPct === null ? undefined : `${r.profit.marginPct}% margin`} />
        <Stat title="Orders (30 days)" value={String(r.orders)} sub={`${formatPrice(r.gmv)} sales · ${pct(r.deliveredRate)} delivered`} />
      </section>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Plan and price" hint="Becoming Active, or switching monthly/yearly, starts a new billing period today.">
          {manage ? (
            <ActionForm action={saveSubscriptionAction} className="space-y-3">
              <input type="hidden" name="storeId" value={r.id} />
              <Field label="Plan">
                <select name="planId" defaultValue={sub?.planId ?? ''} required className={inputCls}>
                  <option value="" disabled>Choose a plan</option>
                  {plans.filter((x) => x.isActive || x.id === sub?.planId).map((x) => <option key={x.id} value={x.id}>{x.name}{x.isActive ? '' : ' (switched off)'}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Status">
                  <select name="status" defaultValue={sub?.status ?? 'TRIALING'} className={inputCls}>
                    {['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}
                  </select>
                </Field>
                <Field label="Billed">
                  <select name="interval" defaultValue={r.interval} className={inputCls}><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select>
                </Field>
              </div>
              <Field label="Agreed price per period (optional)" hint="Leave empty to use the plan price. 0 means free."><input name="priceOverride" inputMode="decimal" defaultValue={sub?.priceOverride ? sub.priceOverride.toNumber() : ''} className={inputCls} /></Field>
              <Field label="Trial days (if trialing)"><input name="trialDays" inputMode="numeric" defaultValue="14" className={inputCls} /></Field>
              <button className={primaryBtn}>Save plan and price</button>
            </ActionForm>
          ) : <p className="text-sm">{r.planName ?? 'No plan'} · {r.subStatus ?? ''}</p>}
        </Card>

        <Card title="Store status" hint="Suspending closes the shop to customers within 30 seconds. The owner can still sign in to the dashboard. Nothing is ever suspended automatically.">
          {manage ? (
            <ActionForm action={setStatusAction} confirm="Change this store's status?" className="space-y-3">
              <input type="hidden" name="storeId" value={r.id} />
              <Field label="Status">
                <select name="status" defaultValue={r.status} className={inputCls}>
                  {['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}
                </select>
              </Field>
              <Field label="Reason (required to suspend)"><input name="reason" maxLength={200} className={inputCls} /></Field>
              <button className={primaryBtn}>Change status</button>
            </ActionForm>
          ) : <Pill status={r.status} />}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="rounded-xl bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3">Services this store uses</h2>
          {services.length === 0 ? <p className="text-sm text-slate-500">None connected yet.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {services.map((s) => (
                <li key={s.id} className="py-2">
                  <div className="flex items-center justify-between gap-2"><span>{s.service.name}</span><span className={s.enabled ? 'text-emerald-700' : 'text-slate-500'}>{s.enabled ? 'on' : 'off'}</span></div>
                  {s.lastError && <p className="text-xs text-red-700">Problem: {s.lastError}</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-500 mt-3">Phone codes sent (30 days): {r.otpSent}, verified: {r.otpVerified}. Customers pay their own providers; this is for your visibility only.</p>
        </section>
        <section className="rounded-xl bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3">Invoices</h2>
          {invoices.length === 0 ? <p className="text-sm text-slate-500">No invoices yet. Use “Run billing” on the Billing page.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {invoices.map((i) => (
                <li key={i.id} className="py-2 flex items-center justify-between gap-2">
                  <span>{i.number} <span className="text-slate-500">· due {formatPkt(i.dueDate).split(',').slice(0, 2).join(',')}</span></span>
                  <span className="flex items-center gap-2">{formatPrice(i.total.toNumber())} <Pill status={effectiveInvoiceStatus(i.status, i.dueDate, now)} /></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Card title="Web addresses" hint="Each store opens on its own address, such as shop.example.pk. Add it here, point the domain at your hosting (the hosting company shows the exact DNS record), then switch it live. An address that is off never opens the shop. Until a store has a live address, it is served only where DEFAULT_STORE_SLUG points.">
        {domains.length === 0 ? <p className="text-sm text-slate-500 mb-3">No web address yet.</p> : (
          <ul className="divide-y divide-slate-100 text-sm mb-4">
            {domains.map((d) => (
              <li key={d.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium break-all">{d.host}{d.isPrimary && <span className="ml-2 text-xs text-slate-500">main</span>} <span className={d.verifiedAt ? 'text-emerald-700 text-xs' : 'text-amber-700 text-xs'}>{d.verifiedAt ? 'live' : 'off'}</span></span>
                {manage && (
                  <span className="flex items-center gap-3">
                    <ActionForm action={setDomainLiveAction}><input type="hidden" name="storeId" value={r.id} /><input type="hidden" name="domainId" value={d.id} /><input type="hidden" name="live" value={d.verifiedAt ? '0' : '1'} /><button className="underline">{d.verifiedAt ? 'Switch off' : 'Switch live'}</button></ActionForm>
                    <ActionForm action={removeDomainAction} confirm={`Remove ${d.host}?`}><input type="hidden" name="storeId" value={r.id} /><input type="hidden" name="domainId" value={d.id} /><button className="underline text-red-700">Remove</button></ActionForm>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          {manage && (
            <ActionForm action={addDomainAction} className="space-y-2">
              <input type="hidden" name="storeId" value={r.id} />
              <Field label="Add a web address"><input name="host" placeholder="shop.example.pk" required maxLength={253} className={inputCls} /></Field>
              <button className={primaryBtn}>Add address</button>
            </ActionForm>
          )}
          <ActionForm action={checkDomainAction} className="space-y-2">
            <Field label="Check where an address points" hint="Shows its DNS records. Nothing is changed."><input name="host" placeholder="shop.example.pk" defaultValue={domains[0]?.host ?? ''} required maxLength={253} className={inputCls} /></Field>
            <button className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium hover:bg-slate-50">Check</button>
          </ActionForm>
        </div>
      </Card>

      {costs.length > 0 && (
        <section className="rounded-xl bg-white border border-slate-200 p-5">
          <h2 className="font-semibold mb-3">Costs charged to this store only</h2>
          <ul className="text-sm divide-y divide-slate-100">{costs.map((c) => <li key={c.id} className="py-2 flex justify-between"><span>{c.name}{!c.isActive && ' (off)'}</span><span>{formatPrice(c.monthlyAmount.toNumber())}/month</span></li>)}</ul>
        </section>
      )}
    </div>
  )
}
