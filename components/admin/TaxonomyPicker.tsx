'use client'

import { useRef, useState } from 'react'
import { searchTaxonomyAction } from '@/app/admin/(panel)/products/taxonomy-actions'
import { inputCls } from '@/components/admin/ui'

/**
 * Category from the standard Google list: type a word ("shirt"), pick from the matches. Only the id is trusted by
 * the server (it looks the path up again in the official list); the path here is for display and for the AI writer.
 */
export default function TaxonomyPicker({ id, path }: { id: number | null; path: string }) {
  const [chosen, setChosen] = useState<{ id: number; path: string } | null>(id ? { id, path } : null)
  const [results, setResults] = useState<{ id: number; path: string }[]>([])
  const [note, setNote] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(0)

  function search(q: string) {
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) { setResults([]); setNote(''); return }
    timer.current = setTimeout(async () => {
      const turn = ++latest.current
      const r = await searchTaxonomyAction(q).catch(() => ({ results: [], error: 'Could not reach the server.' }))
      if (turn !== latest.current) return // an older answer arriving late
      setResults(r.results); setNote(r.error ?? (r.results.length ? '' : 'No category matches. Try a simpler word.'))
    }, 250)
  }

  return (
    <div>
      <span className="block text-sm font-medium mb-1">Product category</span>
      <input type="hidden" name="taxonomyId" value={chosen?.id ?? ''} />
      <input type="hidden" name="taxonomyPath" value={chosen?.path ?? ''} />
      {chosen ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          {chosen.path || `Category ${chosen.id}`}
          <button type="button" onClick={() => setChosen(null)} className="ml-2 text-xs underline text-slate-600">Change</button>
        </p>
      ) : (
        <>
          <input type="search" onChange={(e) => search(e.target.value)} placeholder="Search, e.g. shirt, perfume, rice" className={inputCls} aria-label="Search the standard category list" autoComplete="off"
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }} />
          {results.length > 0 && (
            <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm divide-y divide-slate-100">
              {results.map((r) => <li key={r.id}><button type="button" onClick={() => { setChosen(r); setResults([]) }} className="block w-full px-3 py-2 text-left hover:bg-slate-50">{r.path}</button></li>)}
            </ul>
          )}
          {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
        </>
      )}
      <span className="block text-xs text-slate-500 mt-1">The standard category list used by Google Shopping. It helps search engines understand your product.</span>
    </div>
  )
}
