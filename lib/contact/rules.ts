import type { Getter, Parsed } from '@/lib/admin/settings-rules'
import { normalizePkMobile } from '@/lib/phone'
import { validateEmail } from '@/lib/validation'

/** A customer's message to the store. Pure validation so every rule is tested. */
export interface ContactInput { name: string; phone: string; email: string | null; message: string }
export const MAX_MESSAGE = 1000
const text = (g: Getter, k: string) => String(g.get(k) ?? '').trim()

export function parseContact(g: Getter): Parsed<ContactInput> {
  // A hidden field real visitors never see: bots fill it. Looks like success to them, but nothing is stored.
  if (text(g, 'website')) return { ok: false, error: 'HONEYPOT' }
  const name = text(g, 'name').replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 60 || /[<>]/.test(name)) return { ok: false, error: 'Please enter your name (2 to 60 characters).' }
  const phone = normalizePkMobile(text(g, 'phone'))
  if (!phone) return { ok: false, error: 'Please enter a Pakistani mobile number like 03001234567, so the store can call you back.' }
  const email = text(g, 'email')
  if (email && (email.length > 120 || validateEmail(email))) return { ok: false, error: 'That email address is not valid (or leave it empty).' }
  const message = text(g, 'message').replace(/[ \t]+/g, ' ')
  if (message.length < 5) return { ok: false, error: 'Please write your message (at least 5 characters).' }
  if (message.length > MAX_MESSAGE) return { ok: false, error: `Please keep your message under ${MAX_MESSAGE} characters.` }
  if (/[<>]/.test(message)) return { ok: false, error: 'Please do not use < or > in your message.' }
  if ((message.match(/https?:\/\//gi) ?? []).length > 2) return { ok: false, error: 'Please remove the extra links from your message.' }
  return { ok: true, value: { name, phone, email: email || null, message } }
}

/** A tap-to-chat WhatsApp address for the store (digits only), or null. */
export function whatsappHref(number: string | null | undefined, text = ''): string | null {
  const n = normalizePkMobile(number ?? '')
  return n ? `https://wa.me/${n.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text.slice(0, 300))}` : ''}` : null
}
export const telHref = (number: string | null | undefined) => { const n = normalizePkMobile(number ?? ''); return n ? `tel:${n.startsWith('+') ? n : `+${n.replace(/\D/g, '')}`}` : null }
