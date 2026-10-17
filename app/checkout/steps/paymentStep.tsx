'use client';

import { useState } from 'react';
import { formatPrice } from '@/lib/format';
import type { PaymentOption, PaymentMethodCode } from '@/lib/pricing';

interface PaymentStepProps {
  options: PaymentOption[];
  currency: string;
  submitting: boolean;
  error?: string | null;
  fieldError?: string;
  onBack: () => void;
  onSubmit: (method: PaymentMethodCode, transactionId: string) => void;
}

const LABELS: Record<PaymentMethodCode, { title: string; hint: string }> = {
  COD: { title: 'Cash on Delivery', hint: 'Pay in cash when your order arrives' },
  JAZZCASH: { title: 'JazzCash', hint: 'Send the payment from your JazzCash account' },
  EASYPAISA: { title: 'Easypaisa', hint: 'Send the payment from your Easypaisa account' },
};

export default function PaymentStep({ options, currency, submitting, error, fieldError, onBack, onSubmit }: PaymentStepProps) {
  const [method, setMethod] = useState<PaymentMethodCode | null>(options.length === 1 ? options[0].method : null);
  const [transactionId, setTransactionId] = useState('');
  const [touched, setTouched] = useState(false);

  const selected = options.find((o) => o.method === method) ?? null;
  const needsTid = !!selected && selected.method !== 'COD';
  const tidInvalid = needsTid && !/^[A-Za-z0-9]{6,30}$/.test(transactionId.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!selected || tidInvalid || submitting) return;
    onSubmit(selected.method, transactionId.trim());
  };

  if (options.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Payment</h2>
        <p role="alert" className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 p-4">
          This store needs an advance payment, but online payment is not set up yet. Please contact the store to place your order.
        </p>
        <button type="button" onClick={onBack} className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Back</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      <h2 className="text-2xl font-bold text-gray-900">Choose Payment Method</h2>

      <div className="space-y-4" role="radiogroup" aria-label="Payment method">
        {options.map((o) => {
          const label = LABELS[o.method];
          const isCod = o.method === 'COD';
          return (
            <label key={o.method}
              className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                method === o.method ? 'border-amber-600 bg-amber-50' : 'border-gray-200 hover:border-amber-400'
              }`}>
              <input type="radio" name="payment" value={o.method} checked={method === o.method}
                onChange={() => setMethod(o.method)} className="mt-1 w-4 h-4 text-amber-600" />
              <div className="ml-4 flex-1">
                <p className="font-medium text-gray-900">{label.title}</p>
                <p className="text-sm text-gray-500">{label.hint}</p>
                <p className="text-sm text-gray-700 mt-1">
                  {isCod
                    ? <>Pay <strong>{formatPrice(o.charges.total, currency)}</strong> on delivery</>
                    : o.charges.dueOnDelivery > 0
                      ? <>Pay <strong>{formatPrice(o.charges.advance, currency)}</strong> now, <strong>{formatPrice(o.charges.dueOnDelivery, currency)}</strong> on delivery</>
                      : <>Pay <strong>{formatPrice(o.charges.advance, currency)}</strong> now</>}
                </p>
              </div>
            </label>
          );
        })}
      </div>

      {/* Wallet instructions + transaction id */}
      {selected && selected.wallet && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 space-y-4">
          <p className="text-sm text-amber-900">
            1. Open your {LABELS[selected.method].title} app and send <strong>{formatPrice(selected.charges.advance, currency)}</strong> to:
          </p>
          <div className="bg-white rounded-lg p-4 border border-amber-200">
            <p className="text-lg font-bold text-gray-900 tracking-wide">{selected.wallet.accountNumber}</p>
            {selected.wallet.accountTitle && <p className="text-sm text-gray-600">Account title: {selected.wallet.accountTitle}</p>}
          </div>
          <p className="text-sm text-amber-900">2. Enter the Transaction ID (TID) from your payment receipt below. We confirm it before dispatch.</p>
          <div>
            <label htmlFor="tid" className="block text-sm font-medium text-gray-700 mb-1">Transaction ID <span className="text-red-500" aria-hidden>*</span></label>
            <input id="tid" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} onBlur={() => setTouched(true)}
              autoComplete="off" inputMode="text" maxLength={30}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 ${(touched && tidInvalid) || fieldError ? 'border-red-500' : 'border-gray-300'}`}
              placeholder="e.g. 12345678901" />
            {((touched && tidInvalid) || fieldError) && (
              <p className="mt-1 text-sm text-red-600">{fieldError ?? 'Enter the transaction ID from your receipt (6 to 30 letters or digits)'}</p>
            )}
          </div>
        </div>
      )}

      {error && <p role="alert" className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</p>}

      <div className="flex justify-between pt-4">
        <button type="button" onClick={onBack} disabled={submitting}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">Back</button>
        <button type="submit" disabled={!method || submitting}
          className="bg-gradient-to-r from-amber-600 to-amber-800 text-white px-8 py-3 rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
          {submitting ? 'Placing order…' : 'Complete Order'}
        </button>
      </div>
    </form>
  );
}
