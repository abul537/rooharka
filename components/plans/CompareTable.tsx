import { compareRows } from '@/lib/plans/catalog'

export interface ComparePlanCol { id: string; name: string; limits: unknown; features: unknown; current?: boolean }

/**
 * "Compare plans": every plan side by side, row by row. Used on the public pricing page and in the store owner's
 * Plan and billing page. Plain table markup so it reads well with a screen reader, and scrolls sideways on a phone.
 */
export default function CompareTable({ plans }: { plans: ComparePlanCol[] }) {
  if (plans.length === 0) return null
  const groups = compareRows(plans)
  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">Compare plans</caption>
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50">
            <th scope="col" className="px-4 py-3 text-left font-medium text-stone-500">Feature</th>
            {plans.map((p) => <th key={p.id} scope="col" className="w-36 px-4 py-3 text-center font-semibold">{p.name}{p.current && <span className="mt-0.5 block text-xs font-medium text-emerald-700">Your plan</span>}</th>)}
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.title}>
            <tr><th scope="colgroup" colSpan={plans.length + 1} className="bg-white px-4 pb-2 pt-5 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">{g.title}</th></tr>
            {g.rows.map((r) => (
              <tr key={r.label} className="border-t border-stone-100">
                <th scope="row" className="px-4 py-2.5 text-left font-normal text-stone-800">{r.label}{r.hint && <span className="mt-0.5 block text-xs text-stone-500">{r.hint}</span>}</th>
                {r.values.map((v, i) => (
                  <td key={plans[i].id} className="px-4 py-2.5 text-center">
                    {v === true ? <span className="font-semibold text-emerald-700" aria-label="Included">✓</span> : v === false ? <span className="text-stone-300" aria-label="Not included">—</span> : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}
