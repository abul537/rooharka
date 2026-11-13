/** Pure vault helpers (no database), so they are unit-tested. See vault.ts for how they are used. */
import { decryptJson, encryptJson, hmacHex } from '@/lib/secrets'

interface Sealed { t: string; s: string; p: string }

/** Pure: seal / open a token for one store+courier. Exported for tests. */
export const sealToken = (storeId: string, provider: string, token: string) => encryptJson({ t: token, s: storeId, p: provider } satisfies Sealed)
export function openToken(storeId: string, provider: string, sealed: string): string | null {
  try {
    const v = decryptJson<Sealed>(sealed)
    return v.s === storeId && v.p === provider && typeof v.t === 'string' && v.t ? v.t : null
  } catch { return null } // changed APP_SECRET or damaged: behaves as "not connected"
}

// ------------------------------------------------------------------ webhook key
/**
 * The shared secret that proves a webhook comes from the courier account of THIS store. It is derived (keyed hash of
 * APP_SECRET + store + courier), so nothing extra is stored, every store has its own, and a key for store A is useless for B.
 */
export const webhookKey = (storeId: string, provider: string) => hmacHex('courier-webhook', `${provider}|${storeId}`).slice(0, 40)
