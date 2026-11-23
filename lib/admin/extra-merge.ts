import type { Prisma } from '@/lib/generated/prisma/client'
import { toJson } from '@/lib/json'

/**
 * StoreSettings.extra with ONE named group replaced and every other group kept (wallets, couriers, the fake-order
 * check…). Pure, so it is unit-tested.
 *
 * Prisma only accepts values it can prove are JSON. The stored settings are JSON already (they came from the
 * database); the new group goes through JSON once, which also guarantees it really is plain JSON (no undefined,
 * functions or class objects), so the database always receives exactly what will be read back.
 */
export function mergeExtra(current: unknown, key: string, value: object): Prisma.InputJsonObject {
  const base = current && typeof current === 'object' && !Array.isArray(current) ? (current as Prisma.JsonObject) : {}
  return { ...base, [key]: toJson(value) }
}
