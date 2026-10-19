import { Minus, Plus } from 'lucide-react';
import MediaImage from '@/components/media/MediaImage';
import { formatPrice } from '@/lib/format';
import type { CheckoutLine } from '@/lib/data/checkout';
import type { Charges } from '@/lib/pricing';

interface Props {
  line: CheckoutLine;
  quantity: number;
  maxQuantity: number;
  onQuantityChange: (q: number) => void;
  charges: Charges;
  currency: string;
  locked: boolean;
}

/** Order summary beside the form. Totals are the same numbers the server will charge. */
export default function OrderSummary({ line, quantity, maxQuantity, onQuantityChange, charges, currency, locked }: Props) {
  return (
    <aside className="bg-white rounded-2xl shadow-xl p-6 lg:sticky lg:top-28" aria-label="Order summary">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Order Summary</h2>

      <div className="flex gap-4 pb-4 border-b border-gray-100">
        <div className="relative w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-amber-100 to-emerald-100 flex items-center justify-center">
          {line.imageUrl
            ? <MediaImage src={line.imageUrl} width={160} alt="" fill sizes="80px" className="object-cover" />
            : <span className="text-3xl" aria-hidden>🫙</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900">{line.productName}</p>
          <p className="text-sm text-gray-500">{line.variantLabel} · {formatPrice(line.unitPrice, currency)}</p>
          <div className="inline-flex items-center border rounded-lg mt-2" role="group" aria-label="Quantity">
            <button type="button" aria-label="Decrease quantity" disabled={locked || quantity <= 1}
              onClick={() => onQuantityChange(quantity - 1)} className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40">
              <Minus className="w-4 h-4" aria-hidden />
            </button>
            <span className="w-9 h-9 flex items-center justify-center font-bold" aria-live="polite">{quantity}</span>
            <button type="button" aria-label="Increase quantity" disabled={locked || quantity >= maxQuantity}
              onClick={() => onQuantityChange(quantity + 1)} className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40">
              <Plus className="w-4 h-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <dl className="space-y-2 py-4 text-sm">
        <div className="flex justify-between"><dt className="text-gray-600">Subtotal</dt><dd>{formatPrice(charges.subtotal, currency)}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-600">Delivery</dt><dd>{charges.delivery === 0 ? 'Free' : formatPrice(charges.delivery, currency)}</dd></div>
        <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-100"><dt>Total</dt><dd>{formatPrice(charges.total, currency)}</dd></div>
        {charges.advance > 0 && (
          <>
            <div className="flex justify-between text-amber-800"><dt>Pay now</dt><dd>{formatPrice(charges.advance, currency)}</dd></div>
            {charges.dueOnDelivery > 0 && <div className="flex justify-between text-gray-600"><dt>Pay on delivery</dt><dd>{formatPrice(charges.dueOnDelivery, currency)}</dd></div>}
          </>
        )}
      </dl>
    </aside>
  );
}
