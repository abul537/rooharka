import type { ReactNode } from 'react'

export const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white'
export const primaryBtn = 'rounded-lg bg-slate-900 text-white px-5 py-2 text-sm font-medium disabled:opacity-50'

export function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-white border border-slate-200 p-5 sm:p-6">
      <h2 className="font-semibold text-lg">{title}</h2>
      {hint && <p className="text-sm text-slate-600 mt-1 mb-4">{hint}</p>}
      <div className={hint ? '' : 'mt-4'}>{children}</div>
    </section>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}
    </label>
  )
}

export function Check({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4" />
      <span>{label}{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
    </label>
  )
}
