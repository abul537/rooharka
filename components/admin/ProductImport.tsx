'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { importProductsAction, type ImportAnswer } from '@/app/admin/(panel)/products/import/actions'
import { IMPORT_MAX_BYTES } from '@/lib/admin/product-import'
import { primaryBtn } from '@/components/admin/ui'

/** Choose a CSV file, see what it would do, then confirm. The file is read in the browser and checked on the server twice. */
export default function ProductImport() {
  const router = useRouter()
  const [text, setText] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [answer, setAnswer] = useState<ImportAnswer | null>(null)
  const [busy, start] = useTransition()
  const input = useRef<HTMLInputElement>(null)

  const run = (body: string, apply: boolean) => start(async () => {
    const r = await importProductsAction(body, apply).catch((): ImportAnswer => ({ summary: '', problems: [], updates: 0, creates: 0, done: false, error: 'Could not reach the server. Please try again.' }))
    setAnswer(r)
    if (r.done && !r.error) { setText(null); if (input.current) input.current.value = ''; router.refresh() }
  })
  async function choose(file: File | undefined) {
    setAnswer(null); setText(null)
    if (!file) return
    setName(file.name)
    if (file.size > IMPORT_MAX_BYTES) return setAnswer({ summary: '', problems: [], updates: 0, creates: 0, done: false, error: 'The file is larger than 1 MB. Split it into smaller files.' })
    const body = await file.text()
    setText(body); run(body, false)
  }
  const ready = !!text && !!answer && !answer.error && !answer.done && answer.updates + answer.creates > 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} id="import-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} disabled={busy} />
        <label htmlFor="import-file" className={`cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 ${busy ? 'pointer-events-none opacity-50' : ''}`}>{text ? 'Choose another file' : 'Choose a CSV file'}</label>
        {name && <span className="text-sm text-slate-600">{name}</span>}
        {busy && <span className="text-sm text-slate-500" role="status">Working…</span>}
      </div>
      {answer?.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{answer.error}</p>}
      {answer && !answer.error && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${answer.done ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-slate-50'}`} role="status">
          <p className="font-medium">{answer.done ? 'Done: ' : 'This file: '}{answer.summary}</p>
          {answer.problems.length > 0 && (
            <>
              <p className="mt-2 text-amber-900">{answer.problems.length} row{answer.problems.length === 1 ? ' was' : 's were'} left out:</p>
              <ul className="mt-1 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-amber-900">{answer.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </>
          )}
        </div>
      )}
      {ready && <button type="button" disabled={busy} onClick={() => { if (window.confirm('Apply these changes to your products?')) run(text!, true) }} className={primaryBtn}>Import now</button>}
    </div>
  )
}
