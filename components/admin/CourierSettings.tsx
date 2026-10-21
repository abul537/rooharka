import ActionForm from '@/components/admin/ActionForm'
import ServiceCard from '@/components/admin/ServiceCard'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { BUILTIN_COURIERS, MAX_CUSTOM_COURIERS, TRACKING_PLACEHOLDER, type CourierConfig } from '@/lib/couriers/config'
import { SERVICES, type ServiceView } from '@/lib/services/registry'
import { saveCouriersAction } from '@/app/admin/(panel)/settings/actions'

const AUTO_NOTE: Record<string, string> = { tcs: 'Book on TCS, then type the tracking number on the order.', other: 'For any company not listed: type its tracking number on the order.' }

/** Settings > Couriers: which companies this store ships with, the default, any local company, and the owner's own API accounts. */
export default function CourierSettings({ config, views }: { config: CourierConfig; views: Map<string, ServiceView> }) {
  return (
    <Card title="Couriers" hint="Choose the delivery companies you use. You pay each courier directly; the platform never touches that money. Every courier works by typing its tracking number on the order. PostEx and Leopards can also be booked in one click after you connect your own account.">
      <div className="space-y-6">
        <ActionForm action={saveCouriersAction} className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold mb-1">Couriers I use</legend>
            {BUILTIN_COURIERS.map((c) => (
              <Check key={c.key} name={`courier.${c.key}`} label={c.name} hint={c.auto ? 'One-click booking available (connect your account below).' : AUTO_NOTE[c.key]} defaultChecked={config.enabled.includes(c.key)} />
            ))}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Other local courier companies (up to {MAX_CUSTOM_COURIERS})</legend>
            <p className="text-sm text-slate-600">Add any company, for example M&amp;P, Trax, BlueEx or a local rider service. A tracking link is optional: write the address the company uses for tracking and put <code className="rounded bg-slate-100 px-1">{TRACKING_PLACEHOLDER}</code> where the tracking number goes, so customers get a working link. Empty a row to remove that courier.</p>
            {Array.from({ length: MAX_CUSTOM_COURIERS }, (_, i) => {
              const c = config.custom[i]
              return (
                <div key={i} className="grid sm:grid-cols-[1fr_2fr] gap-2">
                  <input type="hidden" name={`customKey${i}`} value={c?.key ?? ''} />
                  <input name={`customName${i}`} defaultValue={c?.name ?? ''} maxLength={40} placeholder="Courier name" className={inputCls} aria-label={`Courier ${i + 1} name`} />
                  <input name={`customUrl${i}`} defaultValue={c?.trackingUrl ?? ''} maxLength={300} placeholder={`https://example.pk/track?no=${TRACKING_PLACEHOLDER}`} className={inputCls} aria-label={`Courier ${i + 1} tracking link`} />
                </div>
              )
            })}
          </fieldset>

          <Field label="My default courier" hint="Shown first on the order page. Leave on “None” to choose each time.">
            <select name="defaultCourier" defaultValue={config.defaultKey ?? ''} className={inputCls}>
              <option value="">None (choose each time)</option>
              {BUILTIN_COURIERS.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
              {config.custom.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select>
          </Field>
          <button className={primaryBtn}>Save couriers</button>
        </ActionForm>

        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">One-click booking (optional)</h3>
            <p className="text-sm text-slate-600">Connect your own merchant account to book parcels from the order page. This is in beta: use “Test connection”, then book one real parcel and check it with the courier. If anything fails you will see the reason and nothing is changed; you can always book on the courier’s own site and add the tracking number.</p>
          </div>
          {SERVICES.filter((d) => d.type === 'COURIER').map((d) => <ServiceCard key={d.key} def={d} view={views.get(d.key)!} />)}
        </div>
      </div>
    </Card>
  )
}
