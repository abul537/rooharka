/**
 * Measures how long one trip to your database takes: `pnpm db:ping`
 * Run it from the computer that runs the app. Typical results:
 *   under 40 ms   same region as the database (ideal for production)
 *   100-300 ms    a different continent: every page that makes 5 queries then feels 0.5-1.5 s slower
 *   first trip much slower than the rest: the database was asleep (Neon free plan pauses when idle)
 */
import 'dotenv/config'
import { db } from '../lib/db'

async function time<T>(fn: () => Promise<T>) {
  const t = performance.now()
  await fn()
  return Math.round(performance.now() - t)
}

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? '').hostname
  console.log(`Database host: ${host}\n`)
  const first = await time(() => db.$queryRaw`SELECT 1`)
  console.log(`First trip (includes connecting / waking up): ${first} ms`)
  const trips: number[] = []
  for (let i = 0; i < 8; i++) trips.push(await time(() => db.$queryRaw`SELECT 1`))
  const sorted = [...trips].sort((a, b) => a - b)
  console.log(`Next 8 trips: ${trips.join(', ')} ms  (median ${sorted[4]} ms)`)
  const store = await time(() => db.store.findFirst({ select: { id: true } }))
  console.log(`One real query (store lookup): ${store} ms`)

  const median = sorted[4]
  console.log('')
  if (median < 40) console.log('Verdict: fast. The database is close to the app.')
  else if (median < 120) console.log('Verdict: acceptable, but a database nearer to your customers would feel snappier.')
  else console.log(`Verdict: SLOW LINK. Each query costs about ${median} ms before any work is done.\nMove the Neon project to a nearer region (Singapore is closest to Pakistan) and host the app in the same region.`)
  if (first > median * 4 && first > 800) console.log('Also: the first trip was slow, so the database was asleep. Neon free databases pause after 5 idle minutes.')
}

main().catch((e) => { console.error('Could not reach the database:', e.message); process.exitCode = 1 }).finally(() => db.$disconnect())
