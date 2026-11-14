'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveThemeAction } from '@/app/admin/(panel)/storefront/actions'
import { MAX_SECTIONS, SECTIONS, SECTION_BY_TYPE, newBlock, newSection, sectionSummary, type Block, type Field as FieldDef, type Section, type Settings, type Value } from '@/lib/theme/schema'
import { parseCustomColor, themeShades, type ThemeSettings } from '@/lib/theme/settings'
import { COLORS, FONTS, PALETTES } from '@/lib/storefront/rules'
import { inputCls, primaryBtn } from '@/components/admin/ui'

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`
const move = <T,>(list: T[], from: number, to: number): T[] => { if (to < 0 || to >= list.length || from === to) return list; const next = [...list]; next.splice(to, 0, next.splice(from, 1)[0]); return next }
const small = 'rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40'

/** One setting, drawn from its description in the section library. A new kind of section needs no new code here. */
function SettingField({ f, value, onChange, collections }: { f: FieldDef; value: Value | undefined; onChange: (v: Value) => void; collections: { handle: string; title: string }[] }) {
  const id = `f-${f.key}`
  if (f.kind === 'check') {
    return (
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>{f.label}{f.hint && <span className="block text-xs text-slate-500">{f.hint}</span>}</span>
      </label>
    )
  }
  const text = typeof value === 'string' ? value : ''
  return (
    <label className="block text-sm" htmlFor={id}>
      <span className="font-medium">{f.label}</span>
      {f.kind === 'textarea' ? <textarea id={id} value={text} onChange={(e) => onChange(e.target.value)} maxLength={f.max} rows={5} className={`${inputCls} mt-1 leading-relaxed`} />
        : f.kind === 'select' ? <select id={id} value={text} onChange={(e) => onChange(e.target.value)} className={`${inputCls} mt-1`}>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : f.kind === 'collection' ? <select id={id} value={text} onChange={(e) => onChange(e.target.value)} className={`${inputCls} mt-1`}><option value="">Choose a collection</option>{collections.map((c) => <option key={c.handle} value={c.handle}>{c.title}</option>)}</select>
        : <input id={id} value={text} onChange={(e) => onChange(e.target.value)} maxLength={f.kind === 'text' ? f.max : 500} placeholder={f.kind === 'image' ? 'https://' : f.kind === 'link' ? '/shop or https://' : undefined} className={`${inputCls} mt-1`} />}
      {f.hint && <span className="mt-1 block text-xs text-slate-500">{f.hint}</span>}
      {f.kind === 'collection' && collections.length === 0 && <span className="mt-1 block text-xs text-amber-700">You have no collections yet. Make one under Collections.</span>}
    </label>
  )
}

/**
 * THE THEME EDITOR. Left: the page as a list of sections (drag to reorder, or use the arrows; hide; remove; add).
 * Right: the settings of the section you picked, and its blocks. Top: the theme's name, colour and heading font.
 * Nothing reaches the shop until Save; the server checks everything again before storing it.
 */
export default function ThemeEditor({ theme, collections }: {
  theme: { id: string; name: string; isActive: boolean; settings: ThemeSettings; sections: Section[] }
  collections: { handle: string; title: string }[]
}) {
  const router = useRouter()
  const [name, setName] = useState(theme.name)
  const [settings, setSettings] = useState<ThemeSettings>(theme.settings)
  const [sections, setSections] = useState<Section[]>(theme.sections)
  const [picked, setPicked] = useState<string | null>(theme.sections[0]?.id ?? null)
  const [adding, setAdding] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [note, setNote] = useState<{ bad: boolean; text: string } | null>(null)
  const [saving, startSave] = useTransition()

  const change = (fn: (all: Section[]) => Section[]) => { setSections(fn); setDirty(true); setNote(null) }
  const current = sections.find((s) => s.id === picked) ?? null
  const def = current ? SECTION_BY_TYPE.get(current.type) ?? null : null
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const s of sections) m.set(s.type, (m.get(s.type) ?? 0) + 1); return m }, [sections])
  const patch = (id: string, p: Partial<Section>) => change((all) => all.map((s) => (s.id === id ? { ...s, ...p } : s)))
  const setValue = (key: string, v: Value) => current && patch(current.id, { settings: { ...current.settings, [key]: v } as Settings })
  const setBlocks = (fn: (b: Block[]) => Block[]) => current && patch(current.id, { blocks: fn(current.blocks) })

  const add = (type: string) => {
    const s = newSection(type, uid(type))
    if (!s) return
    change((all) => [...all, s]); setPicked(s.id); setAdding(false)
  }
  const remove = (id: string) => { change((all) => all.filter((s) => s.id !== id)); if (picked === id) setPicked(null) }
  const dragOver = (overId: string) => { if (!dragId || dragId === overId) return; change((all) => move(all, all.findIndex((s) => s.id === dragId), all.findIndex((s) => s.id === overId))) }

  const customProblem = settings.customColor ? (() => { const r = parseCustomColor(settings.customColor); return r.ok ? null : r.error })() : null
  const shades = customProblem ? PALETTES[settings.color] : themeShades(settings)

  const save = () => startSave(async () => {
    const r = await saveThemeAction({ themeId: theme.id, name, settings, template: { sections } }).catch(() => ({ error: 'Could not reach the server. Your changes are still on this screen; try again.' }))
    if ('error' in r) { setNote({ bad: true, text: r.error }); return }
    setNote({ bad: false, text: r.ok }); setDirty(false); router.refresh()
  })

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.2fr_1fr_auto] items-end">
          <label className="text-xs text-slate-500">Theme name<input value={name} onChange={(e) => { setName(e.target.value); setDirty(true) }} maxLength={50} className={`${inputCls} mt-1`} /></label>
          <label className="text-xs text-slate-500">Colour<select value={settings.color} onChange={(e) => { setSettings({ ...settings, color: e.target.value as ThemeSettings['color'], customColor: '' }); setDirty(true) }} className={`${inputCls} mt-1`}>{COLORS.map((k) => <option key={k} value={k}>{PALETTES[k].name}</option>)}</select></label>
          <label className="text-xs text-slate-500">Or your own brand colour
            <span className="mt-1 flex gap-2">
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(settings.customColor) ? settings.customColor : shades.c700} onChange={(e) => { setSettings({ ...settings, customColor: e.target.value }); setDirty(true) }} className="h-10 w-12 shrink-0 rounded border border-slate-300 bg-white p-1" aria-label="Pick your brand colour" />
              <input value={settings.customColor} onChange={(e) => { setSettings({ ...settings, customColor: e.target.value }); setDirty(true) }} placeholder="#1a7f5a" maxLength={7} className={`${inputCls} font-mono`} aria-label="Brand colour code" />
            </span>
          </label>
          <label className="text-xs text-slate-500">Headings<select value={settings.font} onChange={(e) => { setSettings({ ...settings, font: e.target.value as ThemeSettings['font'] }); setDirty(true) }} className={`${inputCls} mt-1`}>{FONTS.map((f) => <option key={f} value={f}>{f === 'serif' ? 'Classic (serif)' : 'Modern (sans-serif)'}</option>)}</select></label>
          <button type="button" onClick={save} disabled={saving || !!customProblem || (!dirty && !note?.bad)} className={primaryBtn}>{saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="flex items-center gap-1" aria-hidden>{[shades.c50, shades.c100, shades.c200, shades.c600, shades.c700, shades.c800].map((c) => <span key={c} className="h-5 w-5 rounded border border-slate-200" style={{ background: c }} />)}</span>
          <span className="rounded-lg px-3 py-1 font-semibold text-white" style={{ background: shades.c700 }}>Button</span>
          {customProblem ? <span className="text-red-700" role="alert">{customProblem}</span> : settings.customColor ? <button type="button" className="underline" onClick={() => { setSettings({ ...settings, customColor: '' }); setDirty(true) }}>Use a ready colour instead</button> : null}
          {dirty && <span className="text-amber-700">You have changes that are not saved.</span>}
          {note && <span role={note.bad ? 'alert' : 'status'} className={note.bad ? 'text-red-700' : 'text-emerald-700'}>{note.text}</span>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-start">
        <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Sections on the home page">
          <h2 className="font-semibold">Home page</h2>
          <p className="text-xs text-slate-500 mb-3">Sections appear in your shop in this order. Drag to move, or use the arrows.</p>
          {sections.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No sections yet. Add your first one below.</p>}
          <ol className="space-y-2">
            {sections.map((s, i) => (
              <li key={s.id} draggable onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = 'move' }} onDragOver={(e) => { e.preventDefault(); dragOver(s.id) }} onDragEnd={() => setDragId(null)} onDrop={(e) => { e.preventDefault(); setDragId(null) }}
                className={`flex items-center gap-2 rounded-lg border p-2 ${picked === s.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200'} ${dragId === s.id ? 'opacity-50' : ''}`}>
                <span className="cursor-grab select-none px-1 text-slate-400" aria-hidden title="Drag to move">⋮⋮</span>
                <button type="button" onClick={() => setPicked(s.id)} className={`min-w-0 flex-1 truncate text-left text-sm ${s.hidden ? 'text-slate-400 line-through' : 'font-medium'}`} aria-current={picked === s.id}>{sectionSummary(s)}</button>
                <button type="button" className={small} onClick={() => change((all) => move(all, i, i - 1))} disabled={i === 0} aria-label={`Move ${sectionSummary(s)} up`}>↑</button>
                <button type="button" className={small} onClick={() => change((all) => move(all, i, i + 1))} disabled={i === sections.length - 1} aria-label={`Move ${sectionSummary(s)} down`}>↓</button>
                <button type="button" className={small} onClick={() => patch(s.id, { hidden: !s.hidden })} aria-pressed={s.hidden}>{s.hidden ? 'Show' : 'Hide'}</button>
              </li>
            ))}
          </ol>
          <div className="mt-3">
            {sections.length < MAX_SECTIONS && <button type="button" onClick={() => setAdding(!adding)} className="w-full rounded-lg border border-dashed border-slate-400 px-3 py-2 text-sm font-medium hover:bg-slate-50" aria-expanded={adding}>{adding ? 'Close' : '+ Add section'}</button>}
            {adding && (
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {SECTIONS.map((d) => {
                  const full = (counts.get(d.type) ?? 0) >= d.max
                  return (
                    <li key={d.type}>
                      <button type="button" disabled={full} onClick={() => add(d.type)} className="block w-full px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50">
                        <span className="block text-sm font-medium">{d.name}{full && <span className="ml-2 text-xs font-normal text-slate-500">already on the page</span>}</span>
                        <span className="block text-xs text-slate-500">{d.description}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Section settings">
          {!current || !def ? <p className="text-sm text-slate-500">Choose a section on the left to change it, or add a new one.</p> : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="font-semibold">{def.name}</h2><p className="text-xs text-slate-500">{def.description}</p></div>
                <button type="button" onClick={() => { if (window.confirm(`Remove “${def.name}” from the page?`)) remove(current.id) }} className="shrink-0 text-xs text-red-700 underline">Remove section</button>
              </div>
              {current.hidden && <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">This section is hidden: customers do not see it. Press Show in the list to bring it back.</p>}
              {def.fields.map((f) => <SettingField key={`${current.id}-${f.key}`} f={f} value={current.settings[f.key]} onChange={(v) => setValue(f.key, v)} collections={collections} />)}
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
                            <button type="button" className={small} onClick={() => setBlocks((all) => move(all, i, i - 1))} disabled={i === 0} aria-label="Move up">↑</button>
                            <button type="button" className={small} onClick={() => setBlocks((all) => move(all, i, i + 1))} disabled={i === current.blocks.length - 1} aria-label="Move down">↓</button>
                            <button type="button" className={`${small} text-red-700`} onClick={() => setBlocks((all) => all.filter((x) => x.id !== b.id))}>Remove</button>
                          </span>
                        </div>
                        <div className="space-y-3">
                          {def.blocks!.fields.map((f) => <SettingField key={`${b.id}-${f.key}`} f={f} value={b.settings[f.key]} collections={collections} onChange={(v) => setBlocks((all) => all.map((x) => (x.id === b.id ? { ...x, settings: { ...x.settings, [f.key]: v } } : x)))} />)}
                        </div>
                      </li>
                    ))}
                  </ol>
                  {current.blocks.length < def.blocks.max && <button type="button" onClick={() => setBlocks((all) => [...all, newBlock(def.blocks!, uid('b'))])} className="mt-3 rounded-lg border border-dashed border-slate-400 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">+ Add {def.blocks.name.toLowerCase()}</button>}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
