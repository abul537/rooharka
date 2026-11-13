/**
 * One-off: gives every variant the id of its store (new column ProductVariant.storeId), so the database can
 * refuse the same SKU twice in one store. Where two older variants of a store share a SKU, the later one gets
 * a numbered ending (ABC -> ABC-2) and is printed, so you can see exactly what changed.
 *
 * Run once after `pnpm db:push`:   pnpm exec tsx scripts/backfill-variant-store.ts
 * Safe to run again: it only touches rows that still have no store.
 */
import 'dotenv/config'
import { db } from '../lib/db'

async function main() {
  const rows = await db.productVariant.findMany({ where: { storeId: null }, orderBy: { id: 'asc' }, select: { id: true, sku: true, product: { select: { storeId: true, name: true } } } })
  const taken = new Map<string, Set<string>>() // store -> SKUs already claimed
  let renamed = 0
  for (const v of rows) {
    const storeId = v.product.storeId
    if (!taken.has(storeId)) taken.set(storeId, new Set((await db.productVariant.findMany({ where: { storeId }, select: { sku: true } })).map((x) => x.sku)))
    const used = taken.get(storeId)!
    let sku = v.sku
    for (let i = 2; used.has(sku); i++) sku = `${v.sku.slice(0, 26)}-${i}`
    if (sku !== v.sku) { renamed++; console.log(`SKU ${v.sku} was used twice in one store: “${v.product.name}” now has ${sku}`) }
    used.add(sku)
    await db.productVariant.update({ where: { id: v.id }, data: { storeId, sku } })
  }
  console.log(`Done. ${rows.length} variant(s) updated, ${renamed} SKU(s) renamed.`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
