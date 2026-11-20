'use client';

import { useT } from '@/components/shop/Lang'
import { useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import MediaImage from '@/components/media/MediaImage';
import { formatPrice } from '@/lib/format';
import type { CheckoutEntry } from '@/lib/data/checkout';
import type { Charges } from '@/lib/pricing';
import { stepQuantity } from '@/lib/units/quantity';
import { formatQuantity, perUnit } from '@/lib/units/registry';
import type { AppliedDiscount } from '@/app/(shop)/checkout/CheckoutFlow';

interface Props {
  entries: CheckoutEntry[];
  onQuantityChange: (variantId: string, q: number) => void;
  onRemove: (variantId: string) => void;
  discount: AppliedDiscount | null;
  /** The code is applied but the order is now too small for it. */
  discountShort: boolean;
  onDiscount: (d: AppliedDiscount | null) => void;
  subtotal: number;
  charges: Charges;
  currency: string;
  locked: boolean;
  /** False when the shop's plan has no discount codes: the box is not shown. */
  codesOn?: boolean;
}

/** Order summary beside the form: every line, a place for a discount code, and totals that are the same numbers the server will charge. */
export default function OrderSummary({ entries, onQuantityChange, onRemove, discount, discountShort, onDiscount, subtotal, charges, currency, locked, codesOn = true }: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const tr = useT()

  async function apply() {
    if (!code.trim() || busy) return;
    setBusy(true); setProblem(null);
    try {
      const r = await fetch('/api/discount', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, subtotal }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { onDiscount(d as AppliedDiscount); setCode(''); } else setProblem(d.error ?? tr('That discount code is not valid.'));
    } catch { setProblem(tr('Could not check the code. Please try again.')); }
    setBusy(false);
  }

  return (
    <aside className="bg-white rounded-2xl shadow-xl p-6 lg:sticky lg:top-28" aria-label="Order summary">
      <h2 className="text-xl font-bold text-gray-900 mb-4">{tr('Order Summary')}</h2>

      <ul className="divide-y divide-gray-100 border-b border-gray-100">
        {entries.map(({ line, rule, quantity }) => (
          <li key={line.variantId} className="flex gap-4 py-4 first:pt-0">
            <div className="relative w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-brand-100 to-emerald-100 flex items-center justify-center">
              {line.imageUrl
                ? <MediaImage src={line.imageUrl} width={160} alt="" fill sizes="80px" className="object-cover" />
                : <span className="text-3xl" aria-hidden>🫙</span>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-gray-900">{line.productName}</p>
                {entries.length > 1 && <button type="button" disabled={locked} onClick={() => onRemove(line.variantId)} aria-label={`Remove ${line.productName}`} className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-700 disabled:opacity-40"><X className="h-4 w-4" aria-hidden /></button>}
              </div>
              <p className="text-sm text-gray-500">{line.variantLabel} · {formatPrice(line.unitPrice, currency)}{perUnit(line.unitCode) ? ` ${perUnit(line.unitCode)}` : ''}</p>
              <div className="inline-flex items-center border rounded-lg mt-2" role="group" aria-label={`Quantity of ${line.productName}`}>
                <button type="button" aria-label="Decrease quantity" disabled={locked || quantity <= rule.min}
                  onClick={() => onQuantityChange(line.variantId, stepQuantity(rule, quantity, -1))} className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                  <Minus className="w-4 h-4" aria-hidden />
                </button>
                <span className="min-w-9 h-9 px-1 flex items-center justify-center font-bold text-sm" aria-live="polite">{rule.measured || rule.unit ? formatQuantity(quantity, line.unitCode) : quantity}</span>
                <button type="button" aria-label="Increase quantity" disabled={locked || quantity >= stepQuantity(rule, Number.MAX_SAFE_INTEGER, 1)}
                  onClick={() => onQuantityChange(line.variantId, stepQuantity(rule, quantity, 1))} className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                  <Plus className="w-4 h-4" aria-hidden />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="border-b border-gray-100 py-4">
        {!codesOn && !discount ? null : discount ? (
          <div className="text-sm">
            <p className="flex items-center justify-between gap-2"><span className="font-medium text-emerald-800">Code {discount.code}: {discount.text}</span><button type="button" disabled={locked} onClick={() => onDiscount(null)} className="text-gray-500 underline disabled:opacity-40">Remove</button></p>
            {discountShort && <p role="alert" className="mt-1 text-amber-800">This code needs an order of at least {formatPrice(discount.minSubtotal, currency)}, so it is not applied.</p>}
          </div>
        ) : (
          <div>
            <label htmlFor="discount-code" className="text-sm font-medium text-gray-700">{tr('Discount code')}</label>
            <div className="mt-1 flex gap-2">
              <input id="discount-code" value={code} onChange={(e) => { setCode(e.target.value); setProblem(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void apply(); } }} maxLength={24} autoCapitalize="characters" autoComplete="off" disabled={locked} className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase" />
              <button type="button" onClick={apply} disabled={locked || busy || !code.trim()} className="shrink-0 rounded-lg border border-brand-700 px-4 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50 disabled:opacity-40">{busy ? 'Checking…' : 'Apply'}</button>
            </div>
            {problem && <p role="alert" className="mt-1 text-sm text-red-700">{problem}</p>}
          </div>
        )}
      </div>

      <dl className="space-y-2 py-4 text-sm">
        <div className="flex justify-between"><dt className="text-gray-600">{tr('Subtotal')}</dt><dd>{formatPrice(charges.subtotal, currency)}</dd></div>
        {charges.discount > 0 && <div className="flex justify-between text-emerald-800"><dt>{tr('Discount')}</dt><dd>- {formatPrice(charges.discount, currency)}</dd></div>}
        <div className="flex justify-between"><dt className="text-gray-600">{tr('Delivery')}</dt><dd>{charges.delivery === 0 ? tr('Free') : formatPrice(charges.delivery, currency)}</dd></div>
        <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t border-gray-100"><dt>{tr('Total')}</dt><dd>{formatPrice(charges.total, currency)}</dd></div>
        {charges.advance > 0 && (
          <>
            <div className="flex justify-between text-brand-800"><dt>{tr('Pay now')}</dt><dd>{formatPrice(charges.advance, currency)}</dd></div>
            {charges.dueOnDelivery > 0 && <div className="flex justify-between text-gray-600"><dt>{tr('Pay on delivery')}</dt><dd>{formatPrice(charges.dueOnDelivery, currency)}</dd></div>}
          </>
        )}
      </dl>
    </aside>
  );
}
