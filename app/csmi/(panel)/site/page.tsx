import { requirePlatform } from '@/lib/csmi/guard'
import { canPlatform } from '@/lib/csmi/rules'
import { getSiteContent } from '@/lib/site/store'
import { faqToText, featuresToText, ICONS } from '@/lib/site/rules'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { resetSiteAction, saveSiteAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function SitePage() {
  const user = await requirePlatform()
  const manage = canPlatform(user.role, 'csmi.manage')
  const c = await getSiteContent()
  const area = `${inputCls} font-mono text-xs leading-relaxed`

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">Public site</h1>
      <p className="text-sm text-slate-600">
        The wording and sections of your public home page. Prices come from <a href="/csmi/plans" className="underline">Plans</a>, notices from <a href="/csmi/banners" className="underline">Banners</a>, and the logos from <a href="/csmi/clients" className="underline">Clients</a>.
        Nothing here can break the page: if something is empty or damaged, the original wording is used.
      </p>
      <Card title="Home page">
        <fieldset disabled={!manage} className="contents">
          <ActionForm action={saveSiteAction} className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Badge above the headline"><input name="heroBadge" defaultValue={c.heroBadge} maxLength={60} required className={inputCls} /></Field>
              <Field label="Note under the buttons"><input name="ctaNote" defaultValue={c.ctaNote} maxLength={80} className={inputCls} /></Field>
              <div className="sm:col-span-2"><Field label="Main headline"><input name="heroTitle" defaultValue={c.heroTitle} maxLength={120} required className={inputCls} /></Field></div>
              <div className="sm:col-span-2"><Field label="Text under the headline"><textarea name="heroText" defaultValue={c.heroText} maxLength={300} rows={2} required className={inputCls} /></Field></div>
              <div className="sm:col-span-2"><Field label="Strip of names (separated by commas)" hint="Payment and courier names shown under the headline"><input name="worksWith" defaultValue={c.worksWith.join(', ')} className={inputCls} /></Field></div>
              <Field label="Features heading"><input name="featuresTitle" defaultValue={c.featuresTitle} maxLength={80} required className={inputCls} /></Field>
              <Field label="Features intro (optional)"><input name="featuresIntro" defaultValue={c.featuresIntro} maxLength={200} className={inputCls} /></Field>
            </div>
            <Field label="Features, one per line" hint={`Format:  icon | title | description.   Icons: ${ICONS.join(', ')}.   Up to 12 lines.`}><textarea name="features" defaultValue={featuresToText(c.features)} rows={9} className={area} /></Field>
            <Field label="Questions and answers, one per line" hint="Format:  question | answer.   Up to 12 lines."><textarea name="faq" defaultValue={faqToText(c.faq)} rows={7} className={area} /></Field>
            <div>
              <p className="text-sm font-medium mb-2">Sections to show</p>
              <div className="grid sm:grid-cols-3 gap-2">
                <Check name="sec_clients" label="Clients and testimonials" defaultChecked={c.sections.clients} />
                <Check name="sec_features" label="Features" defaultChecked={c.sections.features} />
                <Check name="sec_compare" label="Comparison table" defaultChecked={c.sections.compare} />
                <Check name="sec_steps" label="Three steps" defaultChecked={c.sections.steps} />
                <Check name="sec_pricing" label="Pricing" defaultChecked={c.sections.pricing} />
                <Check name="sec_faq" label="Questions" defaultChecked={c.sections.faq} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 items-end">
              <Field label="Clients heading"><input name="clientsTitle" defaultValue={c.clientsTitle} maxLength={80} required className={inputCls} /></Field>
              <Check name="showStoreCount" label="Show the real number of live stores" defaultChecked={c.showStoreCount} />
            </div>
            {manage && <button className={primaryBtn}>Save public site</button>}
          </ActionForm>
        </fieldset>
        {manage && (
          <ActionForm action={resetSiteAction as never} confirm="Replace everything above with the original wording?" className="mt-4">
            <button className="text-xs text-red-700 underline">Reset to the original wording</button>
          </ActionForm>
        )}
      </Card>
    </div>
  )
}
