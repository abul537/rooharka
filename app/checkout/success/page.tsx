import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { db } from '@/lib/db';
import { getCurrentStore } from '@/lib/store';
import { normalizeTrackingCode } from '@/lib/tracking-code';
import { formatPrice } from '@/lib/format';
import CopyCode from './CopyCode';

export const metadata: Metadata = { title: 'Order placed', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code: raw } = await searchParams;
  const code = raw ? normalizeTrackingCode(raw) : null;
  const store = await getCurrentStore();
  if (!code || !store) notFound();

  // Only non-personal facts are shown here: no name, phone or address.
  const order = await db.order.findFirst({
    where: { storeId: store.id, trackingCode: code },
    select: {
      number: true, total: true,
      payments: { select: { method: true, purpose: true, status: true, amount: true }, orderBy: { createdAt: 'asc' }, take: 1 },
    },
  });
  if (!order) notFound();

  const payment = order.payments[0];
  const awaiting = payment && payment.method !== 'COD';

  return (
    <div className="bg-gradient-to-b from-amber-50 to-white min-h-[70vh] py-16 px-4">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-xl p-8 text-center">
        <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" aria-hidden />
        <h1 className="font-playfair text-3xl font-bold text-gray-900 mb-2">Thank you! Your order is placed</h1>
        <p className="text-gray-600 mb-6">Order #{order.number} · {formatPrice(order.total.toNumber(), store.currency)}</p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <p className="text-sm text-amber-900 mb-1">Your tracking code</p>
          <p className="text-3xl font-bold tracking-widest text-gray-900 mb-2" data-testid="tracking-code">{code}</p>
          <CopyCode code={code} />
          <p className="text-xs text-amber-900 mt-3">Save this code. You can use it any time to see your order status.</p>
        </div>

        {awaiting && (
          <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-4 mb-6">
            We will confirm your payment shortly. Your order is dispatched once it is confirmed.
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href={`/track?code=${encodeURIComponent(code)}`} className="bg-gradient-to-r from-amber-600 to-amber-800 text-white px-6 py-3 rounded-lg font-semibold">
            Track my order
          </Link>
          <Link href="/" className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Back to home</Link>
        </div>
      </div>
    </div>
  );
}
