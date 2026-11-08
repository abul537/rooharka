'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { applyPart, safeUrl, type Part } from '@/lib/storefront/rules'
import { PRESETS, presetContent, type PresetKey } from '@/lib/storefront/presets'
import { loadStorefrontForEdit, saveStorefront } from '@/lib/storefront/data'
import type { ActionState } from '@/components/admin/ActionForm'

const PATHS = ['/admin/storefront', '/', '/shop', '/about', '/contact']

async function savePart(part: Part, fd: FormData, ok: string): Promise<ActionState> {
  const g = await adminOrError('settings.edit')
  if ('error' in g) return g
  try {
    const { storeId } = g.admin
    const store = await db.store.findUnique({ where: { id: storeId }, select: { name: true, settings: { select: { displayName: true } } } })
    const name = store?.settings?.displayName ?? store?.name ?? ''
    const { content } = await loadStorefrontForEdit(storeId, name)
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
    for (const p of PATHS) revalidatePath(p)
    return { ok }
  } catch (e) {
    console.error(`[storefront ${part}]`, e)
    return { error: 'Could not save. Nothing was changed; please try again.' }
  }
}

export async function saveLookAction(_: ActionState, fd: FormData): Promise<ActionState> { return savePart('look', fd, 'Look and feel saved. Your shop shows it within 15 seconds.') }
export async function saveHomeAction(_: ActionState, fd: FormData): Promise<ActionState> { return savePart('home', fd, 'Home page saved. Your shop shows it within 15 seconds.') }
export async function savePagesAction(_: ActionState, fd: FormData): Promise<ActionState> { return savePart('pages', fd, 'About, Contact and policy pages saved.') }
export async function saveFaqAction(_: ActionState, fd: FormData): Promise<ActionState> { return savePart('faq', fd, 'Questions saved.') }

/** Replaces ALL the content with a starting point (the owner then edits it). Asks for confirmation in the form. */
export async function loadPresetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await adminOrError('settings.edit')
  if ('error' in g) return g
  const key = String(fd.get('preset') ?? '') as PresetKey
  if (!(key in PRESETS)) return { error: 'Choose a starting point.' }
  try {
    const store = await db.store.findUnique({ where: { id: g.admin.storeId }, select: { name: true, settings: { select: { displayName: true } } } })
    await saveStorefront(g.admin.storeId, presetContent(key, store?.settings?.displayName ?? store?.name ?? 'Our store'))
    await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'storefront.preset', entity: 'Storefront', entityId: g.admin.storeId, after: { preset: key } })
    for (const p of PATHS) revalidatePath(p)
    return { ok: `${PRESETS[key]} loaded. Change any wording below.` }
  } catch (e) {
    console.error('[storefront preset]', e)
    return { error: 'Could not load it. Nothing was changed.' }
  }
}
