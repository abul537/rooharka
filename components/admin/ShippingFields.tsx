'use client'

import { useState } from 'react'
import { Field, inputCls } from '@/components/admin/ui'

/**
 * "This is a physical product": when unticked (a service or a digital item) the weight unit, origin and customs
 * fields are hidden and cleared by the server. Origin country and HS code sit in a closed "International shipping"
 * section, because most local shops never need them.
 */
export default function ShippingFields({ requiresShipping, weightUnit, typedIn, originCountry, hsCode, countries }: {
  requiresShipping: boolean; weightUnit: string
  /** Edit form: the unit the weights on this page are currently shown in (they are read back in that unit). */
  typedIn?: string
  originCountry: string; hsCode: string; countries: { code: string; name: string }[]
}) {
  const [physical, setPhysical] = useState(requiresShipping)
  return (
    <div className="grid gap-4">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="requiresShipping" checked={physical} onChange={(e) => setPhysical(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>This is a physical product<span className="block text-xs text-slate-500">Untick for services or digital items that are not shipped.</span></span>
      </label>
      {typedIn && <input type="hidden" name="weightUnit" value={typedIn} />}
      {physical && (
        <>
          <Field label="Weight unit" hint={typedIn ? `Weights on this page are shown in ${typedIn}. Choose another unit and save to see them in that unit; the stored weight does not change.` : 'The unit you type weights in. Stored exactly, in grams.'}>
            <select name={typedIn ? 'weightUnitNext' : 'weightUnit'} defaultValue={weightUnit} className={inputCls}><option value="g">Grams (g)</option><option value="kg">Kilograms (kg)</option><option value="lb">Pounds (lb)</option></select>
          </Field>
          <details className="rounded-lg border border-slate-200 p-3" open={!!(originCountry || hsCode)}>
            <summary className="cursor-pointer text-sm font-medium">International shipping (optional)</summary>
            <div className="grid gap-4 mt-3">
              <Field label="Country of origin" hint="Where the product was made.">
                <select name="originCountry" defaultValue={originCountry} className={inputCls}><option value="">Not set</option>{countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select>
              </Field>
              <Field label="HS code" hint="The customs code, 6 to 10 digits, e.g. 6109.10. Only needed when you ship abroad."><input name="hsCode" defaultValue={hsCode} maxLength={13} className={`${inputCls} font-mono`} /></Field>
            </div>
          </details>
        </>
      )}
    </div>
  )
}
