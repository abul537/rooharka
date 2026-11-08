import type { Getter, Parsed } from '@/lib/admin/settings-rules'

/** The "who uses us" showcase. Only https addresses are accepted, so nothing else can ever reach an image tag or a link. */
export interface ClientInput { name: string; logoUrl: string | null; website: string | null; quote: string | null; person: string | null; sortOrder: number; isVisible: boolean }

export function httpsUrl(v: string): string | null {
  try { const u = new URL(v.trim()); return u.protocol === 'https:' && u.hostname.includes('.') ? u.toString() : null } catch { return null }
}

const text = (g: Getter, k: string) => String(g.get(k) ?? '').trim().replace(/\s+/g, ' ')

export function parseClient(g: Getter): Parsed<ClientInput> {
  const name = text(g, 'name')
  if (name.length < 2 || name.length > 60 || /[<>]/.test(name)) return { ok: false, error: 'The business name must be 2 to 60 characters.' }
  const logo = text(g, 'logoUrl'), site = text(g, 'website')
  const logoUrl = logo ? httpsUrl(logo) : null, website = site ? httpsUrl(site) : null
  if (logo && !logoUrl) return { ok: false, error: 'The logo address must start with https:// (an image link).' }
  if (site && !website) return { ok: false, error: 'The website must start with https://.' }
  const quote = text(g, 'quote'), person = text(g, 'person')
  if (quote.length > 240 || /[<>]/.test(quote)) return { ok: false, error: 'The testimonial must be 240 characters or fewer.' }
  if (person.length > 60 || /[<>]/.test(person)) return { ok: false, error: 'The person line must be 60 characters or fewer.' }
  if (quote && !person) return { ok: false, error: 'Say who said the testimonial (for example "Ayesha Khan, owner").' }
  const sortRaw = text(g, 'sortOrder')
  if (sortRaw !== '' && !/^\d{1,4}$/.test(sortRaw)) return { ok: false, error: 'The order must be a whole number from 0 to 9999.' }
  if (!g.get('permission')) return { ok: false, error: 'Tick the box to confirm this business agreed to be shown.' }
  return { ok: true, value: { name, logoUrl, website, quote: quote || null, person: quote ? person : null, sortOrder: sortRaw === '' ? 0 : Number(sortRaw), isVisible: g.get('isVisible') === 'on' } }
}

/** "1 store runs on Rooharka" / "42 stores run on Rooharka". Null when there is nothing honest to show. */
export function storeCountLine(count: number, brand: string): string | null {
  if (!Number.isInteger(count) || count < 1) return null
  return count === 1 ? `1 store runs on ${brand}` : `${count.toLocaleString('en-PK')} stores run on ${brand}`
}
