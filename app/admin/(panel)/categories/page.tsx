import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { listCategories } from '@/lib/admin/categories'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function CategoriesPage() {
  const admin = await requireAdmin('products.view')
  const cats = await listCategories(admin.storeId)
  const editable = can(admin.role, 'products.edit')

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Categories</h1>
      <p className="text-slate-600 -mt-3">Group your products so customers can filter the shop. Categories are optional.</p>

      {editable && (
        <Card title="Add a category">
          <ActionForm action={createCategoryAction} className="grid sm:grid-cols-[1fr_1fr_6rem_auto] gap-3 items-end">
            <Field label="Name"><input name="name" required maxLength={60} className={inputCls} /></Field>
            <Field label="Address (optional)" hint="e.g. hair-oils"><input name="slug" maxLength={60} className={inputCls} /></Field>
            <Field label="Order"><input name="sortOrder" inputMode="numeric" defaultValue="0" className={inputCls} /></Field>
            <div className="space-y-2"><Check name="isActive" label="Visible" defaultChecked /><button className={primaryBtn}>Add</button></div>
          </ActionForm>
        </Card>
      )}

      <Card title={`Your categories (${cats.length})`}>
        {cats.length === 0 && <p className="text-sm text-slate-500">No categories yet.</p>}
        <ul className="divide-y divide-slate-100">
          {cats.map((c) => (
            <li key={c.id} className="py-4">
              <ActionForm action={updateCategoryAction} className="grid sm:grid-cols-[1fr_1fr_6rem_auto] gap-3 items-end">
                <input type="hidden" name="id" value={c.id} />
                <fieldset disabled={!editable} className="contents">
                  <Field label="Name"><input name="name" defaultValue={c.name} required maxLength={60} className={inputCls} /></Field>
                  <Field label="Address"><input name="slug" defaultValue={c.slug} maxLength={60} className={inputCls} /></Field>
                  <Field label="Order"><input name="sortOrder" inputMode="numeric" defaultValue={c.sortOrder} className={inputCls} /></Field>
                  <div className="space-y-2"><Check name="isActive" label="Visible" defaultChecked={c.isActive} />{editable && <button className={primaryBtn}>Save</button>}</div>
                </fieldset>
              </ActionForm>
              <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                <span>{c._count.products} product{c._count.products === 1 ? '' : 's'}</span>
                {editable && (
                  <ActionForm action={deleteCategoryAction} confirm={`Delete “${c.name}”? Its products are kept.`}>
                    <input type="hidden" name="id" value={c.id} /><button className="text-red-700 underline">Delete</button>
                  </ActionForm>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
