'use client';

import { useState } from 'react';

type PaymentMethod = 'easypaisa' | 'jazzcash' | 'cod';

interface PaymentStepProps {
  onBack: () => void;
  onComplete: (method: PaymentMethod) => void;
}

export default function PaymentStep({ onBack, onComplete }: PaymentStepProps) {
  const [method, setMethod] = useState<PaymentMethod | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (method) {
      onComplete(method);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-900">Choose Payment Method</h2>

      <div className="space-y-4">
        {/* Easypaisa */}
        <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:border-amber-500 transition-colors">
          <input
            type="radio"
            name="payment"
            value="easypaisa"
            checked={method === 'easypaisa'}
            onChange={() => setMethod('easypaisa')}
            className="w-4 h-4 text-amber-600"
          />
          <div className="ml-4 flex-1">
            <p className="font-medium text-gray-900">Easypaisa</p>
            <p className="text-sm text-gray-500">Pay via Easypaisa mobile account</p>
          </div>
        </label>

        {/* JazzCash */}
        <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:border-amber-500 transition-colors">
          <input
            type="radio"
            name="payment"
            value="jazzcash"
            checked={method === 'jazzcash'}
            onChange={() => setMethod('jazzcash')}
            className="w-4 h-4 text-amber-600"
          />
          <div className="ml-4 flex-1">
            <p className="font-medium text-gray-900">JazzCash</p>
            <p className="text-sm text-gray-500">Pay via JazzCash mobile account</p>
          </div>
        </label>

        {/* Cash on Delivery with 200 PKR advance */}
        <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:border-amber-500 transition-colors">
          <input
            type="radio"
            name="payment"
            value="cod"
            checked={method === 'cod'}
            onChange={() => setMethod('cod')}
            className="w-4 h-4 text-amber-600"
          />
          <div className="ml-4 flex-1">
            <p className="font-medium text-gray-900">Cash on Delivery</p>
            <p className="text-sm text-gray-500">
              Pay 200 PKR advance via Easypaisa/JazzCash, remaining on delivery
            </p>
          </div>
        </label>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm text-amber-800">
          <strong>Note:</strong> For Cash on Delivery, you will be redirected to complete a 200 PKR advance payment via Easypaisa or JazzCash before your order is confirmed.
        </p>
      </div>

      <div className="flex justify-between pt-4">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!method}
          className="bg-gradient-to-r from-amber-600 to-amber-800 text-white px-8 py-3 rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Complete Order
        </button>
      </div>
    </form>
  );
}