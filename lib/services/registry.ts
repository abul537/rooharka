/**
 * Every third-party service a store owner can connect with THEIR OWN account (they pay the provider;
 * the platform only brokers the connection). One definition drives the settings form, the validation
 * and the saved record, so adding a service later means adding an entry here and an adapter.
 */
import type { Getter, Parsed } from '@/lib/admin/settings-rules'

export type ServiceType = 'COURIER' | 'MESSAGING' | 'FEATURE'
export interface FieldDef { name: string; label: string; secret?: boolean; required?: boolean; placeholder?: string; help?: string; pattern?: RegExp; patternHint?: string }
export interface ServiceDef {
  key: string; name: string; type: ServiceType; description: string
  /** Encrypted at rest; shown masked after saving. */
  credentials: FieldDef[]
  /** Not secret (e.g. pickup code, sender number). */
  config: FieldDef[]
}

export const SERVICES: ServiceDef[] = [
  {
    key: 'cloudinary', name: 'Cloudinary (photos and videos)', type: 'FEATURE',
    description: 'Stores your product photos and videos and serves them fast. Free plan available at cloudinary.com.',
    credentials: [
      { name: 'cloudName', label: 'Cloud name', required: true, pattern: /^[a-z0-9_-]{2,60}$/i, patternHint: 'Letters, digits, - and _ only' },
      { name: 'apiKey', label: 'API key', required: true, pattern: /^\d{6,30}$/, patternHint: 'Digits only' },
      { name: 'apiSecret', label: 'API secret', secret: true, required: true },
    ],
    config: [],
  },
  {
    key: 'twilio', name: 'Twilio (SMS and WhatsApp)', type: 'MESSAGING',
    description: 'Sends OTP codes by SMS or WhatsApp from your own Twilio account. Twilio bills you per message.',
    credentials: [
      { name: 'accountSid', label: 'Account SID', required: true, pattern: /^AC[a-f0-9]{32}$/i, patternHint: 'Starts with AC, then 32 letters/digits' },
      { name: 'authToken', label: 'Auth token', secret: true, required: true },
    ],
    config: [
      { name: 'smsFrom', label: 'SMS sender (number or sender ID)', placeholder: '+15551234567', pattern: /^(\+\d{7,15}|[A-Za-z0-9 ]{1,11})$/, patternHint: 'A +number or up to 11 letters/digits' },
      { name: 'whatsappFrom', label: 'WhatsApp sender number', placeholder: '+14155238886', pattern: /^\+\d{7,15}$/, patternHint: 'A number like +14155238886' },
    ],
  },
  {
    key: 'http-sms', name: 'Other SMS provider (HTTP)', type: 'MESSAGING',
    description: 'Works with any local SMS company that offers a web link (HTTP API). You fill in the address they give you.',
    credentials: [{ name: 'secretValue', label: 'API key / password (optional)', secret: true, help: 'Inserted wherever your link or body says {secret}.' }],
    config: [
      { name: 'method', label: 'Method', required: true, placeholder: 'GET or POST', pattern: /^(GET|POST)$/, patternHint: 'GET or POST' },
      { name: 'url', label: 'Address (https only)', required: true, placeholder: 'https://sms.example.pk/api?key={secret}&to={to}&text={message}', pattern: /^https:\/\/\S{4,500}$/i, patternHint: 'It must start with https:// and contain no spaces.', help: 'Use {to} for the number as 923001234567 (or {to_local} for 03001234567), {message} for the text and {secret} for your key.' },
      { name: 'body', label: 'POST body (optional)', placeholder: 'to={to}&message={message}&key={secret}', help: 'Form-style text. Leave empty for GET.' },
      { name: 'successText', label: 'Success text (optional)', placeholder: 'OK', help: 'If set, the provider reply must contain this text, otherwise it is treated as failed.' },
    ],
  },
  {
    key: 'postex', name: 'PostEx', type: 'COURIER',
    description: 'Book parcels with PostEx directly from the order page. Get your API token in the PostEx merchant portal.',
    credentials: [{ name: 'apiToken', label: 'API token', secret: true, required: true }],
    config: [{ name: 'pickupAddressCode', label: 'Pickup address code', required: true, placeholder: '001', pattern: /^[A-Za-z0-9-]{1,20}$/, patternHint: 'The code shown for your pickup address in PostEx' }],
  },
  {
    key: 'leopards', name: 'Leopards Courier', type: 'COURIER',
    description: 'Book parcels with Leopards directly from the order page. Ask Leopards for your API key and password.',
    credentials: [
      { name: 'apiKey', label: 'API key', required: true },
      { name: 'apiPassword', label: 'API password', secret: true, required: true },
    ],
    config: [{ name: 'originCity', label: 'Your city (pickup city)', required: true, placeholder: 'Lahore', pattern: /^[A-Za-z .-]{2,40}$/, patternHint: 'City name, letters only' }],
  },
]

export const serviceDef = (key: string) => SERVICES.find((s) => s.key === key)

export type SavedFields = Record<string, string>

/**
 * Reads one service's form. Secret fields left blank KEEP the saved value (the form never receives it back),
 * so owners can change a pickup code without re-typing their password.
 */
export function parseServiceForm(def: ServiceDef, g: Getter, existing: SavedFields = {}): Parsed<{ credentials: SavedFields; config: SavedFields }> {
  const out = { credentials: {} as SavedFields, config: {} as SavedFields }
  for (const [group, fields] of [['credentials', def.credentials], ['config', def.config]] as const) {
    for (const f of fields) {
      let v = String(g.get(`${def.key}.${f.name}`) ?? '').trim()
      if (!v && f.secret && group === 'credentials') v = existing[f.name] ?? ''
      if (v.length > 600) return { ok: false, error: `${f.label} is too long.` }
      if (!v && f.required) return { ok: false, error: `${def.name}: ${f.label} is required.` }
      if (v && f.pattern && !f.pattern.test(v)) return { ok: false, error: `${def.name}: ${f.label} looks wrong. ${f.patternHint ?? ''}`.trim() }
      if (v) out[group][f.name] = v
    }
  }
  return { ok: true, value: out }
}

/** What the settings page may see. Secrets never leave the server: only their last 4 characters do. */
export interface ServiceView {
  key: string
  enabled: boolean
  isDefault: boolean
  /** Non-secret values (credentials that are not secret, plus options), safe to pre-fill. */
  values: SavedFields
  /** For secret fields that are saved: "••••1234". */
  masked: SavedFields
  configured: boolean
  lastError: string | null
  lastCheckedAt: Date | null
}

/** The enabled, configured service of a kind to use: the default one, or the only one enabled. */
export function pickService(views: Iterable<ServiceView>, type: ServiceDef['type']): string | null {
  const ok = [...views].filter((v) => v.enabled && v.configured && serviceDef(v.key)?.type === type)
  return (ok.find((v) => v.isDefault) ?? (ok.length === 1 ? ok[0] : undefined))?.key ?? null
}

