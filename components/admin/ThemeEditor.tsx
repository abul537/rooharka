'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { Eye } from 'lucide-react'
import { publishThemeAction, saveThemeAction } from '@/app/admin/(panel)/storefront/actions'
import {
  CORE_SECTIONS, MAX_SECTIONS, RATIOS, SECTIONS, SECTION_BY_TYPE, TEMPLATE_LABEL, TEMPLATE_TYPES, newBlock, newSection, pageWarnings, sectionSummary,
  type Block, type Field as FieldDef, type Section, type SectionDef, type Settings, type Template, type TemplateType, type Value,
} from '@/lib/theme/schema'
import { CORNERS, parseCustomColor, themeShades, themeVariables, type ThemeSettings } from '@/lib/theme/settings'
import { COLORS, FONTS, PALETTES } from '@/lib/storefront/rules'
import { imageVariant, videoPoster } from '@/lib/media/urls'
import { inputCls, primaryBtn } from '@/components/admin/ui'
import { RenderSections, type SectionData } from '@/components/sections/registry'
import MediaPicker from '@/components/admin/MediaPicker'
import FocalPicker from '@/components/admin/FocalPicker'

type Pages = Record<TemplateType, Template>
type PickMedia = (kind: 'image' | 'video', done: (url: string) => void) => void
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`
const move = <T,>(list: T[], from: number, to: number): T[] => { if (to < 0 || to >= list.length || from === to) return list; const next = [...list]; next.splice(to, 0, next.splice(from, 1)[0]); return next }
const small = 'rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40'
const ghost = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50'
/** The width the live preview is drawn at before it is shrunk to fit: a normal laptop screen. */
const PREVIEW_WIDTH = 1280

/**
 * One setting, drawn from its description in the section library (lib/theme/schema.ts). A new kind of section
 * needs no new code here: the editor reads the description and draws the right control for each field.
 */
function SettingField({ f, all, onChange, collections, pick }: { f: FieldDef; all: Settings; onChange: (key: string, v: Value) => void; collections: { handle: string; title: string }[]; pick: PickMedia }) {
  const value = all[f.key], text = typeof value === 'string' ? value : '', set = (v: Value) => onChange(f.key, v)
  const hint = f.hint ? <span className="mt-1 block text-xs text-slate-500">{f.hint}</span> : null
  if (f.kind === 'check') {
    return <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked)} className="mt-0.5 h-4 w-4" /><span>{f.label}{f.hint && <span className="block text-xs text-slate-500">{f.hint}</span>}</span></label>
  }
  if (f.kind === 'focal') {
    const src = String(all[f.of] ?? '')
    return src ? <FocalPicker src={src} value={text} onChange={set} label={f.label} /> : null // nothing to point at until there is a picture
  }
  if (f.kind === 'image' || f.kind === 'video') {
    const thumb = text ? (f.kind === 'video' ? videoPoster(text, 240) : imageVariant(text, 240)) : null
    return (
      <div className="text-sm">
        <span className="font-medium">{f.label}</span>
        <div className="mt-1 flex items-center gap-3">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-300 bg-slate-100 text-[10px] text-slate-500">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : text ? 'Video' : 'None'}
          </span>
          <button type="button" className={ghost} onClick={() => pick(f.kind as 'image' | 'video', set)}>{text ? 'Change' : f.kind === 'video' ? 'Choose video' : 'Choose picture'}</button>
          {text && <button type="button" className="text-xs text-red-700 underline" onClick={() => set('')}>Remove</button>}
        </div>
        {hint}
      </div>
    )
  }
  if (f.kind === 'select' && f.key === 'layout') {
    // The layout (variant) of a section: shown as buttons because it is the choice that changes the section most.
    return (
      <fieldset className="text-sm">
        <legend className="font-medium">{f.label}</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">{f.options.map((o) => <button key={o.value} type="button" aria-pressed={text === o.value} onClick={() => set(o.value)} className={`rounded-full border px-3 py-1 text-xs font-medium ${text === o.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}>{o.label}</button>)}</div>
        {hint}
      </fieldset>
    )
  }
  const id = `f-${f.key}`
  return (
    <label className="block text-sm" htmlFor={id}>
      <span className="font-medium">{f.label}</span>
      {f.kind === 'textarea' ? <textarea id={id} value={text} onChange={(e) => set(e.target.value)} maxLength={f.max} rows={5} className={`${inputCls} mt-1 leading-relaxed`} />
        : f.kind === 'select' ? <select id={id} value={text} onChange={(e) => set(e.target.value)} className={`${inputCls} mt-1`}>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : f.kind === 'ratio' ? <select id={id} value={text in RATIOS ? text : f.default} onChange={(e) => set(e.target.value)} className={`${inputCls} mt-1`}>{Object.entries(RATIOS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select>
        : f.kind === 'collection' ? <select id={id} value={text} onChange={(e) => set(e.target.value)} className={`${inputCls} mt-1`}><option value="">Choose a collection</option>{collections.map((c) => <option key={c.handle} value={c.handle}>{c.title}</option>)}</select>
        : <input id={id} value={text} onChange={(e) => set(e.target.value)} maxLength={f.kind === 'text' ? f.max : 500} placeholder={f.kind === 'link' ? '/shop or https://' : undefined} className={`${inputCls} mt-1`} />}
      {hint}
      {f.kind === 'collection' && collections.length === 0 && <span className="mt-1 block text-xs text-amber-700">You have no collections yet. Make one under Collections.</span>}
    </label>
  )
}

/** The page drawn by the real section components from what is on screen now (not yet saved), shrunk to fit. */
function LivePreview({ sections, data, settings, picked, onPick }: { sections: Section[]; data: SectionData; settings: ThemeSettings; picked: string | null; onPick: (id: string) => void }) {
  const frame = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(0.5)
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const fit = () => setZoom(Math.min(1, el.clientWidth / PREVIEW_WIDTH))
    fit()
    const ro = new ResizeObserver(fit); ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Keep the section being edited in view.
  useEffect(() => { if (picked) frame.current?.querySelector(`[data-section-id="${CSS.escape(picked)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [picked])
  const click = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('a, button')) e.preventDefault() // links and buttons do nothing in the preview
    const id = t.closest<HTMLElement>('[data-section-id]')?.dataset.sectionId
    if (id) onPick(id)
  }
  const visible = sections.some((s) => !s.hidden)
  return (
    <div ref={frame} className="max-h-[78vh] overflow-y-auto overflow-x-hidden rounded-xl border border-slate-300 bg-white" aria-label="Live preview of the page">
      <div onClickCapture={click} onSubmitCapture={(e) => e.preventDefault()} className="cursor-pointer bg-white pb-10 text-gray-900" style={{ ...(themeVariables(settings) as CSSProperties), width: PREVIEW_WIDTH, zoom }}>
        {visible ? <RenderSections sections={sections} data={data} mark={picked} /> : <p className="p-24 text-center text-2xl text-slate-400">This page has no sections yet. Add one on the left.</p>}
      </div>
    </div>
  )
}

/**
 * THE THEME EDITOR, laid out like Shopify's: the page's sections on the left (drag to reorder, hide, add), a live
 * preview in the middle (click a section to edit it), and the chosen section's settings on the right.
 * Nothing reaches the shop until Save; the server checks everything again before storing it.
 */
export default function ThemeEditor({ theme, collections, data, sizes }: {
  theme: { id: string; name: string; isActive: boolean; settings: ThemeSettings; pages: Pages }
  collections: { handle: string; title: string }[]
  /** The store's real products, categories and reviews, so the preview shows the real thing. */
  data: SectionData
  /** Known file sizes (address -> bytes) for the "heavy top of page" warning. */
  sizes: Record<string, number>
}) {
  const router = useRouter()
  const [name, setName] = useState(theme.name)
  const [settings, setSettings] = useState<ThemeSettings>(theme.settings)
  const [pages, setPages] = useState<Pages>(theme.pages)
  const [tab, setTab] = useState<TemplateType>('home')
  const [picked, setPicked] = useState<string | null>(theme.pages.home.sections[0]?.id ?? null)
  const [adding, setAdding] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [note, setNote] = useState<{ bad: boolean; text: string } | null>(null)
  const [bytes, setBytes] = useState(sizes)
  const [picker, setPicker] = useState<{ kind: 'image' | 'video'; done: (url: string) => void } | null>(null)
  const [saving, startSave] = useTransition()

  const sections = pages[tab].sections
  const touch = () => { setDirty(true); setNote(null) }
  const change = (fn: (all: Section[]) => Section[]) => { setPages((p) => ({ ...p, [tab]: { sections: fn(p[tab].sections) } })); touch() }
  const look = (p: Partial<ThemeSettings>) => { setSettings((s) => ({ ...s, ...p })); touch() }
  const current = sections.find((s) => s.id === picked) ?? null
  const def = current ? SECTION_BY_TYPE.get(current.type) ?? null : null
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const s of sections) m.set(s.type, (m.get(s.type) ?? 0) + 1); return m }, [sections])
  const warnings = useMemo(() => pageWarnings(pages[tab], bytes), [pages, tab, bytes])
  const patch = (id: string, p: Partial<Section>) => change((all) => all.map((s) => (s.id === id ? { ...s, ...p } : s)))
  const setValue = (id: string, key: string, v: Value) => change((all) => all.map((s) => (s.id === id ? { ...s, settings: { ...s.settings, [key]: v } } : s)))
  const setBlocks = (id: string, fn: (b: Block[]) => Block[]) => change((all) => all.map((s) => (s.id === id ? { ...s, blocks: fn(s.blocks) } : s)))
  const pick: PickMedia = (kind, done) => setPicker({ kind, done })

  const openTab = (t: TemplateType) => { setTab(t); setPicked(pages[t].sections[0]?.id ?? null); setAdding(false) }
  const add = (type: string) => {
    const s = newSection(type, uid(type))
    if (!s) return
    change((all) => [...all, s]); setPicked(s.id); setAdding(false)
  }
  const remove = (id: string) => { change((all) => all.filter((s) => s.id !== id)); if (picked === id) setPicked(null) }
  const dragOver = (overId: string) => { if (!dragId || dragId === overId) return; change((all) => move(all, all.findIndex((s) => s.id === dragId), all.findIndex((s) => s.id === overId))) }

  const customProblem = settings.customColor ? (() => { const r = parseCustomColor(settings.customColor); return r.ok ? null : r.error })() : null
  const shades = customProblem ? PALETTES[settings.color] : themeShades(settings)
  const shown: ThemeSettings = customProblem ? { ...settings, customColor: '' } : settings

  const send = async () => {
    const r = await saveThemeAction({ themeId: theme.id, name, settings, pages }).catch(() => ({ error: 'Could not reach the server. Your changes are still on this screen; try again.' }))
    if ('error' in r) { setNote({ bad: true, text: r.error }); return false }
    setNote({ bad: false, text: r.ok }); setDirty(false)
    return true
  }
  const save = () => startSave(async () => { if (await send()) router.refresh() })
  const publish = () => {
    if (!window.confirm(`Make “${name}” your live theme? Customers will see it within 15 seconds.`)) return
    startSave(async () => {
      if (dirty && !(await send())) return
      const fd = new FormData(); fd.set('themeId', theme.id)
      const r: { ok?: string; error?: string } | null = await publishThemeAction(null, fd).catch(() => ({ error: 'Could not reach the server. Please try again.' }))
      setNote(r?.error ? { bad: true, text: r.error } : { bad: false, text: r?.ok ?? 'Published.' })
      router.refresh()
    })
  }
  const addGroup = (title: string, list: SectionDef[]) => (
    <>
      <li className="bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</li>
      {list.map((d) => {
        const full = (counts.get(d.type) ?? 0) >= d.max
        return (
          <li key={d.type}>
            <button type="button" disabled={full} onClick={() => add(d.type)} className="block w-full px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50">
              <span className="block text-sm font-medium">{d.name}{full && <span className="ml-2 text-xs font-normal text-slate-500">{d.max === 1 ? 'already on the page' : `at most ${d.max} per page`}</span>}</span>
              <span className="block text-xs text-slate-500">{d.description}</span>
            </button>
          </li>
        )
      })}
    </>
  )

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1.2fr_1fr_0.8fr]">
          <label className="text-xs text-slate-500">Theme name<input value={name} onChange={(e) => { setName(e.target.value); touch() }} maxLength={50} className={`${inputCls} mt-1`} /></label>
          <label className="text-xs text-slate-500">Colour<select value={settings.color} onChange={(e) => look({ color: e.target.value as ThemeSettings['color'], customColor: '' })} className={`${inputCls} mt-1`}>{COLORS.map((k) => <option key={k} value={k}>{PALETTES[k].name}</option>)}</select></label>
          <label className="text-xs text-slate-500">Or your own brand colour
            <span className="mt-1 flex gap-2">
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(settings.customColor) ? settings.customColor : shades.c700} onChange={(e) => look({ customColor: e.target.value })} className="h-10 w-12 shrink-0 rounded border border-slate-300 bg-white p-1" aria-label="Pick your brand colour" />
              <input value={settings.customColor} onChange={(e) => look({ customColor: e.target.value })} placeholder="#1a7f5a" maxLength={7} className={`${inputCls} font-mono`} aria-label="Brand colour code" />
            </span>
          </label>
          <label className="text-xs text-slate-500">Headings<select value={settings.font} onChange={(e) => look({ font: e.target.value as ThemeSettings['font'] })} className={`${inputCls} mt-1`}>{FONTS.map((f) => <option key={f} value={f}>{f === 'serif' ? 'Classic (serif)' : 'Modern (sans-serif)'}</option>)}</select></label>
          <label className="text-xs text-slate-500">Corners<select value={settings.corners} onChange={(e) => look({ corners: e.target.value as ThemeSettings['corners'] })} className={`${inputCls} mt-1`}>{Object.entries(CORNERS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <button type="button" onClick={save} disabled={saving || !!customProblem || (!dirty && !note?.bad)} className={primaryBtn}>{saving ? 'Working…' : dirty ? (theme.isActive ? 'Save (updates your shop)' : 'Save draft') : 'Saved'}</button>
          {!theme.isActive && <button type="button" onClick={publish} disabled={saving || !!customProblem} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">Publish</button>}
          <a href={`/admin/preview?path=${tab === 'about' ? '/about' : '/'}&theme=${theme.id}`} target="_blank" rel="noopener" className={`${ghost} inline-flex items-center gap-1`} title="Opens the saved version as a customer would see it, on a real page"><Eye className="h-4 w-4" aria-hidden /> Preview{dirty ? ' (saved version)' : ''}</a>
          <span className="flex items-center gap-1" aria-hidden>{[shades.c50, shades.c100, shades.c200, shades.c600, shades.c700, shades.c800].map((c) => <span key={c} className="h-5 w-5 rounded border border-slate-200" style={{ background: c }} />)}</span>
          {customProblem ? <span className="text-red-700" role="alert">{customProblem}</span> : settings.customColor ? <button type="button" className="underline" onClick={() => look({ customColor: '' })}>Use a ready colour instead</button> : null}
          {dirty && <span className="text-amber-700">You have changes that are not saved.</span>}
          {note && <span role={note.bad ? 'alert' : 'status'} className={note.bad ? 'text-red-700' : 'text-emerald-700'}>{note.text}</span>}
        </div>
      </div>

      <nav aria-label="Page to edit" className="flex gap-2">
        {TEMPLATE_TYPES.map((t) => <button key={t} type="button" onClick={() => openTab(t)} aria-pressed={tab === t} className={`rounded-full px-4 py-1.5 text-sm font-medium ${tab === t ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{TEMPLATE_LABEL[t]}</button>)}
      </nav>

      <div className="grid items-start gap-4 xl:grid-cols-[17rem_minmax(0,1fr)_22rem]">
        <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label={`Sections on the ${TEMPLATE_LABEL[tab].toLowerCase()}`}>
          <h2 className="font-semibold">{TEMPLATE_LABEL[tab]}</h2>
          <p className="mb-3 text-xs text-slate-500">Sections appear in this order. Drag to move, or use the arrows.</p>
          {sections.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No sections yet. Add your first one below.</p>}
          <ol className="space-y-2">
            {sections.map((s, i) => (
              <li key={s.id} draggable onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = 'move' }} onDragOver={(e) => { e.preventDefault(); dragOver(s.id) }} onDragEnd={() => setDragId(null)} onDrop={(e) => { e.preventDefault(); setDragId(null) }}
                className={`rounded-lg border p-2 ${picked === s.id ? 'border-blue-600 bg-blue-50' : 'border-slate-200'} ${dragId === s.id ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-1">
                  <span className="cursor-grab select-none px-1 text-slate-400" aria-hidden title="Drag to move">⋮⋮</span>
                  <button type="button" onClick={() => setPicked(s.id)} className={`min-w-0 flex-1 truncate text-left text-sm ${s.hidden ? 'text-slate-400 line-through' : 'font-medium'}`} aria-current={picked === s.id}>{warnings.some((w) => w.sectionId === s.id) && <span className="mr-1 text-amber-600" title="This section has a tip">⚠</span>}{sectionSummary(s)}</button>
                </div>
                <div className="mt-1.5 flex gap-1 pl-6">
                  <button type="button" className={small} onClick={() => change((all) => move(all, i, i - 1))} disabled={i === 0} aria-label={`Move ${sectionSummary(s)} up`}>↑</button>
                  <button type="button" className={small} onClick={() => change((all) => move(all, i, i + 1))} disabled={i === sections.length - 1} aria-label={`Move ${sectionSummary(s)} down`}>↓</button>
                  <button type="button" className={small} onClick={() => patch(s.id, { hidden: !s.hidden })} aria-pressed={s.hidden}>{s.hidden ? 'Show' : 'Hide'}</button>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-3">
            {sections.length < MAX_SECTIONS && <button type="button" onClick={() => setAdding(!adding)} className="w-full rounded-lg border border-dashed border-slate-400 px-3 py-2 text-sm font-medium hover:bg-slate-50" aria-expanded={adding}>{adding ? 'Close' : '+ Add section'}</button>}
            {adding && <ul className="mt-2 max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">{addGroup('Sections', CORE_SECTIONS)}{addGroup('Classic sections', SECTIONS.filter((d) => d.classic))}</ul>}
          </div>
        </section>

        <div className="min-w-0 space-y-2">
          <LivePreview sections={sections} data={data} settings={shown} picked={picked} onPick={setPicked} />
          <p className="text-xs text-slate-500">This is how the page looks on a computer with what is on your screen now, saved or not. Click a section to edit it. For phones and a final check, save and press Preview.</p>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4 xl:max-h-[78vh] xl:overflow-y-auto" aria-label="Section settings">
          {warnings.length > 0 && (
            <ul className="mb-4 space-y-2" aria-label="Tips to keep this page fast">
              {warnings.map((w, i) => <li key={i} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{w.text}{w.sectionId && w.sectionId !== picked && <> <button type="button" className="underline" onClick={() => setPicked(w.sectionId)}>Open it</button></>}</li>)}
            </ul>
          )}
          {!current || !def ? <p className="text-sm text-slate-500">Choose a section in the list or click one in the preview to change it, or add a new one.</p> : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="font-semibold">{def.name}</h2><p className="text-xs text-slate-500">{def.description}</p></div>
                <button type="button" onClick={() => { if (window.confirm(`Remove “${def.name}” from the page?`)) remove(current.id) }} className="shrink-0 text-xs text-red-700 underline">Remove section</button>
              </div>
              {current.hidden && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">This section is hidden: customers do not see it. Press Show in the list to bring it back.</p>}
              {def.fields.map((f) => <SettingField key={`${current.id}-${f.key}`} f={f} all={current.settings} onChange={(k, v) => setValue(current.id, k, v)} collections={collections} pick={pick} />)}
              {def.fields.length === 0 && !def.blocks && <p className="text-sm text-slate-500">This section has nothing to set up.</p>}

              {def.blocks && (
                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-semibold">{def.blocks.plural} <span className="font-normal text-slate-500">({current.blocks.length} of {def.blocks.max})</span></h3>
                  <ol className="mt-2 space-y-3">
                    {current.blocks.map((b, i) => (
                      <li key={b.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-600">{def.blocks!.name} {i + 1}</span>
                          <span className="flex gap-1">
                            <button type="button" className={small} onClick={() => setBlocks(current.id, (all) => move(all, i, i - 1))} disabled={i === 0} aria-label="Move up">↑</button>
                            <button type="button" className={small} onClick={() => setBlocks(current.id, (all) => move(all, i, i + 1))} disabled={i === current.blocks.length - 1} aria-label="Move down">↓</button>
                            <button type="button" className={`${small} text-red-700`} onClick={() => setBlocks(current.id, (all) => all.filter((x) => x.id !== b.id))}>Remove</button>
                          </span>
                        </div>
                        <div className="space-y-3">
                          {def.blocks!.fields.map((f) => <SettingField key={`${b.id}-${f.key}`} f={f} all={b.settings} collections={collections} pick={pick} onChange={(k, v) => setBlocks(current.id, (all) => all.map((x) => (x.id === b.id ? { ...x, settings: { ...x.settings, [k]: v } } : x)))} />)}
                        </div>
                      </li>
                    ))}
                  </ol>
                  {current.blocks.length < def.blocks.max
                    ? <button type="button" onClick={() => setBlocks(current.id, (all) => [...all, newBlock(def.blocks!, uid('b'))])} className="mt-3 rounded-lg border border-dashed border-slate-400 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">+ Add {def.blocks.name.toLowerCase()}</button>
                    : <p className="mt-3 text-xs text-slate-500">That is the most this section holds ({def.blocks.max}). The limit keeps your shop fast on mobile data.</p>}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {picker && <MediaPicker kind={picker.kind} onClose={() => setPicker(null)} onPick={(url, size) => { if (size) setBytes((b) => ({ ...b, [url]: size })); picker.done(url); setPicker(null) }} />}
    </div>
  )
}
