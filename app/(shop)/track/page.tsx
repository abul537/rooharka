import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Check, Circle, PackageSearch } from 'lucide-react';
import { getCurrentStore } from '@/lib/store';
import { getCheckoutConfig } from '@/lib/data/checkout';
import { lookupOrder, STATUS_LABEL, STATUS_STEPS, type TrackedOrder } from '@/lib/data/tracking';
import { normalizeTrackingCode } from '@/lib/tracking-code';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { formatPrice } from '@/lib/format';

export const metadata: Metadata = { title: 'Track your order', robots: { index: false } };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ code?: string; last4?: string }> };

function Timeline({ order }: { order: TrackedOrder }) {
  const ended = order.status === 'CANCELLED' || order.status === 'RETURNED';
  const reached = STATUS_STEPS.indexOf(order.status as (typeof STATUS_STEPS)[number]);
  return (
    <ol className="space-y-5">
      {STATUS_STEPS.map((s, i) => {
        const done = !ended && i <= reached;
        const current = !ended && i === reached;
        return (
          <li key={s} className="flex items-center gap-3">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center ${done ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
              {done ? <Check className="w-4 h-4" aria-hidden /> : <Circle className="w-3 h-3" aria-hidden />}
            </span>
            <span className={`${current ? 'font-bold text-gray-900' : done ? 'text-gray-800' : 'text-gray-400'}`}>
              {STATUS_LABEL[s]}{current && <span className="sr-only"> (current status)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default async function TrackPage({ searchParams }: Props) {
  const { code: rawCode = '', last4: rawLast4 = '' } = await searchParams;
  const store = await getCurrentStore();
  const config = store ? await getCheckoutConfig(store) : null;

  let order: TrackedOrder | null = null;
  let message: string | null = null;
  const searched = rawCode.trim().length > 0;

  if (!store || !config) {
    message = 'Order tracking is not available right now.';
  } else if (!config.trackingEnabled) {
    message = 'This store does not offer online order tracking. Please contact the store for updates.';
  } else if (searched) {
    // Guessing codes is slowed down: 15 lookups per 10 minutes per visitor.
    const limit = rateLimit(`track:${clientIp(await headers())}`, 15, 10 * 60 * 1000);
    const code = normalizeTrackingCode(rawCode);
    const last4 = rawLast4.replace(/\D/g, '').slice(-4);
    if (!limit.ok) {
      message = 'Too many attempts. Please wait a few minutes and try again.';
    } else if (!code || (config.trackingRequiresPhoneLast4 && last4.length !== 4)) {
      message = config.trackingRequiresPhoneLast4
        ? 'Please enter your tracking code and the last 4 digits of your phone number.'
        : 'Please enter a valid tracking code (like MP-7K4Q-9XMD).';
    } else {
      order = await lookupOrder(store.id, code, { requirePhoneLast4: config.trackingRequiresPhoneLast4, phoneLast4: last4 });
      if (!order) message = 'We could not find an order with those details. Please check them and try again.';
    }
  }

  const currency = store?.currency ?? 'PKR';
  const showForm = config?.trackingEnabled !== false && !!store;

  return (
    <div className="bg-gradient-to-b from-amber-50 to-white min-h-[70vh] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <PackageSearch className="w-12 h-12 text-amber-700 mx-auto mb-3" aria-hidden />
          <h1 className="font-playfair text-4xl font-bold text-gray-900 mb-2">Track your order</h1>
          <p className="text-gray-600">Enter the tracking code we gave you after checkout.</p>
        </div>

        {showForm && (
          <form method="get" action="/track" className="bg-white rounded-2xl shadow-xl p-6 mb-8 space-y-4">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">Tracking code</label>
              <input id="code" name="code" defaultValue={rawCode} required autoComplete="off" autoCapitalize="characters"
                placeholder="MP-7K4Q-9XMD" className="w-full px-4 py-3 border border-gray-300 rounded-lg tracking-widest uppercase focus:ring-2 focus:ring-amber-500" />
            </div>
            {config?.trackingRequiresPhoneLast4 && (
              <div>
                <label htmlFor="last4" className="block text-sm font-medium text-gray-700 mb-1">Last 4 digits of your phone number</label>
                <input id="last4" name="last4" defaultValue={rawLast4} required inputMode="numeric" pattern="\d{4}" maxLength={4}
                  placeholder="4567" className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500" />
              </div>
            )}
            <button type="submit" className="w-full bg-gradient-to-r from-amber-600 to-amber-800 text-white py-3 rounded-lg font-semibold">Track order</button>
          </form>
        )}

        {message && <p role="alert" className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 p-4 text-center">{message}</p>}

        {order && (
          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 space-y-8">
            <div>
              <p className="text-sm text-gray-500">Order #{order.number} · placed {order.placedAt}</p>
              <h2 className="text-2xl font-bold text-gray-900 mt-1">Hello {order.customerLabel}</h2>
              <p className="text-gray-600">Delivering to {order.city}</p>
            </div>

            {order.status === 'CANCELLED' || order.status === 'RETURNED' ? (
              <p className="rounded-lg bg-red-50 border border-red-200 text-red-800 p-4 font-medium">This order was {STATUS_LABEL[order.status].toLowerCase()}.</p>
            ) : null}
            <Timeline order={order} />

            {order.courier && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm">
                <p className="font-medium text-emerald-900">With courier: {order.courier.name}</p>
                {order.courier.trackingNo && <p className="text-emerald-800">Courier tracking number: <span className="font-mono">{order.courier.trackingNo}</span></p>}
                {order.courier.link && <p><a href={order.courier.link} target="_blank" rel="noopener noreferrer" className="text-emerald-900 underline">Track on the courier’s website</a></p>}
              </div>
            )}

            <div>
              <h3 className="font-bold text-gray-900 mb-2">Items</h3>
              <ul className="divide-y divide-gray-100">
                {order.items.map((it, i) => (
                  <li key={i} className="py-2 flex justify-between text-sm">
                    <span>{it.name}{it.variantLabel ? ` (${it.variantLabel})` : ''}</span>
                    <span className="text-gray-600">× {it.quantity}</span>
                  </li>
                ))}
              </ul>
              <p className="flex justify-between font-bold text-gray-900 pt-3 mt-1 border-t border-gray-100">
                <span>Total</span><span>{formatPrice(order.total, currency)}</span>
              </p>
              <p className="text-sm text-gray-600 mt-1">{order.paymentNote}</p>
            </div>

            {order.timeline.length > 0 && (
              <div>
                <h3 className="font-bold text-gray-900 mb-3">Updates</h3>
                <ul className="space-y-3 text-sm">
                  {[...order.timeline].reverse().map((t, i) => (
                    <li key={i} className="border-l-2 border-amber-300 pl-4">
                      <p className="font-medium text-gray-900">{t.note ?? t.label}</p>
                      <p className="text-gray-500">{t.at}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
