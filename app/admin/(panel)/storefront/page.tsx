import Link from 'next/link'
import { Eye } from 'lucide-react'
import { requireAdmin } from '@/lib/auth/guard'
import { db } from '@/lib/db'
import { loadStorefrontForEdit } from '@/lib/storefront/data'
import { POLICY_KEYS, POLICY_TITLES } from '@/lib/storefront/rules'
import { ensureTheme, getThemeForEdit, listThemes } from '@/lib/theme/data'
import { loadSectionData } from '@/lib/theme/page-data'
import { mediaSizes } from '@/lib/theme/media'
import { TEMPLATE_TYPES, sectionMedia } from '@/lib/theme/schema'
import { MAX_THEMES } from '@/lib/theme/settings'
import { THEME_PRESETS } from '@/lib/theme/presets'
import { listCollections } from '@/lib/admin/collections'
import { formatPkt } from '@/lib/admin/dates'
import ActionForm from '@/components/admin/ActionForm'
import ThemeEditor from '@/components/admin/ThemeEditor'
import { Card, Field, inputCls, primaryBtn } from '@/components/admin/ui'
import { createThemeAction, deleteThemeAction, publishThemeAction, saveLookAction, savePagesAction } from './actions'

export const dynamic = 'force-dynamic'
const area = `${inputCls} leading-relaxed`
const tab = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-medium ${on ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}`
const ghost = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50'

export default async function StorefrontPage({ searchParams }: { searchParams: Promise<{ tab?: string; theme?: string }> }) {
  const admin = await requireAdmin('settings.edit')
  const sp = await searchParams
  const store = await db.store.findUnique({ where: { id: admin.storeId }, select: { name: true, currency: true, settings: { select: { displayName: true } } } })
  const shopName = store?.settings?.displayName ?? store?.name ?? 'Our store'
  const { content: c, logoUrl, seo } = await loadStorefrontForEdit(admin.storeId, shopName)
  const pages = sp.tab === 'pages'

  const head = (
    <>
      <h1 className="text-2xl font-bold">Storefront</h1>
      <p className="text-slate-600 -mt-3">Design your shop from ready-made sections: choose them, put them in order and fill in your own words. No code needed.</p>
      <nav aria-label="Storefront" className="flex flex-wrap gap-2">
        <Link href="/admin/storefront" className={tab(!pages)}>Themes and page design</Link>
        <Link href="/admin/storefront?tab=pages" className={tab(pages)}>Header, footer and pages</Link>
      </nav>
    </>
  )

  if (pages) {
    return (
      <div className="max-w-4xl space-y-6">
        {head}
        <Card title="Header and footer" hint="Shown on every page of your shop, whichever theme is live. Your shop name, phone numbers and email come from Settings.">
          <ActionForm action={saveLookAction} className="grid sm:grid-cols-2 gap-4">
            <Field label="Tagline (under your name)"><input name="tagline" defaultValue={c.tagline} maxLength={80} className={inputCls} /></Field>
            <Field label="Logo image address" hint="https://… (your name is shown if empty)"><input name="logoUrl" defaultValue={logoUrl} maxLength={400} className={inputCls} /></Field>
            <Field label="Browser tab icon address (optional)" hint="https://… a small square image"><input name="faviconUrl" defaultValue={seo.faviconUrl} maxLength={400} className={inputCls} /></Field>
            <Field label="Search-engine title (optional)" hint="Up to 70 characters"><input name="seoTitle" defaultValue={seo.seoTitle} maxLength={70} className={inputCls} /></Field>
            <div className="sm:col-span-2"><Field label="Search-engine description (optional)" hint="Up to 160 characters. Shown under your name in Google."><input name="seoDescription" defaultValue={seo.seoDescription} maxLength={160} className={inputCls} /></Field></div>
            <Field label="Announcement bar text" hint="Empty = no bar. For sales or delivery notices."><input name="announcementText" defaultValue={c.announcement.text} maxLength={140} className={inputCls} /></Field>
            <Field label="Announcement link (optional)" hint="https://… or /shop"><input name="announcementLink" defaultValue={c.announcement.link} maxLength={300} className={inputCls} /></Field>
            <div className="sm:col-span-2"><Field label="Footer text"><input name="footerBlurb" defaultValue={c.footerBlurb} maxLength={240} className={inputCls} /></Field></div>
            {(['instagram', 'facebook', 'youtube', 'tiktok'] as const).map((k) => (
              <div key={k}><Field label={`${k[0].toUpperCase()}${k.slice(1)} address (optional)`}><input name={k} defaultValue={c.social[k]} maxLength={300} placeholder="https://" className={inputCls} /></Field></div>
            ))}
            <div className="sm:col-span-2"><button className={primaryBtn}>Save header and footer</button></div>
          </ActionForm>
        </Card>
        <Card title="Contact and policy pages" hint="The About page is now designed with sections under “Themes and page design”. Policy pages appear in your footer only when they have text.">
          <ActionForm action={savePagesAction} className="space-y-4">
            <Field label="About page heading" hint="Used as the browser tab title of the About page."><input name="aboutTitle" defaultValue={c.about.title} maxLength={80} required className={inputCls} /></Field>
            <input type="hidden" name="aboutBody" value={c.about.body} />
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

  // The first visit turns the shop's current home page into a live theme, so the editor opens on what customers see.
  await ensureTheme(admin.storeId, c, shopName)
  const [themes, collections] = await Promise.all([listThemes(admin.storeId), listCollections(admin.storeId)])
  const chosen = themes.find((t) => t.id === sp.theme) ?? themes.find((t) => t.isActive) ?? themes[0]
  const theme = chosen ? await getThemeForEdit(admin.storeId, chosen.id, c, shopName) : null
  // What the live preview needs: the store's real products, categories, collections and reviews, and known file sizes.
  const allSections = theme ? TEMPLATE_TYPES.flatMap((t) => theme.pages[t].sections) : []
  const [data, sizes] = theme
    ? await Promise.all([loadSectionData({ id: admin.storeId, name: shopName, currency: store?.currency ?? 'PKR' }, allSections, true), mediaSizes(admin.storeId, allSections.flatMap(sectionMedia))])
    : [null, {}]

  return (
    <div className="space-y-6">
      {head}

      <Card title="Your themes" hint="One theme is live. The others are drafts: change them freely, preview them, and publish when you are happy. Customers only ever see the live theme.">
        <ul className="divide-y divide-slate-100">
          {themes.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="font-medium">{t.name}</span>
                <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-medium ${t.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{t.isActive ? 'Live' : 'Draft'}</span>
                {t.id === chosen?.id && <span className="ml-2 text-xs text-slate-500">open below</span>}
                <span className="block text-xs text-slate-500">Last changed {formatPkt(t.updatedAt)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {t.id !== chosen?.id && <Link href={`/admin/storefront?theme=${t.id}`} className={ghost}>Edit</Link>}
                <a href={`/admin/preview?path=/&theme=${t.id}`} target="_blank" rel="noopener" className={`${ghost} inline-flex items-center gap-1`}><Eye className="h-4 w-4" aria-hidden /> Preview</a>
                {!t.isActive && (
                  <>
                    <ActionForm action={publishThemeAction} confirm={`Make “${t.name}” your live theme? Customers will see it within 15 seconds.`}><input type="hidden" name="themeId" value={t.id} /><button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Publish</button></ActionForm>
                    <ActionForm action={deleteThemeAction} confirm={`Delete the draft theme “${t.name}” for good?`}><input type="hidden" name="themeId" value={t.id} /><button className="text-sm text-red-700 underline">Delete</button></ActionForm>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        {themes.length < MAX_THEMES && (
          <ActionForm action={createThemeAction} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_1.4fr_auto] items-end">
            <Field label="New theme name (optional)"><input name="name" maxLength={50} placeholder="Eid sale" className={inputCls} /></Field>
            <Field label="Start from">
              <select name="from" className={inputCls} defaultValue="minimal">
                <optgroup label="Ready-made designs">{Object.entries(THEME_PRESETS).map(([k, p]) => <option key={k} value={k}>{p.name}: {p.description}</option>)}</optgroup>
                <optgroup label="A copy of one of your themes">{themes.map((t) => <option key={t.id} value={`copy:${t.id}`}>Copy of {t.name}</option>)}</optgroup>
              </select>
            </Field>
            <button className={primaryBtn}>Add theme</button>
          </ActionForm>
        )}
      </Card>

      {theme && data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Editing: {theme.name} <span className={`ml-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${theme.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{theme.isActive ? 'Live: saving changes your shop' : 'Draft: customers do not see it'}</span></h2>
          </div>
          {/* The key restarts the editor when another theme is opened. */}
          <ThemeEditor key={theme.id} theme={{ id: theme.id, name: theme.name, isActive: theme.isActive, settings: theme.settings, pages: theme.pages }} data={data} sizes={sizes} collections={collections.filter((x) => x.isActive).map((x) => ({ handle: x.handle, title: x.title }))} />
        </>
      )}
    </div>
  )
}
