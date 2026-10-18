import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/guard'
import { CUSTOMER_PAGE, listCustomers } from '@/lib/admin/customers'
import { formatPrice } from '@/lib/format'
import { formatPkt } from '@/lib/admin/dates'

export const dynamic = 'force-dynamic'

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const admin = await requireAdmin('customers.view')
  const sp = await searchParams
  const q = (sp.q ?? '').trim().slice(0, 60)
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)
  const { total, rows } = await listCustomers(admin.storeId, q, page)
  const pages = Math.max(1, Math.ceil(total / CUSTOMER_PAGE))
  const href = (p: number) => `/admin/customers?${new URLSearchParams({ ...(q && { q }), ...(p > 1 && { page: String(p) }) })}`

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold mb-4">Customers</h1>
      <form className="flex gap-2 mb-4" role="search">
        <input name="q" defaultValue={q} placeholder="Search by name or phone" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button className="rounded-lg bg-slate-900 text-white px-4 text-sm">Search</button>
      </form>
      <div className="rounded-xl bg-white border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b border-slate-200">
            <tr><th className="p-3">Customer</th><th className="p-3">Phone</th><th className="p-3">Orders</th><th className="p-3">Spent</th><th className="p-3">Last order</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">No customers found.</td></tr>}
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="p-3 font-medium"><Link className="underline" href={`/admin/customers/${c.id}`}>{[c.firstName, c.lastName].filter(Boolean).join(' ')}</Link></td>
                <td className="p-3">{c.phone}</td>
                <td className="p-3">{c.ordersCount}</td>
                <td className="p-3">{formatPrice(c.totalSpent.toNumber())}</td>
                <td className="p-3 whitespace-nowrap text-slate-600">{c.lastOrderAt ? formatPkt(c.lastOrderAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-4 text-sm">
        <span className="text-slate-600">{total} customer{total === 1 ? '' : 's'} · page {page} of {pages}</span>
        <span className="flex gap-3">
          {page > 1 && <Link className="underline" href={href(page - 1)}>Previous</Link>}
          {page < pages && <Link className="underline" href={href(page + 1)}>Next</Link>}
        </span>
      </div>
    </div>
  )
}
