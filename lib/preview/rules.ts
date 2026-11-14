/**
 * "Preview store": the rules, with no database and no cookies, so every one is unit-tested.
 *
 * Two different signed passes are used, on purpose:
 *  1. the LINK token: made when the owner clicks Preview, valid for one minute, only good for opening a preview;
 *  2. the SESSION pass: kept in a cookie on the shop's address for one hour, only good for seeing drafts.
 * Both name the store AND the staff member, are signed with the server's secret (APP_SECRET), and are signed for
 * different purposes, so one can never be used as the other and neither can be made or changed in a browser.
 *
 * Why not rely on Next.js draft mode alone? Its cookie is the same value for every store on the platform, so on
 * its own it could not tell store A's owner from store B's. Drafts are shown only when draft mode is on AND the
 * session pass belongs to the store being viewed.
 */
import { signToken, verifyToken } from '@/lib/secrets'

export const PREVIEW_LINK_SECONDS = 60
export const PREVIEW_SESSION_SECONDS = 60 * 60
export const PREVIEW_COOKIE = 'rk_preview'
/** Which of the store's own draft themes the owner is looking at. Only read inside a valid preview. */
export const PREVIEW_THEME_COOKIE = 'rk_preview_theme'
const LINK = 'preview-link', SESSION = 'preview-session'

/** Shown when someone tries to order (or ask for a phone code) from inside a preview. */
export const PREVIEW_NO_ORDERS = 'You are in preview mode, so orders are switched off. Press “Exit preview” to use the shop like a customer.'

export interface PreviewPass { storeId: string; userId: string }
const idOk = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v)
const read = (purpose: string, token: string | null | undefined, now: number): PreviewPass | null => {
  const p = verifyToken<{ s?: unknown; u?: unknown }>(purpose, token, now)
  return p && idOk(p.s) && idOk(p.u) ? { storeId: p.s, userId: p.u } : null
}

export const makeLinkToken = (pass: PreviewPass, now = Date.now()) => signToken(LINK, { s: pass.storeId, u: pass.userId }, PREVIEW_LINK_SECONDS, now)
export const readLinkToken = (token: string | null | undefined, now = Date.now()) => read(LINK, token, now)
export const makeSessionPass = (pass: PreviewPass, now = Date.now()) => signToken(SESSION, { s: pass.storeId, u: pass.userId }, PREVIEW_SESSION_SECONDS, now)
export const readSessionPass = (value: string | null | undefined, now = Date.now()) => read(SESSION, value, now)

/**
 * Where to land after the preview is switched on. Only a page of the SAME shop is accepted: anything that could
 * send the owner to another website ("//evil.com", "https://...", "/\evil"), or into the dashboard or an API,
 * becomes the shop's home page.
 */
export function safePreviewPath(raw: string | null | undefined): string {
  const p = (raw ?? '').trim()
  if (!p || p.length > 300 || !p.startsWith('/') || p.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(p) || p.includes('://')) return '/'
  const path = p.split(/[?#]/)[0].toLowerCase()
  if (/^\/(admin|api|csmi|_next)(\/|$)/.test(path) || path.includes('/../') || path.endsWith('/..')) return '/'
  return p
}

/**
 * May a preview of the token's store be opened at this web address?
 *  - An address that belongs to ONE store (its domain, or <store>.<platform>) only ever previews that store:
 *    a token for store A opens nothing on store B's address.
 *  - An address that names no store (localhost, a deployment's test address) is shared by every store, so there the
 *    signed token itself says which store to show. Only its holder sees it; everyone else still sees the default shop.
 */
export function previewAllowedAt(i: { bound: boolean; hostStoreId: string | null; tokenStoreId: string }): boolean {
  return i.bound ? i.hostStoreId === i.tokenStoreId : true
}

/** Which product statuses a shop page may show. Archived products are never shown, not even in preview. */
export const visibleStatuses = (preview: boolean): ('ACTIVE' | 'DRAFT')[] => (preview ? ['ACTIVE', 'DRAFT'] : ['ACTIVE'])

/** The address the Preview button opens: the shop's own address, the one-minute token and the page to show. */
/** `theme` (optional) = one of the store's own themes to look at instead of the live one. */
export function previewLink(origin: string, path: string, token: string, theme?: string | null): string {
  return `${origin.replace(/\/+$/, '')}/api/preview?secret=${encodeURIComponent(token)}&slug=${encodeURIComponent(safePreviewPath(path))}${theme && /^[A-Za-z0-9_-]{1,40}$/.test(theme) ? `&theme=${theme}` : ''}`
}

/** The shop's public address: its own live domain first, then its free platform address, else where the dashboard is open now (development). */
export function storeOrigin(i: { domains: { host: string; isPrimary: boolean }[]; free: string | null; requestHost: string | null }): string {
  const d = i.domains.find((x) => x.isPrimary) ?? i.domains[0]
  if (d) return `https://${d.host}`
  if (i.free) return i.free
  const h = i.requestHost || 'localhost:3000'
  return `${/^(localhost|127\.|\[::1\])/.test(h) ? 'http' : 'https'}://${h}`
}
