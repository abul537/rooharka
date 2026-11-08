import { db } from '@/lib/db'
import { requirePlatform } from '@/lib/csmi/guard'
import { canPlatform } from '@/lib/csmi/rules'
import { formatPkt } from '@/lib/admin/dates'
import { bannerVisible } from '@/lib/banners/rules'
import ActionForm from '@/components/admin/ActionForm'
import BannerBar from '@/components/BannerBar'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { deleteBannerAction, saveBannerAction } from '../actions'

export const dynamic = 'force-dynamic'

const dateInput = (d: Date | null) => (d ? new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10) : '') // Pakistan day

export default async function BannersPage() {
  const user = await requirePlatform()
  const manage = canPlatform(user.role, 'csmi.manage')
  const banners = await db.banner.findMany({ orderBy: { createdAt: 'desc' } })

  const form = (b?: (typeof banners)[number]) => (
    <ActionForm action={saveBannerAction} className="grid sm:grid-cols-4 gap-3 items-end">
      {b && <input type="hidden" name="bannerId" value={b.id} />}
      <div className="sm:col-span-3"><Field label="Message" hint="One short line, up to 160 characters"><input name="text" defaultValue={b?.text ?? ''} required maxLength={160} className={inputCls} /></Field></div>
      <Check name="isActive" label="On" defaultChecked={b?.isActive ?? true} />
      <Field label="Style"><select name="tone" defaultValue={b?.tone ?? 'INFO'} className={inputCls}><option value="INFO">Information (dark)</option><option value="OFFER">Offer (green)</option><option value="WARNING">Important (amber)</option></select></Field>
      <Field label="Who sees it"><select name="audience" defaultValue={b?.audience ?? 'PUBLIC'} className={inputCls}><option value="PUBLIC">Visitors (public site)</option><option value="STORES">Store owners (dashboard)</option><option value="BOTH">Both</option></select></Field>
      <Field label="Link (optional)" hint="https://… or /pricing"><input name="linkUrl" defaultValue={b?.linkUrl ?? ''} maxLength={300} className={inputCls} /></Field>
      <Field label="Link text"><input name="linkLabel" defaultValue={b?.linkLabel ?? ''} maxLength={30} className={inputCls} /></Field>
      <Field label="Show from (optional)"><input name="startsAt" type="date" defaultValue={dateInput(b?.startsAt ?? null)} className={inputCls} /></Field>
      <Field label="Show until (optional)"><input name="endsAt" type="date" defaultValue={dateInput(b?.endsAt ?? null)} className={inputCls} /></Field>
      <button className={`${primaryBtn} sm:col-start-4`}>{b ? 'Save' : 'Add banner'}</button>
    </ActionForm>
  )

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">Banners</h1>
      <p className="text-sm text-slate-600">
        Notices shown above every page of the public site, inside every store dashboard, or both, between the dates you choose. Use them for offers, maintenance notices or news.
        At most the 3 newest live notices are shown. Changes appear within about 15 seconds.
      </p>
      {manage && <Card title="Add a banner">{form()}</Card>}
      <Card title="Your banners">
        {banners.length === 0 ? <p className="text-sm text-slate-500">No banners yet.</p> : (
          <div className="space-y-6 divide-y divide-slate-100">
            {banners.map((b: (typeof banners)[number]) => {
              const live = bannerVisible(b, 'PUBLIC') || bannerVisible(b, 'STORES')
              return (
                <div key={b.id} className="pt-4 first:pt-0 space-y-3">
                  <div className="overflow-hidden rounded-lg"><BannerBar banners={[b]} /></div>
                  <p className="text-xs text-slate-500"><span className={live ? 'text-emerald-700 font-medium' : ''}>{live ? 'Showing now' : 'Not showing'}</span> · created {formatPkt(b.createdAt)}{b.endsAt ? ` · until ${formatPkt(b.endsAt)}` : ''}</p>
                  {manage && (
                    <>
                      {form(b)}
                      <ActionForm action={deleteBannerAction} confirm="Delete this banner for good?"><input type="hidden" name="bannerId" value={b.id} /><button className="text-xs text-red-700 underline">Delete banner</button></ActionForm>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
