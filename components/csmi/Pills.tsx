import type { HealthFlag } from '@/lib/csmi/rules'

const COLORS: Record<string, string> = {
  TRIAL: 'bg-amber-100 text-amber-800', TRIALING: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-emerald-100 text-emerald-800', PAID: 'bg-emerald-100 text-emerald-800',
  PAST_DUE: 'bg-orange-100 text-orange-800', OVERDUE: 'bg-red-100 text-red-800',
  SUSPENDED: 'bg-red-100 text-red-800', OPEN: 'bg-blue-100 text-blue-800',
  CANCELLED: 'bg-slate-200 text-slate-700', VOID: 'bg-slate-200 text-slate-700', DRAFT: 'bg-slate-100 text-slate-700',
}

export function Pill({ status }: { status: string }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${COLORS[status] ?? 'bg-slate-100 text-slate-700'}`}>{status.replace(/_/g, ' ').toLowerCase()}</span>
}

export function Flags({ flags }: { flags: HealthFlag[] }) {
  if (flags.length === 0) return <span className="text-xs text-emerald-700">Healthy</span>
  return (
    <ul className="space-y-0.5">
      {flags.map((f, i) => (
        <li key={i} className={`text-xs ${f.level === 'critical' ? 'text-red-700 font-medium' : 'text-amber-800'}`}>
          <span aria-hidden>{f.level === 'critical' ? '● ' : '○ '}</span>{f.text}
        </li>
      ))}
    </ul>
  )
}

export function Stat({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-5">
      <p className="text-sm text-slate-500">{title}</p>
      <p className={`text-2xl font-bold mt-1 ${tone === 'bad' ? 'text-red-700' : tone === 'good' ? 'text-emerald-700' : ''}`}>{value}</p>
      {sub && <p className="text-sm text-slate-500">{sub}</p>}
    </div>
  )
}

export const pct = (n: number | null) => (n === null ? '-' : `${Math.round(n * 100)}%`)
