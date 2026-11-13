'use client'

import { useState } from 'react'
import { BULK_ACTIONS, BULK_LABEL, type BulkAction } from '@/lib/admin/product-extras'
import { inputCls, primaryBtn } from '@/components/admin/ui'

/** The bar above the product list: tick all, choose an action, apply it to every ticked product. Lives inside the list's form. */
export default function ProductBulkBar() {
  const [action, setAction] = useState<BulkAction | ''>('')
  const tickAll = (on: boolean, el: HTMLElement) => el.closest('form')?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((c) => { c.checked = on })
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 border-b border-slate-200 rounded-t-xl">
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4" aria-label="Select all products on this page" onChange={(e) => tickAll(e.target.checked, e.target)} /> Select all</label>
      <select name="bulkAction" value={action} onChange={(e) => setAction(e.target.value as BulkAction | '')} className={`${inputCls} !w-auto`} aria-label="Action for selected products">
        <option value="">With selected…</option>
        {BULK_ACTIONS.filter((a) => a !== 'category').map((a) => <option key={a} value={a}>{BULK_LABEL[a]}</option>)}
      </select>
      {(action === 'add-tags' || action === 'remove-tags') && <input name="bulkTags" placeholder="summer, gift" maxLength={300} className={`${inputCls} !w-48`} aria-label="Tags, separated by commas" />}
      <button className={primaryBtn} disabled={!action}
        onClick={(e) => { if (action === 'delete' && !window.confirm('Delete the selected products for good? Products that have been ordered are kept.')) e.preventDefault() }}>Apply</button>
    </div>
  )
}
