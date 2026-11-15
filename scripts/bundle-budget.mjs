// Measures the JavaScript the browser downloads after `pnpm build` and fails when it grows past the budget
// (lib/bundle-budget.ts). Run: pnpm build && pnpm bundle:check
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'
import { checkBudget, BUDGET_KB } from '../lib/bundle-budget.ts'

const root = join(process.cwd(), '.next', 'static')
if (!existsSync(root)) { console.error('No build found (.next/static is missing). Run "pnpm build" first.'); process.exit(1) }
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [] })
const files = walk(root).map((p) => ({ file: relative(root, p), gzipBytes: gzipSync(readFileSync(p)).length }))
const report = checkBudget(files)
console.log(`JavaScript: ${files.length} files, ${report.totalKb} KB gzip in total (limit ${BUDGET_KB.total} KB).`)
if (report.largest) console.log(`Largest file: ${report.largest.file}, ${report.largest.kb} KB (limit ${BUDGET_KB.largestFile} KB).`)
for (const p of report.problems) console.error(`TOO BIG: ${p}`)
if (!report.ok) { console.error('If this growth is intended, raise the limit in lib/bundle-budget.ts in the same change, with the reason.'); process.exit(1) }
console.log('Within budget.')
