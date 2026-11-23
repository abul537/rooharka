import type { Prisma } from '@/lib/generated/prisma/client'

/**
 * A value made SAFE for a database JSON column, with a type Prisma accepts. It passes through JSON once, which
 * proves it is plain JSON (undefined and functions dropped, dates become text), so what is stored is exactly what
 * is read back. Use it wherever our own objects (settings, snapshots of lines, check results) are written to Json.
 */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue
}
