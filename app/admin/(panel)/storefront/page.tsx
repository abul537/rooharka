import { requireAdmin } from '@/lib/auth/guard'
import { db } from '@/lib/db'
import { loadStorefrontForEdit } from '@/lib/storefront/data'
import { COLORS, FONTS, ICONS, PALETTES, POLICY_KEYS, POLICY_TITLES, faqToText } from '@/lib/storefront/rules'
import { PRESETS } from '@/lib/storefront/presets'
import ActionForm from '@/components/admin/ActionForm'
import { Card, Check, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { loadPresetAction, saveFaqAction, saveHomeAction, saveLookAction, savePagesAction } from './actions'

export const dynamic = 'force-dynamic'

const area = `${inputCls} leading-relaxed`

export default async function StorefrontPage() {
  const admin = await requireAdmin('settings.edit')
  const store = await db.store.findUnique({ where: { id: admin.storeId }, select: { name: true, settings: { select: { displayName: true } } } })
  const { content: c, logoUrl, seo } = await loadStorefrontForEdit(admin.storeId, store?.settings?.displayName ?? store?.name ?? '')

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">Storefront</h1>
      <p className="text-slate-600 -mt-3">
        Everything your customers see: the look, the home page, About, Contact, questions and policies. Changes show on your shop within 15 seconds.
        Your store name, phone numbers and email come from <a href="/admin/settings" className="underline">Settings</a>; products from <a href="/admin/products" className="underline">Products</a>.
        Images are used by their web address (https://…), for example from your own photo hosting.
      </p>

      <Card title="Start from a ready-made layout" hint="Replaces the wording below with a starting point; you can then change every word.">
        <ActionForm action={loadPresetAction} confirm="This replaces all the wording on this page with the chosen starting point. Continue?" className="flex flex-wrap items-end gap-3">
          <Field label="Starting point"><select name="preset" className={inputCls}>{Object.entries(PRESETS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></Field>
          <button className={primaryBtn}>Load it</button>
        </ActionForm>
      </Card>

      <Card title="Look and feel" hint="Layout, colours, announcement bar, footer and social links.">
        <ActionForm action={saveLookAction} className="grid sm:grid-cols-2 gap-4">
          <Field label="Home page layout" hint="Many products, or one hero product (the original model)">
            <select name="layout" defaultValue={c.layout} className={inputCls}><option value="CATALOG">Modern store: many products</option><option value="SINGLE_PRODUCT">Single hero product</option></select>
          </Field>
          <Field label="Colour"><select name="color" defaultValue={c.color} className={inputCls}>{COLORS.map((k) => <option key={k} value={k}>{PALETTES[k].name}</option>)}</select></Field>
          <Field label="Headings style"><select name="font" defaultValue={c.font} className={inputCls}>{FONTS.map((f) => <option key={f} value={f}>{f === 'serif' ? 'Classic (serif)' : 'Modern (sans-serif)'}</option>)}</select></Field>
          <Field label="Tagline (under your name)"><input name="tagline" defaultValue={c.tagline} maxLength={80} className={inputCls} /></Field>
          <Field label="Logo image address" hint="https://… (your name is shown if empty)"><input name="logoUrl" defaultValue={logoUrl} maxLength={400} className={inputCls} /></Field>
          <Field label="Browser tab icon address (optional)" hint="https://… a small square image"><input name="faviconUrl" defaultValue={seo.faviconUrl} maxLength={400} className={inputCls} /></Field>
          <Field label="Search-engine title (optional)" hint="Up to 70 characters"><input name="seoTitle" defaultValue={seo.seoTitle} maxLength={70} className={inputCls} /></Field>
          <div className="sm:col-span-2"><Field label="Search-engine description (optional)" hint="Up to 160 characters. Shown under your name in Google."><input name="seoDescription" defaultValue={seo.seoDescription} maxLength={160} className={inputCls} /></Field></div>
          <Field label="Footer text"><input name="footerBlurb" defaultValue={c.footerBlurb} maxLength={240} className={inputCls} /></Field>
          <Field label="Announcement bar text" hint="Empty = no bar. For sales or delivery notices."><input name="announcementText" defaultValue={c.announcement.text} maxLength={140} className={inputCls} /></Field>
          <Field label="Announcement link (optional)" hint="https://… or /shop"><input name="announcementLink" defaultValue={c.announcement.link} maxLength={300} className={inputCls} /></Field>
          {(['instagram', 'facebook', 'youtube', 'tiktok'] as const).map((k) => (
            <div key={k}><Field label={`${k[0].toUpperCase()}${k.slice(1)} address (optional)`}><input name={k} defaultValue={c.social[k]} maxLength={300} placeholder="https://" className={inputCls} /></Field></div>
          ))}
          <div className="sm:col-span-2"><button className={primaryBtn}>Save look and feel</button></div>
        </ActionForm>
      </Card>

      <Card title="Home page" hint="The landing page customers see first.">
        <ActionForm action={saveHomeAction} className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Small badge above the headline"><input name="heroBadge" defaultValue={c.hero.badge} maxLength={60} className={inputCls} /></Field>
            <Field label="Headline"><input name="heroTitle" defaultValue={c.hero.title} maxLength={120} required className={inputCls} /></Field>
            <Field label="Sub-headline"><input name="heroSubtitle" defaultValue={c.hero.subtitle} maxLength={120} className={inputCls} /></Field>
            <Field label="Hero image address (optional)"><input name="heroImage" defaultValue={c.hero.imageUrl} maxLength={400} placeholder="https://" className={inputCls} /></Field>
            <div className="sm:col-span-2"><Field label="Text under the headline"><textarea name="heroText" defaultValue={c.hero.text} maxLength={300} rows={2} className={area} /></Field></div>
            <Field label="Main button text" hint="Goes to your shop"><input name="heroPrimary" defaultValue={c.hero.primaryLabel} maxLength={30} required className={inputCls} /></Field>
            <Field label="Second button text (optional)"><input name="heroSecondary" defaultValue={c.hero.secondaryLabel} maxLength={30} className={inputCls} /></Field>
            <Field label="Second button goes to" hint="/about, /contact or https://…"><input name="heroSecondaryLink" defaultValue={c.hero.secondaryLink} maxLength={300} className={inputCls} /></Field>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Highlights bar (up to 4)</legend>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="grid sm:grid-cols-[8rem_1fr_2fr] gap-2">
                <select name={`trustIcon${i}`} defaultValue={c.trust[i]?.icon ?? 'check'} aria-label={`Highlight ${i + 1} icon`} className={inputCls}>{ICONS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
                <input name={`trustTitle${i}`} defaultValue={c.trust[i]?.title ?? ''} maxLength={40} placeholder="Title" aria-label={`Highlight ${i + 1} title`} className={inputCls} />
                <input name={`trustText${i}`} defaultValue={c.trust[i]?.text ?? ''} maxLength={120} placeholder="Short text" aria-label={`Highlight ${i + 1} text`} className={inputCls} />
              </div>
            ))}
          </fieldset>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Story heading"><input name="storyTitle" defaultValue={c.story.title} maxLength={80} required className={inputCls} /></Field>
            <Field label="Story image address (optional)"><input name="storyImage" defaultValue={c.story.imageUrl} maxLength={400} placeholder="https://" className={inputCls} /></Field>
            <div className="sm:col-span-2"><Field label="Story text" hint="Leave a blank line between paragraphs. Up to 1200 characters."><textarea name="storyText" defaultValue={c.story.text} maxLength={1200} rows={5} className={area} /></Field></div>
            <Field label="Benefits heading"><input name="benefitsTitle" defaultValue={c.benefits.title} maxLength={80} required className={inputCls} /></Field>
            <Field label="Benefits, one per line"><textarea name="benefitItems" defaultValue={c.benefits.items.join('\n')} rows={4} className={area} /></Field>
            <Field label="Closing heading"><input name="ctaTitle" defaultValue={c.cta.title} maxLength={80} required className={inputCls} /></Field>
            <Field label="Closing button text"><input name="ctaLabel" defaultValue={c.cta.label} maxLength={30} required className={inputCls} /></Field>
            <div className="sm:col-span-2"><Field label="Closing text"><input name="ctaText" defaultValue={c.cta.text} maxLength={200} className={inputCls} /></Field></div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Sections to show on the home page</p>
            <div className="grid sm:grid-cols-3 gap-2">
              <Check name="show_categories" label="Categories" defaultChecked={c.show.categories} />
              <Check name="show_featured" label="Featured products" defaultChecked={c.show.featured} />
              <Check name="show_story" label="Story" defaultChecked={c.show.story} />
              <Check name="show_benefits" label="Benefits" defaultChecked={c.show.benefits} />
              <Check name="show_reviews" label="Customer reviews (real, approved ones)" defaultChecked={c.show.reviews} />
              <Check name="show_faq" label="Questions" defaultChecked={c.show.faq} />
              <Check name="show_cta" label="Closing call to action" defaultChecked={c.show.cta} />
            </div>
          </div>
          <button className={primaryBtn}>Save home page</button>
        </ActionForm>
      </Card>

      <Card title="Questions customers ask" hint="Shown on the home page and the Contact page.">
        <ActionForm action={saveFaqAction} className="space-y-3">
          <Field label="One per line, written as: question | answer" hint="Up to 12."><textarea name="faq" defaultValue={faqToText(c.faq)} rows={7} className={area} /></Field>
          <button className={primaryBtn}>Save questions</button>
        </ActionForm>
      </Card>

      <Card title="About, Contact and policy pages" hint="Policy pages appear in your footer only when they have text.">
        <ActionForm action={savePagesAction} className="space-y-4">
          <Field label="About page heading"><input name="aboutTitle" defaultValue={c.about.title} maxLength={80} required className={inputCls} /></Field>
          <Field label="About page text" hint="Leave a blank line between paragraphs. Up to 4000 characters."><textarea name="aboutBody" defaultValue={c.about.body} maxLength={4000} rows={7} className={area} /></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Field label="Contact page introduction"><textarea name="contactIntro" defaultValue={c.contact.intro} maxLength={300} rows={2} className={area} /></Field></div>
            <Field label="Shop address (optional)"><input name="contactAddress" defaultValue={c.contact.address} maxLength={200} className={inputCls} /></Field>
            <Field label="Opening hours (optional)"><input name="contactHours" defaultValue={c.contact.hours} maxLength={120} placeholder="Mon to Sat, 10am to 7pm" className={inputCls} /></Field>
          </div>
          {POLICY_KEYS.map((k) => (
            <div key={k}><Field label={POLICY_TITLES[k]} hint="Plain text, blank line between paragraphs. Leave empty to hide the page."><textarea name={`policy_${k}`} defaultValue={c.policies[k]} maxLength={6000} rows={5} className={area} /></Field></div>
          ))}
          <p className="text-xs text-slate-500">Write policies that match how you really run your store. Ask a lawyer if you are unsure.</p>
          <button className={primaryBtn}>Save pages</button>
        </ActionForm>
      </Card>
    </div>
  )
}
