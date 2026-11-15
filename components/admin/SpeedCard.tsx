import { db } from '@/lib/db'
import { pktDay } from '@/lib/admin/insights'
import { GOOD_SHARE_TARGET, SPEED_LABEL, SPEED_MIN_SAMPLES, SPEED_PAGES, seconds, summariseSpeed, type SpeedPage } from '@/lib/speed'

const TONE = { fast: 'text-emerald-700', ok: 'text-amber-700', slow: 'text-red-700' } as const
const WORD = { fast: 'Fast', ok: 'Could be faster', slow: 'Slow' } as const

/**
 * SHOP SPEED on the Overview: how fast this shop's pages really were for its visitors in the last 7 days, measured
 * in their own browsers (not a lab test). Only this store's rows are read.
 */
export default async function SpeedCard({ storeId }: { storeId: string }) {
  const since = pktDay(new Date(Date.now() - 6 * 86_400_000))
  const rows = await db.speedDay.findMany({ where: { storeId, day: { gte: since } }, select: { page: true, samples: true, lcpGood: true, lcpPoor: true, lcpMsSum: true, ttfbGood: true, ttfbMsSum: true, clsGood: true } }).catch(() => [])
  const all = summariseSpeed(rows)
  const perPage = SPEED_PAGES.map((p) => ({ page: p, s: summariseSpeed(rows.filter((r) => r.page === p)) })).filter((x): x is { page: SpeedPage; s: NonNullable<ReturnType<typeof summariseSpeed>> } => !!x.s)
  return (
    <section className="rounded-xl bg-white border border-slate-200 p-5">
      <h2 className="font-semibold">Shop speed <span className="font-normal text-sm text-slate-500">· last 7 days</span></h2>
      {!all ? <p className="mt-2 text-sm text-slate-500">Not enough visits yet to judge (at least {SPEED_MIN_SAMPLES} measured page loads are needed). The speed is measured in your visitors’ own browsers.</p> : (
        <>
          <p className={`mt-2 text-2xl font-bold ${TONE[all.verdict]}`}>{WORD[all.verdict]}</p>
          <p className="text-sm text-slate-600">{all.lcpGoodShare}% of visits saw the page within 2.5 seconds (goal: {GOOD_SHARE_TARGET}%).</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Page shown</dt><dd className="font-semibold">{seconds(all.lcpAverageMs)}</dd></div>
            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Server answer</dt><dd className="font-semibold">{all.ttfbAverageMs} ms</dd></div>
            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Steady layout</dt><dd className="font-semibold">{all.clsGoodShare}%</dd></div>
          </dl>
          {perPage.length > 1 && (
            <ul className="mt-3 space-y-1 text-sm">
              {perPage.map(({ page, s }) => <li key={page} className="flex justify-between gap-3"><span className="text-slate-600">{SPEED_LABEL[page]}</span><span className={TONE[s.verdict]}>{seconds(s.lcpAverageMs)} · {s.lcpGoodShare}% good</span></li>)}
            </ul>
          )}
          {all.verdict !== 'fast' && <p className="mt-3 text-xs text-slate-500">Most often the cause is a heavy first picture. Keep the top of each page to one picture, and let the editor’s tips guide you.</p>}
          <p className="mt-2 text-xs text-slate-400">From {all.samples} measured visits (one page load in four reports).</p>
        </>
      )}
    </section>
  )
}
