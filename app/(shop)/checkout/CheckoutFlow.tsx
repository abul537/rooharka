'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AddressFormData } from '@/lib/types';
import type { CheckoutConfig, CheckoutLine } from '@/lib/data/checkout';
import { buildPaymentOptions, computeCharges, type PaymentMethodCode } from '@/lib/pricing';
import AddressStep from './steps/addressStep';
import PaymentStep from './steps/paymentStep';
import StepIndicator from '@/components/checkout/stepIndicator';
import OrderSummary from '@/components/checkout/OrderSummary';

interface Props {
  config: Pick<CheckoutConfig, 'currency' | 'fields' | 'pricing'>;
  line: CheckoutLine;
  initialQuantity: number;
  maxQuantity: number;
}

const STEPS = ['Address', 'Payment'];

export default function CheckoutFlow({ config, line, initialQuantity, maxQuantity }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [address, setAddress] = useState<AddressFormData | null>(null);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // One key per checkout attempt: if the request is sent twice (double click, retry), the server returns the same order.
  const idempotencyKey = useRef(crypto.randomUUID());

  const subtotal = line.unitPrice * quantity;
  const options = useMemo(() => buildPaymentOptions(config.pricing, subtotal), [config.pricing, subtotal]);
  // The summary shows the first/only option's split, or the plain total until a method is chosen.
  const summaryCharges = options.length === 1 ? options[0].charges : computeCharges(config.pricing, subtotal, 'COD');

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
          items: [{ variantId: line.variantId, quantity }],
          customer: { firstName: address.firstName, lastName: address.lastName, email: address.email, phone: address.phone },
          address: { provinceId: address.provinceId, cityId: address.cityId, localityId: address.localityId, landmark: address.landmark, addressType: address.addressType },
          paymentMethod: method,
          transactionId: method === 'COD' ? undefined : transactionId,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.replace(`/checkout/success?code=${encodeURIComponent(data.trackingCode)}`);
        return; // keep the button disabled while navigating
      }
      setError(data.error ?? 'Something went wrong. Please try again.');
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
                initialData={address ?? undefined}
                serverErrors={fieldErrors}
                onNext={(data) => { setAddress(data); setError(null); setFieldErrors({}); setStep(2); }}
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

      <OrderSummary line={line} quantity={quantity} maxQuantity={maxQuantity} onQuantityChange={setQuantity}
        charges={summaryCharges} currency={config.currency} locked={submitting} />
    </div>
  );
}
