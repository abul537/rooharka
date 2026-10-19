import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { decryptJson, encryptJson, maskSecret } from '@/lib/secrets'
import { SERVICES, type SavedFields, type ServiceDef, type ServiceView } from '@/lib/services/registry'

type Json = Prisma.InputJsonValue

export interface ServiceSecrets { credentials: SavedFields; config: SavedFields; enabled: boolean; isDefault: boolean }

function readCredentials(enc: string | null | undefined): SavedFields | null {
  if (!enc) return null
  try { return decryptJson<SavedFields>(enc) } catch { return null } // changed APP_SECRET or damaged: treated as "not set"
}

const asFields = (v: unknown): SavedFields =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === 'string')) as SavedFields : {}

export async function loadServiceViews(storeId: string): Promise<Map<string, ServiceView>> {
  const rows = await db.storeService.findMany({ where: { storeId } })
  const out = new Map<string, ServiceView>()
  for (const def of SERVICES) {
    const row = rows.find((r) => r.serviceKey === def.key)
    const creds = readCredentials(row?.credentialsEnc)
    const values: SavedFields = { ...asFields(row?.config) }
    const masked: SavedFields = {}
    for (const f of def.credentials) {
      const v = creds?.[f.name]
      if (!v) continue
      if (f.secret) masked[f.name] = maskSecret(v)
      else values[f.name] = v
    }
    out.set(def.key, {
      key: def.key, enabled: !!row?.enabled, isDefault: !!row?.isDefault, values, masked,
      configured: !!creds && def.credentials.filter((f) => f.required).every((f) => creds[f.name]),
      lastError: row?.lastError ?? null, lastCheckedAt: row?.lastCheckedAt ?? null,
    })
  }
  return out
}

/** Decrypted credentials for server-side use only (sending a message, booking a parcel, signing an upload). */
export async function getServiceSecrets(storeId: string, key: string): Promise<ServiceSecrets | null> {
  const row = await db.storeService.findUnique({ where: { storeId_serviceKey: { storeId, serviceKey: key } } })
  if (!row) return null
  const credentials = readCredentials(row.credentialsEnc)
  if (!credentials) return null
  return { credentials, config: asFields(row.config), enabled: row.enabled, isDefault: row.isDefault }
}

export async function saveService(storeId: string, def: ServiceDef, value: { credentials: SavedFields; config: SavedFields }, flags: { enabled: boolean; isDefault: boolean }) {
  await db.$transaction(async (tx) => {
    // The catalog row is what the store's record points at; create it on first use.
    await tx.serviceCatalog.upsert({
      where: { key: def.key },
      create: { key: def.key, name: def.name, type: def.type, description: def.description, requiresOwnCredentials: true },
      update: { name: def.name, description: def.description },
    })
    const isDefault = flags.enabled && flags.isDefault
    if (isDefault && def.type !== 'FEATURE') {
      // One default per kind (e.g. one default courier).
      const sameKind = SERVICES.filter((s) => s.type === def.type && s.key !== def.key).map((s) => s.key)
      await tx.storeService.updateMany({ where: { storeId, serviceKey: { in: sameKind } }, data: { isDefault: false } })
    }
    const data = {
      enabled: flags.enabled, isDefault, credentialsEnc: encryptJson(value.credentials), config: value.config as Json,
      lastError: null, enabledAt: flags.enabled ? new Date() : null,
    }
    await tx.storeService.upsert({
      where: { storeId_serviceKey: { storeId, serviceKey: def.key } },
      create: { storeId, serviceKey: def.key, ...data },
      update: data,
    })
  })
}

export async function removeService(storeId: string, key: string) {
  await db.storeService.deleteMany({ where: { storeId, serviceKey: key } })
}

/** Records the outcome of a connection test or a real call, so the dashboard can show a broken integration. */
export async function recordServiceResult(storeId: string, key: string, error: string | null) {
  await db.storeService.updateMany({ where: { storeId, serviceKey: key }, data: { lastError: error ? error.slice(0, 300) : null, lastCheckedAt: new Date() } })
}
