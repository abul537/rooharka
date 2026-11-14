/**
 * Reading and writing themes. Every statement names the store, so one store can never read or change another's theme.
 */
import { db } from '@/lib/db'
import { memoKeyed } from '@/lib/memo'
import type { StorefrontContent } from '@/lib/storefront/rules'
import { parseTemplate, readTemplate, templateFromLegacy, type Template } from '@/lib/theme/schema'
import { MAX_THEMES, readThemeSettings, type ThemeSettings } from '@/lib/theme/settings'
import { themePreset, type ThemePresetKey } from '@/lib/theme/presets'

/** An error whose message is safe to show to the owner. */
export class ThemeError extends Error {}
type Json = import('@/lib/generated/prisma/client').Prisma.InputJsonValue
const json = (v: unknown) => v as Json
const legacySettings = (c: StorefrontContent): ThemeSettings => ({ color: c.color, customColor: '', font: c.font })

export interface LiveTheme { id: string | null; settings: ThemeSettings; home: Template }

const pick = (t: { id: string; settings: unknown; templates: { type: string; sections: unknown }[] }, legacy: StorefrontContent): LiveTheme => {
  const home = t.templates.find((x) => x.type === 'home')
  return { id: t.id, settings: readThemeSettings(t.settings, legacySettings(legacy)), home: home ? readTemplate({ sections: home.sections }) : templateFromLegacy(legacy) }
}
const WITH_HOME = { id: true, settings: true, templates: { where: { type: 'home' }, select: { type: true, sections: true } } } as const

/** The store's live theme row (or null), remembered for 15 seconds: the shop asks for it on every page. */
const loadLive = memoKeyed(15_000, (storeId: string) => db.shopTheme.findFirst({ where: { storeId, isActive: true }, select: WITH_HOME }))

/**
 * What the shop draws. A store that has not saved a theme yet gets one built from its old Storefront settings
 * (same look as before), without anything being written.
 */
export async function getLiveTheme(storeId: string, legacy: StorefrontContent): Promise<LiveTheme> {
  const t = await loadLive(storeId)
  return t ? pick(t, legacy) : { id: null, settings: legacySettings(legacy), home: templateFromLegacy(legacy) }
}
/** A specific theme of THIS store, fresh from the database (used for the owner's preview of a draft). */
export async function getThemeById(storeId: string, themeId: string, legacy: StorefrontContent): Promise<LiveTheme | null> {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(themeId)) return null
  const t = await db.shopTheme.findFirst({ where: { id: themeId, storeId }, select: WITH_HOME })
  return t ? pick(t, legacy) : null
}

// ------------------------------------------------------------------ dashboard
export const listThemes = (storeId: string) => db.shopTheme.findMany({ where: { storeId }, orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }], select: { id: true, name: true, isActive: true, updatedAt: true } })

/**
 * Makes sure the store has a theme to edit. The first time, its current home page (from the old Storefront
 * settings) is saved as a live theme called "My theme", so the editor opens on exactly what customers see.
 * Safe when two staff open the editor at once: the store row is locked while we look and create.
 */
export async function ensureTheme(storeId: string, legacy: StorefrontContent): Promise<void> {
  if (await db.shopTheme.count({ where: { storeId } })) return
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`
    if (await tx.shopTheme.count({ where: { storeId } })) return
    await tx.shopTheme.create({ data: { storeId, name: 'My theme', isActive: true, settings: json(legacySettings(legacy)), templates: { create: { type: 'home', sections: json(templateFromLegacy(legacy).sections) } } } })
  })
}

export async function getThemeForEdit(storeId: string, themeId: string, legacy: StorefrontContent) {
  const t = await db.shopTheme.findFirst({ where: { id: themeId, storeId }, select: { ...WITH_HOME, name: true, isActive: true, updatedAt: true } })
  return t ? { ...pick(t, legacy), id: t.id, name: t.name, isActive: t.isActive, updatedAt: t.updatedAt } : null
}

async function owned(storeId: string, themeId: string) {
  const t = await db.shopTheme.findFirst({ where: { id: themeId, storeId }, select: { id: true, name: true, isActive: true } })
  if (!t) throw new ThemeError('Theme not found. Reload the page.')
  return t
}

/** Saves the home page of a theme. The template is checked again here, whatever the editor sent. */
export async function saveHomeTemplate(storeId: string, themeId: string, raw: unknown): Promise<{ name: string; isActive: boolean; sections: number }> {
  const parsed = parseTemplate(raw)
  if (!parsed.ok) throw new ThemeError(parsed.error)
  const t = await owned(storeId, themeId)
  await db.$transaction([
    db.shopThemeTemplate.upsert({ where: { themeId_type: { themeId: t.id, type: 'home' } }, create: { themeId: t.id, type: 'home', sections: json(parsed.value.sections) }, update: { sections: json(parsed.value.sections) } }),
    db.shopTheme.update({ where: { id: t.id }, data: { updatedAt: new Date() } }),
  ])
  return { name: t.name, isActive: t.isActive, sections: parsed.value.sections.length }
}

export async function saveThemeSettings(storeId: string, themeId: string, settings: ThemeSettings, name: string) {
  const t = await owned(storeId, themeId)
  await db.shopTheme.update({ where: { id: t.id }, data: { settings: json(settings), name } })
  return t
}

/** A new DRAFT theme: from a ready-made design, or a copy of one of the store's own themes. */
export async function createTheme(storeId: string, storeName: string, name: string, from: { preset: ThemePresetKey } | { copyOf: string }, legacy: StorefrontContent): Promise<string> {
  if ((await db.shopTheme.count({ where: { storeId } })) >= MAX_THEMES) throw new ThemeError(`You can keep up to ${MAX_THEMES} themes. Delete one you no longer need first.`)
  let settings: ThemeSettings, home: Template
  if ('preset' in from) ({ settings, home } = themePreset(from.preset, storeName))
  else {
    const src = await getThemeById(storeId, from.copyOf, legacy)
    if (!src) throw new ThemeError('The theme to copy was not found. Reload the page.')
    ;({ settings, home } = src)
  }
  const t = await db.shopTheme.create({ data: { storeId, name, isActive: false, settings: json(settings), templates: { create: { type: 'home', sections: json(home.sections) } } }, select: { id: true } })
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
