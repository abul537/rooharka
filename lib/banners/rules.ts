import type { Getter, Parsed } from '@/lib/admin/settings-rules'

/** Banner rules as pure functions (no database), so every case is unit-tested. */
export type Tone = 'INFO' | 'OFFER' | 'WARNING'
export type Audience = 'PUBLIC' | 'STORES' | 'BOTH'
export const TONES: Tone[] = ['INFO', 'OFFER', 'WARNING']
export const AUDIENCES: Audience[] = ['PUBLIC', 'STORES', 'BOTH']
export const MAX_SHOWN = 3

export interface BannerRow {
  id: string; text: string; tone: string; linkUrl: string | null; linkLabel: string | null
  audience: string; startsAt: Date | null; endsAt: Date | null; isActive: boolean; createdAt: Date
}

/** Only https:// links or paths on this site: never javascript:, data: or protocol-relative //host links. */
export function safeLink(url: string): string | null {
  const u = url.trim()
  if (/^\/(?!\/)[^\s]*$/.test(u)) return u
  try { const p = new URL(u); return p.protocol === 'https:' ? p.toString() : null } catch { return null }
}

/** Is this banner for this audience and inside its dates? ('BOTH' shows to everyone.) */
export function bannerVisible(b: Pick<BannerRow, 'audience' | 'startsAt' | 'endsAt' | 'isActive'>, who: 'PUBLIC' | 'STORES', now = new Date()): boolean {
  if (!b.isActive) return false
  if (b.audience !== who && b.audience !== 'BOTH') return false
  if (b.startsAt && b.startsAt > now) return false
  if (b.endsAt && b.endsAt < now) return false
  return true
}

/** Newest first, at most MAX_SHOWN, so a pile of old notices never fills the screen. */
export function pickBanners(rows: BannerRow[], who: 'PUBLIC' | 'STORES', now = new Date()): BannerRow[] {
  return rows.filter((b) => bannerVisible(b, who, now)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, MAX_SHOWN)
}

export const TONE_CLASSES: Record<Tone, string> = {
  INFO: 'bg-stone-900 text-stone-50',
  OFFER: 'bg-emerald-700 text-white',
  WARNING: 'bg-amber-400 text-stone-900',
}
export const toneOf = (t: string): Tone => (TONES.includes(t as Tone) ? (t as Tone) : 'INFO')

export interface BannerInput {
  text: string; tone: Tone; linkUrl: string | null; linkLabel: string | null; audience: Audience
  startsAt: Date | null; endsAt: Date | null; isActive: boolean
}
const text = (g: Getter, k: string) => String(g.get(k) ?? '').trim()
function day(s: string, end: boolean): Date | null | undefined {
  if (!s) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined
  const d = new Date(`${s}T${end ? '23:59:59' : '00:00:00'}+05:00`) // Pakistan time
  return Number.isNaN(d.getTime()) ? undefined : d
}

export function parseBanner(g: Getter): Parsed<BannerInput> {
  const t = text(g, 'text').replace(/\s+/g, ' ')
  if (t.length < 3 || t.length > 160 || /[<>]/.test(t)) return { ok: false, error: 'The message must be 3 to 160 characters (no < or >).' }
  const tone = TONES.find((x) => x === text(g, 'tone')) ?? 'INFO'
  const audience = AUDIENCES.find((x) => x === text(g, 'audience')) ?? 'PUBLIC'
  const rawLink = text(g, 'linkUrl')
  const linkUrl = rawLink ? safeLink(rawLink) : null
  if (rawLink && !linkUrl) return { ok: false, error: 'The link must start with https:// or be a page on this site like /pricing.' }
  const label = text(g, 'linkLabel')
  if (label.length > 30 || /[<>]/.test(label)) return { ok: false, error: 'The link text must be 30 characters or fewer.' }
  const startsAt = day(text(g, 'startsAt'), false), endsAt = day(text(g, 'endsAt'), true)
  if (startsAt === undefined || endsAt === undefined) return { ok: false, error: 'Dates must be real dates.' }
  if (startsAt && endsAt && endsAt < startsAt) return { ok: false, error: 'The end date must be after the start date.' }
  return { ok: true, value: { text: t, tone, linkUrl, linkLabel: linkUrl ? label || 'Learn more' : null, audience, startsAt, endsAt, isActive: g.get('isActive') === 'on' } }
}
