/**
 * Checks the Pakistan address data used by the checkout dropdowns: `pnpm address:check`
 * Reports provinces with no cities and cities with no localities (a customer in such a city
 * cannot finish checkout, because locality is required to deliver).
 */
import 'dotenv/config'
import { db } from '../lib/db'

async function main() {
  const provinces = await db.province.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, _count: { select: { cities: true } } } })
  console.log('Province'.padEnd(28), 'Cities')
  for (const p of provinces) console.log(`${p.name}`.padEnd(28), p._count.cities)

  const noCities = provinces.filter((p) => p._count.cities === 0)
  const noLoc = await db.city.findMany({ where: { localities: { none: {} } }, orderBy: { name: 'asc' }, select: { id: true, name: true, province: { select: { name: true } } } })
  const [cities, localities] = await Promise.all([db.city.count(), db.locality.count()])
  console.log(`\nTotals: ${provinces.length} provinces, ${cities} cities, ${localities} localities`)
  console.log(`\nProvinces with NO cities (${noCities.length}): ${noCities.map((p) => p.name).join(', ') || 'none'}`)
  console.log(`Cities with NO localities (${noLoc.length}):`)
  for (const c of noLoc.slice(0, 60)) console.log(`  - ${c.name} (${c.province.name})  [id ${c.id}]`)
  if (noLoc.length > 60) console.log(`  ...and ${noLoc.length - 60} more`)
  if (noCities.length || noLoc.length) console.log('\nCustomers choosing these places cannot finish checkout until localities are added to them.')
  else console.log('\nAll good: every province has cities and every city has localities.')
}

main().catch((e) => { console.error('Failed:', e.message); process.exitCode = 1 }).finally(() => db.$disconnect())
