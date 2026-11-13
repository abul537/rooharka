'use client'

import { useState } from 'react'
import { Field, inputCls } from '@/components/admin/ui'

/** Search-engine title, description and page address, with a live preview of how the product may look in Google. */
export default function SeoFields({ name, shortDescription, seoTitle, seoDescription, slug, host, editableSlug }: { name: string; shortDescription: string; seoTitle: string; seoDescription: string; slug: string; host: string; editableSlug: boolean }) {
  const [t, setT] = useState(seoTitle), [d, setD] = useState(seoDescription), [s, setS] = useState(slug)
  const count = (v: string, max: number) => <span className={v.length > max ? 'text-red-700' : ''}>{v.length} of {max} characters used</span>
  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" aria-label="Search result preview">
        <p className="text-xs text-slate-500 truncate">{host}/product/{s || slug}</p>
        <p className="text-blue-800 text-base truncate">{t || name}</p>
        <p className="text-sm text-slate-600 line-clamp-2">{d || shortDescription || 'Add a description to see how this product might appear in a search engine listing.'}</p>
      </div>
      <Field label="Search engine title" hint="Leave empty to use the product name."><input name="seoTitle" value={t} onChange={(e) => setT(e.target.value)} maxLength={70} className={inputCls} /><span className="block text-xs text-slate-500 mt-1">{count(t, 70)}</span></Field>
      <Field label="Search engine description" hint="Leave empty to use the short description."><textarea name="seoDescription" value={d} onChange={(e) => setD(e.target.value)} maxLength={160} rows={2} className={inputCls} /><span className="block text-xs text-slate-500 mt-1">{count(d, 160)}</span></Field>
      <Field label="Page address" hint={editableSlug ? 'Lowercase letters, digits and dashes. Changing it breaks links people already shared, so change it only when needed.' : 'Made from the name if empty, e.g. rose-water'}>
        <input name="slug" value={s} onChange={(e) => setS(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'))} maxLength={60} required={editableSlug} className={`${inputCls} font-mono`} />
      </Field>
    </div>
  )
}
