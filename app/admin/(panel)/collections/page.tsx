import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { listCollections } from '@/lib/admin/collections'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { createCollectionAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function CollectionsPage() {
  const admin = await requireAdmin('products.view')
  const rows = await listCollections(admin.storeId)
  const editable = can(admin.role, 'products.edit')
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Collections</h1>
        <p className="text-slate-600 text-sm mt-1">A collection is a group of products you choose by hand, such as “Eid collection” or “Best sellers”. Each one gets its own page in your shop.</p>
      </div>
      <div className="rounded-xl bg-white border border-slate-200 divide-y divide-slate-100">
        {rows.length === 0 && <p className="p-6 text-sm text-slate-500">No collections yet.</p>}
        {rows.map((c) => (
          <Link key={c.id} href={`/admin/collections/${c.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50">
            <span><span className="font-medium block">{c.title}</span><span className="text-sm text-slate-500">/collections/{c.handle} · {c._count.products} product{c._count.products === 1 ? '' : 's'}</span></span>
            <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${c.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{c.isActive ? 'visible' : 'hidden'}</span>
          </Link>
        ))}
      </div>
      {editable && (
        <Card title="New collection" hint="Give it a name; you choose its products on the next screen.">
          <ActionForm action={createCollectionAction} className="grid sm:grid-cols-[2fr_1fr_auto] gap-3 items-end">
            <Field label="Title"><input name="title" required maxLength={120} placeholder="Eid collection" className={inputCls} /></Field>
            <Field label="Page address (optional)"><input name="handle" maxLength={60} placeholder="eid-collection" className={`${inputCls} font-mono`} /></Field>
            <button className={primaryBtn}>Create</button>
          </ActionForm>
        </Card>
      )}
    </div>
  )
}
