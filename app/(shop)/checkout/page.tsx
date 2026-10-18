import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentStore } from '@/lib/store';
import { getCheckoutConfig, getCheckoutLine } from '@/lib/data/checkout';
import CheckoutFlow from './CheckoutFlow';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ variant?: string; qty?: string }> };

export default async function CheckoutPage({ searchParams }: Props) {
  const { variant, qty } = await searchParams;
  const store = await getCurrentStore();
  if (!store || !variant) redirect('/product');

  // The URL only says WHICH size and how many. Name, price and stock are read from the database.
  const line = await getCheckoutLine(store.id, variant);
  if (!line) redirect('/product');
  const config = await getCheckoutConfig(store);

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
        />
      </div>
    </div>
  );
}
