import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { otpCookieName, verifiedPhone } from '@/lib/otp/service';
import { getCurrentStore } from '@/lib/store';
import { getCheckoutConfig, loadCheckoutEntries } from '@/lib/data/checkout';
import { itemsParam, readItems } from '@/lib/cart';
import CheckoutFlow from './CheckoutFlow';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false } };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ items?: string; variant?: string; qty?: string }> };

export default async function CheckoutPage({ searchParams }: Props) {
  const sp = await searchParams;
  const store = await getCurrentStore();
  // The address only says WHICH sizes and how many (a whole cart, or one product from "Order now").
  const items = readItems(sp);
  if (!store) redirect('/shop');
  if (items.length === 0) redirect('/cart');
  const fromCart = !!sp.items;

  // Names, prices, stock and how much may be bought are read from the database, never from the address.
  const config = await getCheckoutConfig(store);
  const { entries, dropped } = await loadCheckoutEntries(store.id, config.maxQuantity, items);
  const param = itemsParam(entries.map((e) => ({ variantId: e.line.variantId, quantity: e.quantity })));

  // Phone verification is the store owner's choice. When on, nobody reaches the form without a verified phone
  // (and /api/orders checks it again, so this redirect is convenience, not the only lock).
  let phone: string | undefined;
  if (config.phoneVerification && entries.length > 0) {
    const verified = verifiedPhone((await cookies()).get(otpCookieName())?.value, store.id);
    if (!verified) redirect(`/verify?items=${encodeURIComponent(param)}`);
    phone = verified.startsWith('+92') ? `0${verified.slice(3)}` : verified;
  }

  if (entries.length === 0) {
    return (
      <div className="container mx-auto px-4 py-32 text-center">
        <h1 className="font-playfair text-4xl font-bold text-gray-900 mb-4">Sold out</h1>
        <p className="text-gray-600">Sorry, {items.length === 1 ? 'this product is' : 'these products are'} not available right now.</p>
        <Link href="/shop" className="mt-8 inline-flex rounded-xl bg-brand-700 px-7 py-3.5 font-semibold text-white hover:bg-brand-800">Browse the shop</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white pt-8 pb-20">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-8">
          <h1 className="font-playfair text-4xl md:text-5xl font-bold text-gray-900 mb-2">Checkout</h1>
          <p className="text-gray-600">{entries.length === 1 ? `Complete your order for ${entries[0].line.productName}` : `Complete your order of ${entries.length} items`}</p>
          {dropped > 0 && <p role="status" className="mx-auto mt-4 max-w-md rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{dropped} item{dropped === 1 ? ' is' : 's are'} no longer available and {dropped === 1 ? 'was' : 'were'} left out.</p>}
        </div>
        <CheckoutFlow
          config={{ currency: config.currency, fields: config.fields, pricing: config.pricing }}
          entries={entries}
          fromCart={fromCart}
          verifiedPhone={phone}
        />
      </div>
    </div>
  );
}
