'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { applyPart, safeUrl, type Part } from '@/lib/storefront/rules'
import { loadStorefrontForEdit, saveStorefront } from '@/lib/storefront/data'
import { ThemeError, createTheme, deleteTheme, publishTheme, saveHomeTemplate, saveThemeSettings } from '@/lib/theme/data'
import { parseCustomColor, parseThemeName, readThemeSettings } from '@/lib/theme/settings'
import { THEME_PRESETS, type ThemePresetKey } from '@/lib/theme/presets'
import type { ActionState } from '@/components/admin/ActionForm'

const PATHS = ['/admin/storefront', '/', '/shop', '/about', '/contact']
const refresh = () => PATHS.forEach((p) => revalidatePath(p))
const fail = (what: string, e: unknown): { error: string } => {
  if (e instanceof ThemeError) return { error: e.message }
  console.error(`[theme ${what}]`, e)
  return { error: 'Something went wrong. Nothing was changed; please try again.' }
}
async function storeName(storeId: string) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { name: true, settings: { select: { displayName: true } } } })
  return store?.settings?.displayName ?? store?.name ?? 'Our store'
}

// ------------------------------------------------------------------ the theme editor
/**
 * "Save" in the editor: the theme's name, its colours and font, and the whole home page (sections, their settings
 * and blocks) in one go. Everything the browser sent is checked again here against the section library; the first
 * problem is returned in plain words and nothing is saved.
 */
export async function saveThemeAction(input: { themeId: string; name: string; settings: unknown; template: unknown }): Promise<{ ok: string; live: boolean } | { error: string }> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  const name = parseThemeName(String(input?.name ?? '')); if (!name.ok) return { error: name.error }
  const s = (input?.settings && typeof input.settings === 'object' ? input.settings : {}) as Record<string, unknown>
  const custom = parseCustomColor(String(s.customColor ?? '')); if (!custom.ok) return { error: custom.error }
  try {
    const themeId = String(input?.themeId ?? '')
    const saved = await saveHomeTemplate(g.admin.storeId, themeId, input?.template)
    await saveThemeSettings(g.admin.storeId, themeId, readThemeSettings({ ...s, customColor: custom.value }), name.value)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'theme.save', entity: 'Theme', entityId: themeId, after: { name: name.value, sections: saved.sections, live: saved.isActive } })
    refresh()
    return { ok: saved.isActive ? 'Saved. Your shop shows the changes within 15 seconds.' : 'Draft saved. Customers still see your live theme until you publish this one.', live: saved.isActive }
  } catch (e) { return fail('save', e) }
}

/** A new draft theme from a ready-made design, or a copy of one of your own. Opens it in the editor. */
export async function createThemeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  const from = String(fd.get('from') ?? '')
  const copyOf = from.startsWith('copy:') ? from.slice(5) : null
  if (!copyOf && !(from in THEME_PRESETS)) return { error: 'Choose a design to start from.' }
  const name = parseThemeName(String(fd.get('name') ?? '') || (copyOf ? 'Copy of my theme' : THEME_PRESETS[from as ThemePresetKey].name)); if (!name.ok) return { error: name.error }
  let id: string
  try {
    const shop = await storeName(g.admin.storeId)
    const { content } = await loadStorefrontForEdit(g.admin.storeId, shop)
    id = await createTheme(g.admin.storeId, shop, name.value, copyOf ? { copyOf } : { preset: from as ThemePresetKey }, content)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'theme.create', entity: 'Theme', entityId: id, after: { name: name.value, from } })
    revalidatePath('/admin/storefront')
  } catch (e) { return fail('create', e) }
  redirect(`/admin/storefront?theme=${id}`)
}

export async function publishThemeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  try {
    const themeId = String(fd.get('themeId') ?? '')
    const name = await publishTheme(g.admin.storeId, themeId)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'theme.publish', entity: 'Theme', entityId: themeId, after: { name } })
    refresh()
    return { ok: `“${name}” is now your live theme. Customers see it within 15 seconds.` }
  } catch (e) { return fail('publish', e) }
}

export async function deleteThemeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('settings.edit'); if ('error' in g) return g
  try {
    const themeId = String(fd.get('themeId') ?? '')
    const name = await deleteTheme(g.admin.storeId, themeId)
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'theme.delete', entity: 'Theme', entityId: themeId, after: { name } })
    revalidatePath('/admin/storefront')
  } catch (e) { return fail('delete', e) }
  redirect('/admin/storefront')
}

// ------------------------------------------------------------------ pages, header and footer (not part of a theme)
async function savePart(part: Part, fd: FormData, ok: string): Promise<ActionState> {
  const g = await adminOrError('settings.edit')
  if ('error' in g) return g
  try {
    const { storeId } = g.admin
    const { content } = await loadStorefrontForEdit(storeId, await storeName(storeId))
    const parsed = applyPart(part, fd, content)
    if (!parsed.ok) return { error: parsed.error }
    let branding: { logoUrl: string | null; faviconUrl: string | null; seoTitle: string | null; seoDescription: string | null } | undefined
    if (part === 'look') { // logo, icon and search-engine text live with the other branding in settings
      const logo = safeUrl(String(fd.get('logoUrl') ?? ''), false), icon = safeUrl(String(fd.get('faviconUrl') ?? ''), false)
      if (logo === null) return { error: 'The logo address must start with https:// (an image link).' }
      if (icon === null) return { error: 'The tab icon address must start with https:// (an image link).' }
      const title = String(fd.get('seoTitle') ?? '').trim(), desc = String(fd.get('seoDescription') ?? '').trim()
      if (title.length > 70 || desc.length > 160 || /[<>]/.test(title + desc)) return { error: 'The search-engine title (up to 70) and description (up to 160) must not contain < or >.' }
      branding = { logoUrl: logo || null, faviconUrl: icon || null, seoTitle: title || null, seoDescription: desc || null }
    }
    await saveStorefront(storeId, parsed.value)
    if (branding) await db.storeSettings.updateMany({ where: { storeId }, data: branding })
    await audit({ storeId, userId: g.admin.id, action: `storefront.${part}`, entity: 'Storefront', entityId: storeId, after: { part } })
    refresh()
    return { ok }
  } catch (e) {
    console.error(`[storefront ${part}]`, e)
    return { error: 'Could not save. Nothing was changed; please try again.' }
  }
}

export async function saveLookAction(_: ActionState, fd: FormData): Promise<ActionState> { return savePart('look', fd, 'Header and footer saved. Your shop shows it within 15 seconds.') }
export async function savePagesAction(_: ActionState, fd: FormData): Promise<ActionState> { return savePart('pages', fd, 'About, Contact and policy pages saved.') }
