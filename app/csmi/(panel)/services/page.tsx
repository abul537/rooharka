import { db } from '@/lib/db'
import { requirePlatform } from '@/lib/csmi/guard'
import { canPlatform } from '@/lib/csmi/rules'
import { loadPlatform } from '@/lib/csmi/data'
import { formatPrice } from '@/lib/format'
import ActionForm from '@/components/admin/ActionForm'
import { setServiceFeeAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function ServicesPage() {
  const user = await requirePlatform()
  const manage = canPlatform(user.role, 'csmi.manage')
  const [p, catalog] = await Promise.all([loadPlatform(30), db.serviceCatalog.findMany({ orderBy: { name: 'asc' } })])
  const usage = new Map(p.services.map((s) => [s.key, s]))

  return (
    <div className="max-w-5xl space-y-5">
      <h1 className="text-2xl font-bold">Services</h1>
      <p className="text-sm text-slate-600">Every service stores can connect. Store owners connect their own accounts and pay those companies directly. The add-on fee is what <em>you</em> charge per store each month for having the service switched on (leave 0 for free). It is added to the store's revenue and its invoices.</p>
      <div className="overflow-x-auto rounded-xl bg-white border border-slate-200">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b border-slate-200"><tr><th className="p-3">Service</th><th className="p-3">Type</th><th className="p-3 text-right">Stores using it</th><th className="p-3 text-right">Failing</th><th className="p-3">Your monthly fee per store</th></tr></thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {catalog.map((s) => {
              const u = usage.get(s.key)
              return (
                <tr key={s.key}>
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3 capitalize">{s.type.toLowerCase()}</td>
                  <td className="p-3 text-right">{u?.enabledStores ?? 0}</td>
                  <td className={`p-3 text-right ${u?.failing ? 'text-red-700 font-semibold' : ''}`}>{u?.failing ?? 0}</td>
                  <td className="p-3">
                    {manage ? (
                      <ActionForm action={setServiceFeeAction} className="flex gap-2">
                        <input type="hidden" name="serviceKey" value={s.key} />
                        <input name="fee" inputMode="decimal" defaultValue={s.platformFee.toNumber()} aria-label={`Monthly fee for ${s.name}`} className="rounded border border-slate-300 px-2 py-1 w-28" />
                        <button className="rounded bg-slate-900 text-white px-3 py-1 text-xs">Save</button>
                      </ActionForm>
                    ) : formatPrice(s.platformFee.toNumber())}
                  </td>
                </tr>
              )
            })}
            {catalog.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">No services yet. Run the database seed.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
