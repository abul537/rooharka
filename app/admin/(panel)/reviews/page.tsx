import Link from 'next/link'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { formatPkt } from '@/lib/admin/dates'
import ActionForm from '@/components/admin/ActionForm'
import { reviewAction } from './actions'

export const dynamic = 'force-dynamic'
const pill = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-medium ${on ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`

/** REVIEWS: what customers wrote about this store's products. Nothing is shown in the shop until it is approved here. */
export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const admin = await requireAdmin('products.view')
  const shown = (await searchParams).show === 'shown'
  const mine = { product: { storeId: admin.storeId } }
  const [waiting, approved, rows] = await Promise.all([
    db.review.count({ where: { ...mine, isApproved: false } }),
    db.review.count({ where: { ...mine, isApproved: true } }),
    db.review.findMany({ where: { ...mine, isApproved: shown }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, authorName: true, city: true, rating: true, body: true, isVerified: true, isApproved: true, createdAt: true, product: { select: { id: true, name: true } } } }),
  ])
  const editable = can(admin.role, 'products.edit')
  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Reviews</h1>
        <p className="mt-1 text-sm text-slate-600">Customers write reviews on your product pages. A review appears in your shop only after you approve it. “Verified buyer” means the customer gave the tracking code of a delivered order of that product.</p>
      </div>
      <nav className="flex gap-2" aria-label="Which reviews">
        <Link href="/admin/reviews" className={pill(!shown)} aria-current={!shown ? 'page' : undefined}>Waiting for you <span className="opacity-70">{waiting}</span></Link>
        <Link href="/admin/reviews?show=shown" className={pill(shown)} aria-current={shown ? 'page' : undefined}>Shown in the shop <span className="opacity-70">{approved}</span></Link>
      </nav>
      {rows.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{shown ? 'No approved reviews yet.' : 'No reviews are waiting.'}</p>}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium"><span aria-label={`${r.rating} out of 5 stars`} className="text-amber-500">{'★'.repeat(r.rating)}<span className="text-slate-300">{'★'.repeat(5 - r.rating)}</span></span> <span className="ml-2">{r.authorName}</span>{r.city && <span className="text-slate-500"> · {r.city}</span>}{r.isVerified && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Verified buyer</span>}</p>
              <p className="text-xs text-slate-500">{formatPkt(r.createdAt)}</p>
            </div>
            <p className="mt-1 text-sm text-slate-500">on <Link href={`/admin/products/${r.product.id}`} className="underline">{r.product.name}</Link></p>
            <p className="mt-3 whitespace-pre-line text-slate-800">{r.body}</p>
            {editable && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <ActionForm action={reviewAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="what" value={r.isApproved ? 'hide' : 'approve'} /><button className={r.isApproved ? 'rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium hover:bg-slate-50' : 'rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white'}>{r.isApproved ? 'Hide from the shop' : 'Approve and show'}</button></ActionForm>
                <ActionForm action={reviewAction} confirm="Delete this review for good?"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="what" value="delete" /><button className="text-sm text-red-700 underline">Delete</button></ActionForm>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
