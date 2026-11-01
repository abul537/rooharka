/** Pure rules for describing how a background job is doing. */
export interface JobSummary { status: string; startedAt: Date; finishedAt: Date | null }
export type JobHealth = 'ok' | 'running' | 'failed' | 'late' | 'never'

/**
 * `expectEveryHours`: how often the job should run. `late` = the last SUCCESSFUL run is older than 1.5x that
 * (a missed run or two), so the owner is told before it becomes a problem.
 */
export function jobHealth(last: JobSummary | null, lastOk: JobSummary | null, expectEveryHours: number, now = new Date()): JobHealth {
  if (!last) return 'never'
  if (last.status === 'RUNNING' && now.getTime() - last.startedAt.getTime() < 15 * 60_000) return 'running'
  if (last.status === 'FAILED') return 'failed'
  const ref = lastOk?.finishedAt ?? lastOk?.startedAt
  if (!ref || now.getTime() - ref.getTime() > expectEveryHours * 1.5 * 3_600_000) return 'late'
  return 'ok'
}
