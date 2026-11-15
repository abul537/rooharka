/**
 * BUNDLE-SIZE GATE: the rules, pure and unit-tested. The script scripts/bundle-budget.mjs measures the JavaScript
 * the browser must download (gzip size, as it travels) after a build, and this decides pass or fail.
 * A slow phone on mobile data pays for every kilobyte, so growth must be a decision, never an accident.
 */
export const BUDGET_KB = {
  /** All JavaScript of the whole app together. Catches a heavy library added anywhere. */
  total: 1500,
  /** The single largest file. Catches one page pulling in something huge. */
  largestFile: 250,
} as const
export interface Measured { file: string; gzipBytes: number }
export interface BudgetReport { ok: boolean; totalKb: number; largest: { file: string; kb: number } | null; problems: string[] }
const kb = (bytes: number) => Math.round((bytes / 1024) * 10) / 10

export function checkBudget(files: readonly Measured[], budget: { total: number; largestFile: number } = BUDGET_KB): BudgetReport {
  if (files.length === 0) return { ok: false, totalKb: 0, largest: null, problems: ['No built JavaScript was found. Run the build first.'] }
  const total = kb(files.reduce((s, f) => s + f.gzipBytes, 0))
  const top = [...files].sort((a, b) => b.gzipBytes - a.gzipBytes)[0]
  const problems: string[] = []
  if (total > budget.total) problems.push(`All JavaScript together is ${total} KB (gzip); the limit is ${budget.total} KB.`)
  if (kb(top.gzipBytes) > budget.largestFile) problems.push(`The largest file, ${top.file}, is ${kb(top.gzipBytes)} KB (gzip); the limit is ${budget.largestFile} KB.`)
  return { ok: problems.length === 0, totalKb: total, largest: { file: top.file, kb: kb(top.gzipBytes) }, problems }
}
