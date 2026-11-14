/**
 * Reading and writing themes. Every statement names the store, so one store can never read or change another's theme.
 */
import { db } from '@/lib/db'
import { memoKeyed } from '@/lib/memo'
import type { StorefrontContent } from '@/lib/storefront/rules'
import { TEMPLATE_TYPES, VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS, legacyTemplate, parseTemplate, readTemplate, templateVideos, type Template, type TemplateType } from '@/lib/theme/schema'
import { MAX_THEMES, readThemeSettings, type ThemeSettings } from '@/lib/theme/settings'
import { themePreset, type ThemePresetKey } from '@/lib/theme/presets'

/** An error whose message is safe to show to the owner. */
export class ThemeError extends Error {}
type Json = import('@/lib/generated/prisma/client').Prisma.InputJsonValue
const json = (v: unknown) => v as Json
const legacySettings = (c: StorefrontContent): ThemeSettings => ({ color: c.color, customColor: '', font: c.font, corners: 'soft' })

export type Pages = Record<TemplateType, Template>
/** `pages` always holds every kind of page: one the theme has not saved yet comes from the store's old settings. */
export interface LiveTheme { id: string | null; settings: ThemeSettings; pages: Pages }
const legacyPages = (legacy: StorefrontContent, storeName: string) => Object.fromEntries(TEMPLATE_TYPES.map((t) => [t, legacyTemplate(t, legacy, storeName)])) as Pages

const pick = (t: { id: string; settings: unknown; templates: { type: string; sections: unknown }[] }, legacy: StorefrontContent, storeName: string): LiveTheme => {
  const pages = legacyPages(legacy, storeName)
  for (const row of t.templates) if ((TEMPLATE_TYPES as readonly string[]).includes(row.type)) pages[row.type as TemplateType] = readTemplate({ sections: row.sections })
  return { id: t.id, settings: readThemeSettings(t.settings, legacySettings(legacy)), pages }
}
const WITH_PAGES = { id: true, settings: true, templates: { select: { type: true, sections: true } } } as const

/** The store's live theme row (or null), remembered for 15 seconds: the shop asks for it on every page. */
const loadLive = memoKeyed(15_000, (storeId: string) => db.shopTheme.findFirst({ where: { storeId, isActive: true }, select: WITH_PAGES }))

/**
 * What the shop draws. A store that has not saved a theme yet gets one built from its old Storefront settings
 * (same look as before), without anything being written.
 */
export async function getLiveTheme(storeId: string, legacy: StorefrontContent, storeName: string): Promise<LiveTheme> {
  const t = await loadLive(storeId)
  return t ? pick(t, legacy, storeName) : { id: null, settings: legacySettings(legacy), pages: legacyPages(legacy, storeName) }
}
/** A specific theme of THIS store, fresh from the database (used for the owner's preview of a draft). */
export async function getThemeById(storeId: string, themeId: string, legacy: StorefrontContent, storeName: string): Promise<LiveTheme | null> {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(themeId)) return null
  const t = await db.shopTheme.findFirst({ where: { id: themeId, storeId }, select: WITH_PAGES })
  return t ? pick(t, legacy, storeName) : null
}

// ------------------------------------------------------------------ dashboard
export const listThemes = (storeId: string) => db.shopTheme.findMany({ where: { storeId }, orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }], select: { id: true, name: true, isActive: true, updatedAt: true } })

/**
 * Makes sure the store has a theme to edit. The first time, its current home page (from the old Storefront
 * settings) is saved as a live theme called "My theme", so the editor opens on exactly what customers see.
 * Safe when two staff open the editor at once: the store row is locked while we look and create.
 */
export async function ensureTheme(storeId: string, legacy: StorefrontContent, storeName: string): Promise<void> {
  if (await db.shopTheme.count({ where: { storeId } })) return
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`
    if (await tx.shopTheme.count({ where: { storeId } })) return
    await tx.shopTheme.create({ data: { storeId, name: 'My theme', isActive: true, settings: json(legacySettings(legacy)), templates: { create: TEMPLATE_TYPES.map((type) => ({ type, sections: json(legacyTemplate(type, legacy, storeName).sections) })) } } })
  })
}

export async function getThemeForEdit(storeId: string, themeId: string, legacy: StorefrontContent, storeName: string) {
  const t = await db.shopTheme.findFirst({ where: { id: themeId, storeId }, select: { ...WITH_PAGES, name: true, isActive: true, updatedAt: true } })
  return t ? { ...pick(t, legacy, storeName), id: t.id, name: t.name, isActive: t.isActive, updatedAt: t.updatedAt } : null
}

async function owned(storeId: string, themeId: string) {
  const t = await db.shopTheme.findFirst({ where: { id: themeId, storeId }, select: { id: true, name: true, isActive: true } })
  if (!t) throw new ThemeError('Theme not found. Reload the page.')
  return t
}

/**
 * Saves the pages of a theme (Home, About) together: either all are stored or none. Each template is checked
 * again here against the section library, whatever the editor sent.
 */
export async function saveTemplates(storeId: string, themeId: string, raw: Partial<Record<TemplateType, unknown>>): Promise<{ name: string; isActive: boolean; sections: number }> {
  const pages: [TemplateType, Template][] = []
  for (const type of TEMPLATE_TYPES) {
    if (raw[type] === undefined) continue
    const parsed = parseTemplate(raw[type])
    if (!parsed.ok) throw new ThemeError(parsed.error)
    pages.push([type, parsed.value])
  }
  const t = await owned(storeId, themeId)
  // Videos are the heaviest thing a page can carry, so only ones this store uploaded AND that passed the length and
  // size check may be saved in a section. An address typed by hand cannot get round the limit.
  const videos = [...new Set(pages.flatMap(([, tpl]) => templateVideos(tpl)))]
  if (videos.length > 0) {
    const passed = await db.mediaAsset.findMany({ where: { storeId, kind: 'VIDEO', url: { in: videos }, durationSec: { not: null, lte: VIDEO_MAX_SECONDS }, sizeBytes: { not: null, lte: VIDEO_MAX_BYTES } }, select: { url: true } })
    const ok = new Set(passed.map((m) => m.url))
    if (videos.some((u) => !ok.has(u))) throw new ThemeError(`A video on this page has not passed the check. Choose videos with the “Choose video” button: at most ${VIDEO_MAX_SECONDS} seconds and ${VIDEO_MAX_BYTES / 1024 / 1024} MB each.`)
  }
  await db.$transaction([
    ...pages.map(([type, tpl]) => db.shopThemeTemplate.upsert({ where: { themeId_type: { themeId: t.id, type } }, create: { themeId: t.id, type, sections: json(tpl.sections) }, update: { sections: json(tpl.sections) } })),
    db.shopTheme.update({ where: { id: t.id }, data: { updatedAt: new Date() } }),
  ])
  return { name: t.name, isActive: t.isActive, sections: pages.reduce((n, [, tpl]) => n + tpl.sections.length, 0) }
}

export async function saveThemeSettings(storeId: string, themeId: string, settings: ThemeSettings, name: string) {
  const t = await owned(storeId, themeId)
  await db.shopTheme.update({ where: { id: t.id }, data: { settings: json(settings), name } })
  return t
}

/** A new DRAFT theme: from a ready-made design, or a copy of one of the store's own themes. */
export async function createTheme(storeId: string, storeName: string, name: string, from: { preset: ThemePresetKey } | { copyOf: string }, legacy: StorefrontContent): Promise<string> {
  if ((await db.shopTheme.count({ where: { storeId } })) >= MAX_THEMES) throw new ThemeError(`You can keep up to ${MAX_THEMES} themes. Delete one you no longer need first.`)
  let settings: ThemeSettings, pages: Pages
  if ('preset' in from) { const p = themePreset(from.preset, storeName); settings = p.settings; pages = { home: p.home, about: p.about } }
  else {
    const src = await getThemeById(storeId, from.copyOf, legacy, storeName)
    if (!src) throw new ThemeError('The theme to copy was not found. Reload the page.')
    ;({ settings, pages } = src)
  }
  const t = await db.shopTheme.create({ data: { storeId, name, isActive: false, settings: json(settings), templates: { create: TEMPLATE_TYPES.map((type) => ({ type, sections: json(pages[type].sections) })) } }, select: { id: true } })
  return t.id
}

/** Makes a theme the live one. Done in one step, so the shop is never without a live theme and never has two. */
export async function publishTheme(storeId: string, themeId: string): Promise<string> {
  const t = await owned(storeId, themeId)
  await db.$transaction([
    db.shopTheme.updateMany({ where: { storeId, isActive: true, id: { not: t.id } }, data: { isActive: false } }),
    db.shopTheme.update({ where: { id: t.id }, data: { isActive: true } }),
  ])
  return t.name
}

export async function deleteTheme(storeId: string, themeId: string): Promise<string> {
  const t = await owned(storeId, themeId)
  if (t.isActive) throw new ThemeError('This theme is live. Publish another theme first, then delete this one.')
  await db.shopTheme.delete({ where: { id: t.id } })
  return t.name
}
