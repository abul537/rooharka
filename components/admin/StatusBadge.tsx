import { label } from '@/lib/admin/order-rules'

const COLORS: Record<string, string> = {
  PLACED: 'bg-amber-100 text-amber-800', CONFIRMED: 'bg-blue-100 text-blue-800', PACKED: 'bg-indigo-100 text-indigo-800',
  SHIPPED: 'bg-violet-100 text-violet-800', OUT_FOR_DELIVERY: 'bg-violet-100 text-violet-800',
  DELIVERED: 'bg-emerald-100 text-emerald-800', CANCELLED: 'bg-slate-200 text-slate-700', RETURNED: 'bg-red-100 text-red-800',
  UNPAID: 'bg-slate-100 text-slate-700', PARTIALLY_PAID: 'bg-amber-100 text-amber-800', PAID: 'bg-emerald-100 text-emerald-800', REFUNDED: 'bg-slate-200 text-slate-700',
}
export default function StatusBadge({ status }: { status: string }) {
  const text = COLORS[status] ? (label(status) !== status ? label(status) : status.replace(/_/g, ' ').toLowerCase()) : status
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${COLORS[status] ?? 'bg-slate-100 text-slate-700'}`}>{text}</span>
}
