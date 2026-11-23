import { db } from '@/lib/db'
import { mergeExtra } from '@/lib/admin/extra-merge'

/**
 * Saves ONE named group of settings inside StoreSettings.extra (a small JSON store for settings that need no
 * column of their own), keeping every other group that lives there (wallets, couriers, the fake-order check…).
 */
export async function saveExtra(storeId: string, key: string, value: object): Promise<void> {
  await db.$transaction(async (tx) => {
    const current = await tx.storeSettings.findUnique({ where: { storeId }, select: { extra: true } })
    await tx.storeSettings.update({ where: { storeId }, data: { extra: mergeExtra(current?.extra, key, value) } })
  })
}
export async function loadExtra(storeId: string): Promise<unknown> {
  return (await db.storeSettings.findUnique({ where: { storeId }, select: { extra: true } }))?.extra ?? null
}
