import Link from 'next/link'
import { db } from '@/lib/db'
import { requirePlatform } from '@/lib/csmi/guard'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { createStoreAction } from '../../actions'

export const dynamic = 'force-dynamic'

export default async function NewStorePage() {
  await requirePlatform('csmi.manage')
  const plans = await db.plan.findMany({ where: { isActive: true }, orderBy: { monthlyPrice: 'asc' }, select: { id: true, name: true, monthlyPrice: true } })
  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/csmi/stores" className="text-sm text-slate-600 underline">← All stores</Link>
      <h1 className="text-2xl font-bold">Add a store</h1>
      <Card title="Store and owner" hint="The store starts as a 14-day trial if you choose a plan. Create the owner's dashboard login afterwards with `pnpm admin:create` (type the new store address when it asks).">
        <ActionForm action={createStoreAction} className="grid sm:grid-cols-2 gap-4">
          <Field label="Store name"><input name="name" required maxLength={60} className={inputCls} /></Field>
          <Field label="Store address" hint="Lowercase letters, digits and dashes, like my-store."><input name="slug" required maxLength={30} className={inputCls} /></Field>
          <Field label="Owner's name"><input name="ownerName" required maxLength={60} className={inputCls} /></Field>
          <Field label="Owner's email"><input name="ownerEmail" type="email" required maxLength={120} className={inputCls} /></Field>
          <Field label="Owner's phone (optional)"><input name="ownerPhone" placeholder="03001234567" className={inputCls} /></Field>
          <Field label="Plan (optional)">
            <select name="planId" className={inputCls} defaultValue="">
              <option value="">No plan yet</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} (Rs. {Math.round(p.monthlyPrice.toNumber()).toLocaleString('en-PK')}/month)</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2"><button className={primaryBtn}>Add store</button></div>
        </ActionForm>
      </Card>
      <p className="text-sm text-slate-600">Note: one running website serves one store until each store gets its own web address (set with DEFAULT_STORE_SLUG for now).</p>
    </div>
  )
}
