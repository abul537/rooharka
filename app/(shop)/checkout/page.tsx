import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { otpCookieName, verifiedPhone } from '@/lib/otp/service';
import { getCurrentStore } from '@/lib/store';
import { getCheckoutConfig, getCheckoutLine } from '@/lib/data/checkout';
import CheckoutFlow from './CheckoutFlow';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ variant?: string; qty?: string }> };

export default async function CheckoutPage({ searchParams }: Props) {
  const { variant, qty } = await searchParams;
  const store = await getCurrentStore();
  if (!store || !variant) redirect('/shop');

  // The URL only says WHICH size and how many. Name, price and stock are read from the database.
  const [line, config] = await Promise.all([getCheckoutLine(store.id, variant), getCheckoutConfig(store)]);
  if (!line) redirect('/shop');

  // Phone verification is the store owner's choice. When on, nobody reaches the form without a verified phone
  // (and /api/orders checks it again, so this redirect is convenience, not the only lock).
  let phone: string | undefined;
  if (config.phoneVerification) {
    const verified = verifiedPhone((await cookies()).get(otpCookieName())?.value, store.id);
    if (!verified) redirect(`/verify?variant=${encodeURIComponent(variant)}&qty=${encodeURIComponent(qty ?? '1')}`);
    phone = verified.startsWith('+92') ? `0${verified.slice(3)}` : verified;
  }

  const maxQuantity = Math.max(1, Math.min(config.maxQuantity, line.trackStock ? line.stock : config.maxQuantity));
  const initialQuantity = Math.min(maxQuantity, Math.max(1, parseInt(qty ?? '1', 10) || 1));

  if (line.trackStock && line.stock <= 0) {
    return (
      <div className="container mx-auto px-4 py-32 text-center">
        <h1 className="font-playfair text-4xl font-bold text-gray-900 mb-4">Sold out</h1>
        <p className="text-gray-600">Sorry, {line.productName} ({line.variantLabel}) is currently out of stock.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white pt-8 pb-20">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-8">
          <h1 className="font-playfair text-4xl md:text-5xl font-bold text-gray-900 mb-2">Checkout</h1>
          <p className="text-gray-600">Complete your order for {line.productName}</p>
        </div>
        <CheckoutFlow
          config={{ currency: config.currency, fields: config.fields, pricing: config.pricing }}
          line={line}
          initialQuantity={initialQuantity}
          maxQuantity={maxQuantity}
          verifiedPhone={phone}
        />
      </div>
    </div>
  );
}
