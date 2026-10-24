import Link from 'next/link'
import { requirePlatform } from '@/lib/csmi/guard'
import { canPlatform } from '@/lib/csmi/rules'
import { listInvoices } from '@/lib/csmi/data'
import { formatPrice } from '@/lib/format'
import { formatPkt } from '@/lib/admin/dates'
import ActionForm from '@/components/admin/ActionForm'
import { Pill } from '@/components/csmi/Pills'
import { markPaidAction, runBillingAction, voidInvoiceAction } from '../actions'

export const dynamic = 'force-dynamic'
const FILTERS = [['open', 'Unpaid'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['all', 'All']] as const
const short = (d: Date) => formatPkt(d).split(',').slice(0, 2).join(',')

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const user = await requirePlatform()
  const manage = canPlatform(user.role, 'csmi.manage')
  const { f } = await searchParams
  const filter = FILTERS.find(([k]) => k === f)?.[0] ?? 'open'
  const invoices = await listInvoices(filter)

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Billing</h1>
        {manage && (
          <ActionForm action={runBillingAction} confirm="Run billing now? It creates any missing invoices and marks late ones overdue. It is safe to repeat.">
            <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium">Run billing</button>
          </ActionForm>
        )}
      </div>
      <p className="text-sm text-slate-600">Run billing creates one invoice per store for its current period (never two), moves finished periods on, and marks unpaid invoices past their due date as overdue. Stores with overdue invoices show as “past due”; nothing is suspended automatically.</p>
      <nav aria-label="Filter" className="flex gap-1 text-sm">
        {FILTERS.map(([k, label]) => <Link key={k} href={`/csmi/billing?f=${k}`} className={`rounded-lg px-3 py-1.5 border ${k === filter ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300'}`}>{label}</Link>)}
      </nav>

      <div className="overflow-x-auto rounded-xl bg-white border border-slate-200">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b border-slate-200"><tr><th className="p-3">Invoice</th><th className="p-3">Store</th><th className="p-3">Period</th><th className="p-3">Due</th><th className="p-3 text-right">Amount</th><th className="p-3">Status</th>{manage && <th className="p-3">Action</th>}</tr></thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {invoices.map((i) => (
              <tr key={i.id}>
                <td className="p-3 font-medium whitespace-nowrap">{i.number}</td>
                <td className="p-3"><Link href={`/csmi/stores/${i.store.id}`} className="hover:underline">{i.store.name}</Link></td>
                <td className="p-3 whitespace-nowrap">{short(i.periodStart)} to {short(i.periodEnd)}</td>
                <td className="p-3 whitespace-nowrap">{short(i.dueDate)}</td>
                <td className="p-3 text-right">{formatPrice(i.total)}</td>
                <td className="p-3"><Pill status={i.shownStatus} />{i.paidAt && <div className="text-xs text-slate-500">{short(i.paidAt)}{i.paymentMethod ? ` · ${i.paymentMethod}` : ''}{i.paymentRef ? ` · ${i.paymentRef}` : ''}</div>}</td>
                {manage && (
                  <td className="p-3">
                    {(i.shownStatus === 'OPEN' || i.shownStatus === 'OVERDUE') && (
                      <div className="space-y-1.5">
                        <ActionForm action={markPaidAction} className="flex flex-wrap gap-1.5">
                          <input type="hidden" name="invoiceId" value={i.id} />
                          <select name="method" className="rounded border border-slate-300 px-2 py-1 text-xs" aria-label="Paid by">
                            {['bank', 'jazzcash', 'easypaisa', 'cash', 'other'].map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <input name="reference" placeholder="Reference" maxLength={60} className="rounded border border-slate-300 px-2 py-1 text-xs w-28" />
                          <button className="rounded bg-emerald-700 text-white px-2.5 py-1 text-xs">Mark paid</button>
                        </ActionForm>
                        <ActionForm action={voidInvoiceAction} confirm={`Cancel invoice ${i.number}?`}>
                          <input type="hidden" name="invoiceId" value={i.id} />
                          <button className="text-xs text-red-700 underline">Cancel invoice</button>
                        </ActionForm>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-500">No invoices here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
