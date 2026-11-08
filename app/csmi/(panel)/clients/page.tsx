import { db } from '@/lib/db'
import { requirePlatform } from '@/lib/csmi/guard'
import { canPlatform } from '@/lib/csmi/rules'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { deleteClientAction, saveClientAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  const user = await requirePlatform()
  const manage = canPlatform(user.role, 'csmi.manage')
  const clients = await db.showcaseClient.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })

  const form = (c?: (typeof clients)[number]) => (
    <ActionForm action={saveClientAction} className="grid sm:grid-cols-4 gap-3 items-end">
      {c && <input type="hidden" name="clientId" value={c.id} />}
      <div className="sm:col-span-2"><Field label="Business name"><input name="name" defaultValue={c?.name ?? ''} required maxLength={60} className={inputCls} /></Field></div>
      <Field label="Order" hint="Lowest first"><input name="sortOrder" inputMode="numeric" defaultValue={c?.sortOrder ?? 0} className={inputCls} /></Field>
      <Check name="isVisible" label="Show on site" defaultChecked={c?.isVisible ?? true} />
      <div className="sm:col-span-2"><Field label="Logo image address (optional)" hint="https://… A name is shown if empty"><input name="logoUrl" defaultValue={c?.logoUrl ?? ''} maxLength={400} className={inputCls} /></Field></div>
      <div className="sm:col-span-2"><Field label="Website (optional)"><input name="website" defaultValue={c?.website ?? ''} maxLength={300} className={inputCls} /></Field></div>
      <div className="sm:col-span-3"><Field label="Testimonial (optional)" hint="Only if they agreed. Up to 240 characters."><input name="quote" defaultValue={c?.quote ?? ''} maxLength={240} className={inputCls} /></Field></div>
      <Field label="Who said it"><input name="person" defaultValue={c?.person ?? ''} maxLength={60} placeholder="Ayesha Khan, owner" className={inputCls} /></Field>
      <label className="sm:col-span-3 flex items-start gap-2 text-sm"><input type="checkbox" name="permission" defaultChecked={!!c} className="mt-1" /> I confirm this business agreed to be named (and quoted, if a testimonial is entered).</label>
      <button className={primaryBtn}>{c ? 'Save' : 'Add client'}</button>
    </ActionForm>
  )

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">Clients</h1>
      <p className="text-sm text-slate-600">
        The businesses you show on the public site under “Trusted by”, with an optional testimonial. Only what you enter here is shown: nothing is invented.
        Show a business only with its permission. You can also show the real number of live stores from the <a href="/csmi/site" className="underline">Public site</a> page.
      </p>
      {manage && <Card title="Add a client">{form()}</Card>}
      <Card title="Your clients">
        {clients.length === 0 ? <p className="text-sm text-slate-500">None yet. The section stays hidden until there is something to show.</p> : (
          <div className="space-y-6 divide-y divide-slate-100">
            {clients.map((c: (typeof clients)[number]) => (
              <div key={c.id} className="pt-4 first:pt-0 space-y-3">
                <p className="text-sm font-medium">{c.name} <span className={c.isVisible ? 'text-emerald-700 font-normal' : 'text-slate-500 font-normal'}>{c.isVisible ? '· showing' : '· hidden'}</span></p>
                {manage && (
                  <>
                    {form(c)}
                    <ActionForm action={deleteClientAction} confirm={`Remove ${c.name} for good?`}><input type="hidden" name="clientId" value={c.id} /><button className="text-xs text-red-700 underline">Remove client</button></ActionForm>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
