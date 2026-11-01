import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'

const STALE_MS = 15 * 60_000 // a run that "started" longer ago than this is assumed to have died
const KEEP_DAYS = 90

export type JobOutcome<T> =
  | { status: 'ok'; result: T; runId: string }
  | { status: 'busy' }
  | { status: 'failed'; error: string; runId: string }

/**
 * Runs `work` as a recorded job. Two things the platform owner gets from this:
 *  - NO OVERLAP: if the same job is already running (a scheduled run and a button press at once), the second
 *    call returns `busy` and does nothing. The check and the claim happen under a database lock, so two
 *    servers cannot both start.
 *  - A HISTORY: every run is saved with its result or error, so "did billing run last night?" has an answer.
 * A crash inside `work` is recorded as FAILED and never escapes to the caller.
 */
export async function runJob<T>(name: string, trigger: 'cron' | 'manual', work: () => Promise<T>): Promise<JobOutcome<T>> {
  const run = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${name}))`
    const busy = await tx.jobRun.findFirst({ where: { name, status: 'RUNNING', startedAt: { gt: new Date(Date.now() - STALE_MS) } }, select: { id: true } })
    if (busy) return null
    return tx.jobRun.create({ data: { name, trigger }, select: { id: true } })
  })
  if (!run) return { status: 'busy' }

  try {
    const result = await work()
    await db.jobRun.update({ where: { id: run.id }, data: { status: 'OK', finishedAt: new Date(), result: result as unknown as Prisma.InputJsonValue } })
    db.jobRun.deleteMany({ where: { name, startedAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } }).catch(() => {})
    return { status: 'ok', result, runId: run.id }
  } catch (e) {
    console.error(`[job ${name}]`, e)
    const error = (e instanceof Error ? e.message : 'Unknown error').slice(0, 300)
    await db.jobRun.update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: new Date(), error } }).catch(() => {})
    return { status: 'failed', error, runId: run.id }
  }
}

/** Newest runs first, plus the newest successful one. */
export async function jobHistory(name: string, take = 8) {
  const [runs, lastOk] = await Promise.all([
    db.jobRun.findMany({ where: { name }, orderBy: { startedAt: 'desc' }, take }),
    db.jobRun.findFirst({ where: { name, status: 'OK' }, orderBy: { startedAt: 'desc' } }),
  ])
  return { runs, lastOk }
}
