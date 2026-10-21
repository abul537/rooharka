import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentStore } from '@/lib/store';
import { loadOtpSettings, otpCookieName, verifiedPhone } from '@/lib/otp/service';
import VerifyFlow from './VerifyFlow';

export const metadata: Metadata = { title: 'Verify your number', robots: { index: false } };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ variant?: string; qty?: string }> };

export default async function VerifyPage({ searchParams }: Props) {
  const { variant, qty } = await searchParams;
  const store = await getCurrentStore();
  if (!store) redirect('/shop');

  // Only the checkout address is user-controlled here, and it is rebuilt from two values, never copied.
  const next = variant ? `/checkout?variant=${encodeURIComponent(variant)}&qty=${encodeURIComponent(qty ?? '1')}` : '/shop';
  const settings = await loadOtpSettings(store.id);
  if (!settings?.enabled) redirect(next); // the store does not use verification (any more)
  if (variant && verifiedPhone((await cookies()).get(otpCookieName())?.value, store.id)) redirect(next);

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white pt-10 pb-20">
      <div className="container mx-auto px-4 max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-playfair text-3xl md:text-4xl font-bold text-gray-900 mb-2">Verify your number</h1>
          <p className="text-gray-600">
            To keep orders genuine, {settings.storeName} sends a code to your {settings.channel === 'WHATSAPP' ? 'WhatsApp' : 'mobile'} before checkout.
          </p>
        </div>
        <VerifyFlow next={next} length={settings.length} />
      </div>
    </div>
  );
}
