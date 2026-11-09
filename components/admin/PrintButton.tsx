'use client'
/** Opens the browser's print dialog. Hidden on paper. */
export default function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="mt-4 w-full rounded-lg bg-slate-900 text-white py-2 text-sm font-sans print:hidden">Print</button>
}
