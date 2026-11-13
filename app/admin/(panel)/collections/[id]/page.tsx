import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/guard'
import { can } from '@/lib/auth/permissions'
import { getCollection, listPickable } from '@/lib/admin/collections'
import { imageVariant } from '@/lib/media/urls'
import ActionForm from '@/components/admin/ActionForm'
import CollectionPicker from '@/components/admin/CollectionPicker'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { deleteCollectionAction, saveCollectionAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function EditCollection({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin('products.view')
  const { id } = await params
  const [c, products] = await Promise.all([getCollection(admin.storeId, id), listPickable(admin.storeId)]) // both limited to this store
  if (!c) notFound()
  const editable = can(admin.role, 'products.edit')
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin/collections" className="text-sm text-slate-600 underline">← All collections</Link>
        <h1 className="text-2xl font-bold mt-2">{c.title}</h1>
        <p className="text-sm text-slate-500">{c.isActive ? <>Shop page: <Link className="underline" href={`/collections/${c.handle}`} target="_blank">/collections/{c.handle}</Link></> : 'Hidden from the shop.'}</p>
      </div>
      <ActionForm action={saveCollectionAction} className="space-y-6">
        <input type="hidden" name="id" value={c.id} />
        <fieldset disabled={!editable} className="contents">
          <Card title="Details">
            <div className="grid gap-4">
              <Field label="Title"><input name="title" defaultValue={c.title} required maxLength={120} className={inputCls} /></Field>
              <Field label="Page address" hint="Lowercase letters, digits and dashes."><input name="handle" defaultValue={c.handle} required maxLength={60} className={`${inputCls} font-mono`} /></Field>
              <Field label="Description (optional)" hint="Shown at the top of the collection page."><textarea name="description" defaultValue={c.description ?? ''} rows={3} maxLength={1000} className={inputCls} /></Field>
              <Check name="isActive" label="Visible in the shop" defaultChecked={c.isActive} />
            </div>
          </Card>
          <Card title="Products" hint="Removing a product from a collection never changes or deletes the product itself.">
            <CollectionPicker items={products.map((p) => ({ id: p.id, name: p.name, status: p.status, thumb: p.media[0] ? imageVariant(p.media[0].media.url, 80) : null }))} chosen={c.products.map((p) => p.productId)} />
          </Card>
          {editable && <button className={primaryBtn}>Save collection</button>}
        </fieldset>
      </ActionForm>
      {editable && (
        <section className="rounded-xl bg-white border border-red-200 p-5 sm:p-6">
          <h2 className="font-semibold text-lg text-red-800">Delete collection</h2>
          <p className="text-sm text-slate-600 mt-1 mb-4">Only the collection is deleted. Its products stay in your shop.</p>
          <ActionForm action={deleteCollectionAction} confirm={`Delete the collection “${c.title}”?`}>
            <input type="hidden" name="id" value={c.id} />
            <button className="rounded-lg bg-red-600 text-white px-5 py-2 text-sm font-medium">Delete this collection</button>
          </ActionForm>
        </section>
      )}
    </div>
  )
}
