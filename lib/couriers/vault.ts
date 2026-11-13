/**
 * The courier credential vault. The raw token:
 *  - is stored ONLY encrypted (AES-256-GCM; the key comes from the APP_SECRET environment variable, never the database),
 *  - is bound to its store and courier, so a copied row is useless anywhere else,
 *  - is decrypted only inside `withCredentials`, for the length of one courier call, and handed to nothing else,
 *  - is never logged and never returned: the only things this file hands to pages are booleans and error text.
 */
import { db } from '@/lib/db'
import { openToken, sealToken } from '@/lib/couriers/vault-rules'
import { CourierError, type CourierCredentials } from '@/lib/couriers/contract'

/** Saves (or replaces) the token, switched on. The caller has ALREADY proven the token works. */
export async function saveToken(storeId: string, provider: string, token: string) {
  const encryptedToken = sealToken(storeId, provider, token)
  await db.tenantCourierCredential.upsert({
    where: { storeId_provider: { storeId, provider } },
    create: { storeId, provider, encryptedToken, isActive: true },
    update: { encryptedToken, isActive: true, lastError: null },
  })
}

export async function disconnect(storeId: string, provider: string) {
  await db.tenantCourierCredential.deleteMany({ where: { storeId, provider } })
}

/** Connected = a usable, switched-on token exists. Never selects the token itself. */
export async function isConnected(storeId: string, provider: string): Promise<boolean> {
  const r = await db.tenantCourierCredential.findUnique({ where: { storeId_provider: { storeId, provider } }, select: { isActive: true } })
  return !!r?.isActive
}

/** Which of these couriers does the store have connected? (no secrets selected) */
export async function connectedProviders(storeId: string): Promise<Set<string>> {
  const rows = await db.tenantCourierCredential.findMany({ where: { storeId, isActive: true }, select: { provider: true } })
  return new Set(rows.map((r: { provider: string }) => r.provider))
}

export async function connectionStatus(storeId: string, provider: string): Promise<{ connected: boolean; lastError: string | null; since: Date | null }> {
  const r = await db.tenantCourierCredential.findUnique({ where: { storeId_provider: { storeId, provider } }, select: { isActive: true, lastError: true, createdAt: true } })
  return { connected: !!r?.isActive, lastError: r?.lastError ?? null, since: r?.createdAt ?? null }
}

export async function recordCourierResult(storeId: string, provider: string, error: string | null) {
  await db.tenantCourierCredential.updateMany({ where: { storeId, provider }, data: { lastError: error ? error.slice(0, 300) : null } })
}

/** The ONLY way to use a token: it is decrypted here, passed to `fn`, and goes out of scope when `fn` ends. */
export async function withCredentials<T>(storeId: string, provider: string, fn: (c: CourierCredentials) => Promise<T>): Promise<T> {
  const row = await db.tenantCourierCredential.findUnique({ where: { storeId_provider: { storeId, provider } }, select: { encryptedToken: true, isActive: true } })
  const token = row?.isActive ? openToken(storeId, provider, row.encryptedToken) : null
  if (!token) throw new CourierError('auth', 'This courier is not connected. Connect it in Settings > Couriers.')
  return fn({ token })
}

export { webhookKey } from '@/lib/couriers/vault-rules'
