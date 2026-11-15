import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { listCollections } from '@/lib/admin/collections'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { categoryAction, createCollectionAction } from './actions'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function CollectionsPage() {
  const admin = await requireAdmin('products.view')
  const [rows, categories] = await Promise.all([listCollections(admin.storeId), db.category.findMany({ where: { storeId: admin.storeId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true, _count: { select: { products: true } } } })])
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

      <Card title="Shop categories" hint="The simple grouping customers filter by on your Shop page (one category per product). Choose a product’s category on the product’s own page. Deleting a category never deletes its products.">
        <div className="divide-y divide-slate-100">
          {categories.length === 0 && <p className="py-2 text-sm text-slate-500">No categories yet.</p>}
          {categories.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              {editable ? (
                <ActionForm action={categoryAction} className="flex min-w-0 flex-1 items-center gap-2">
                  <input type="hidden" name="what" value="rename" /><input type="hidden" name="id" value={c.id} />
                  <input name="name" defaultValue={c.name} required maxLength={60} aria-label={`Name of category ${c.name}`} className={`${inputCls} max-w-xs`} />
                  <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Rename</button>
                </ActionForm>
              ) : <span className="font-medium">{c.name}</span>}
              <span className="flex items-center gap-4 text-sm text-slate-500">
                {c._count.products} product{c._count.products === 1 ? '' : 's'}
                {editable && <ActionForm action={categoryAction} confirm={`Delete the category “${c.name}”? Its ${c._count.products} product${c._count.products === 1 ? '' : 's'} will be kept, without a category.`}><input type="hidden" name="what" value="delete" /><input type="hidden" name="id" value={c.id} /><button className="text-red-700 underline">Delete</button></ActionForm>}
              </span>
            </div>
          ))}
        </div>
        {editable && (
          <ActionForm action={categoryAction} className="mt-4 flex items-end gap-3 border-t border-slate-100 pt-4">
            <input type="hidden" name="what" value="create" />
            <Field label="New category"><input name="name" required maxLength={60} placeholder="Honey" className={inputCls} /></Field>
            <button className={primaryBtn}>Add</button>
          </ActionForm>
        )}
      </Card>
    </div>
  )
}
