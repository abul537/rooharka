'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AddressFormData } from '@/lib/types';
import type { CheckoutConfig, CheckoutEntry } from '@/lib/data/checkout';
import { discountCut, type DiscountKind } from '@/lib/discounts';
import { CART_KEY, itemsParam } from '@/lib/cart';
import { track } from '@/lib/pixels-client';
import { buildPaymentOptions, computeCharges, type PaymentMethodCode } from '@/lib/pricing';
import AddressStep from './steps/addressStep';
import PaymentStep from './steps/paymentStep';
import StepIndicator from '@/components/checkout/stepIndicator';
import OrderSummary from '@/components/checkout/OrderSummary';
import { lineTotal } from '@/lib/units/quantity';

interface Props {
  config: Pick<CheckoutConfig, 'currency' | 'fields' | 'pricing'>;
  /** What is being bought: one line from "Order now", or the lines of the cart. Prices come from the server. */
  entries: CheckoutEntry[];
  /** True when the customer came from the cart (it is emptied once the order is placed). */
  fromCart: boolean;
  /** Set when the store requires phone verification: the verified number in local form (03XXXXXXXXX). */
  verifiedPhone?: string;
}

const STEPS = ['Address', 'Payment'];

// crypto.randomUUID only exists on https / localhost; fall back so testing on a phone over Wi-Fi still works.
function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/** A discount code the shop accepted, as much of it as the page needs to show the saving. The server judges it again. */
export interface AppliedDiscount { code: string; kind: DiscountKind; value: number; minSubtotal: number; text: string }

export default function CheckoutFlow({ config, entries, fromCart, verifiedPhone }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [address, setAddress] = useState<AddressFormData | null>(null);
  const [lines, setLines] = useState(entries);
  const [discount, setDiscount] = useState<AppliedDiscount | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // One key per checkout attempt: if the request is sent twice (double click, retry), the server returns the same order.
  const idempotencyKey = useRef<string>('');
  if (!idempotencyKey.current) idempotencyKey.current = newKey();

  const subtotal = lines.reduce((sum, e) => sum + lineTotal(e.line.unitPrice, e.quantity, e.line.unitCode), 0);
  // A code that needs a larger order stops counting when the customer lowers the quantity (and says why).
  const discountShort = !!discount && subtotal < discount.minSubtotal;
  const cut = discount && !discountShort ? discountCut(discount, subtotal) : null;
  const options = useMemo(() => buildPaymentOptions(config.pricing, subtotal, cut), [config.pricing, subtotal, cut?.amount, cut?.freeDelivery]); // eslint-disable-line react-hooks/exhaustive-deps
  // The summary shows the first/only option's split, or the plain total until a method is chosen.
  const summaryCharges = options.length === 1 ? options[0].charges : computeCharges(config.pricing, subtotal, 'COD', cut);
  const items = lines.map((e) => ({ variantId: e.line.variantId, quantity: e.quantity }));
  useEffect(() => { track('InitiateCheckout', { value: subtotal, currency: config.currency }) }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function placeOrder(method: PaymentMethodCode, transactionId: string) {
    if (!address) return;
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          discountCode: discount && !discountShort ? discount.code : undefined,
          customer: { firstName: address.firstName, lastName: address.lastName, email: address.email, phone: address.phone },
          address: { provinceId: address.provinceId, cityId: address.cityId, localityId: address.localityId, landmark: address.landmark, addressType: address.addressType },
          paymentMethod: method,
          transactionId: method === 'COD' ? undefined : transactionId,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (fromCart) { try { window.localStorage.removeItem(CART_KEY) } catch { /* nothing to clear */ } }
        track('Purchase', { value: data.total, currency: config.currency, orderId: data.number });
        router.replace(`/checkout/success?code=${encodeURIComponent(data.trackingCode)}`);
        return; // keep the button disabled while navigating
      }
      if (data.code === 'PHONE_NOT_VERIFIED') {
        // The verification expired (or was never done): send the customer back to verify, keeping their choice.
        router.replace(`/verify?items=${encodeURIComponent(itemsParam(items))}`);
        return;
      }
      setError(data.error ?? 'Something went wrong. Please try again.');
      if (data.code === 'BAD_DISCOUNT') setDiscount(null); // the code stopped working: the totals go back to normal
      if (data.fields) {
        setFieldErrors(data.fields);
        // If the problem is in the address, send the customer back to fix it.
        if (Object.keys(data.fields).some((k) => k !== 'paymentMethod' && k !== 'transactionId')) setStep(1);
      }
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    }
    setSubmitting(false);
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start">
      <div>
        <StepIndicator currentStep={step} steps={STEPS} />
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
          {step === 1 && (
            <>
              {error && <p role="alert" className="mb-6 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</p>}
              <AddressStep
                fields={config.fields}
                initialData={address ?? (verifiedPhone ? { phone: verifiedPhone } : undefined)}
                phoneLocked={!!verifiedPhone}
                serverErrors={fieldErrors}
                onNext={(data) => {
                  setAddress(data); setError(null); setFieldErrors({}); setStep(2);
                  // The shop remembers a checkout that got this far, so the owner can help if no order follows. Never waited for.
                  try { void fetch('/api/checkout/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: JSON.stringify({ phone: data.phone, name: `${data.firstName} ${data.lastName ?? ''}`.trim(), items }) }).catch(() => {}) } catch { /* ignore */ }
                }}
              />
            </>
          )}
          {step === 2 && (
            <PaymentStep
              options={options}
              currency={config.currency}
              submitting={submitting}
              error={error}
              fieldError={fieldErrors.transactionId}
              onBack={() => setStep(1)}
              onSubmit={placeOrder}
            />
          )}
        </div>
      </div>

      <OrderSummary
        entries={lines}
        onQuantityChange={(variantId, quantity) => setLines((all) => all.map((e) => (e.line.variantId === variantId ? { ...e, quantity } : e)))}
        onRemove={(variantId) => setLines((all) => (all.length > 1 ? all.filter((e) => e.line.variantId !== variantId) : all))}
        discount={discount} discountShort={discountShort} onDiscount={setDiscount} subtotal={subtotal}
        charges={summaryCharges} currency={config.currency} locked={submitting} />
    </div>
  );
}
