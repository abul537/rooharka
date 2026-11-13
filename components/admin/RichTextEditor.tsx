'use client'

import { useRef, useState } from 'react'
import { generateDescriptionAction } from '@/app/admin/(panel)/products/ai-actions'

type Cmd = { label: string; title: string; run: () => void }
const exec = (cmd: string, value?: string) => document.execCommand(cmd, false, value)

/**
 * The description editor: bold, italic, headings, lists, quotes and links. What it produces is HTML, which the
 * SERVER cleans against an allow-list before saving (lib/admin/product-mvp.ts) - the browser is never trusted.
 * `initialHtml` is already cleaned by the server. The "Generate with AI" button fills the editor; the owner can
 * change every word before saving.
 */
export default function RichTextEditor({ name, initialHtml, ai = true }: { name: string; initialHtml: string; ai?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const [html, setHtml] = useState(initialHtml)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const sync = () => setHtml(box.current?.innerHTML ?? '')
  const act = (fn: () => void) => () => { box.current?.focus(); fn(); sync() }

  const tools: Cmd[] = [
    { label: 'B', title: 'Bold', run: () => exec('bold') },
    { label: 'I', title: 'Italic', run: () => exec('italic') },
    { label: 'U', title: 'Underline', run: () => exec('underline') },
    { label: 'H2', title: 'Large heading', run: () => exec('formatBlock', 'h2') },
    { label: 'H3', title: 'Small heading', run: () => exec('formatBlock', 'h3') },
    { label: '¶', title: 'Normal text', run: () => exec('formatBlock', 'p') },
    { label: '• List', title: 'Bullet list', run: () => exec('insertUnorderedList') },
    { label: '1. List', title: 'Numbered list', run: () => exec('insertOrderedList') },
    { label: '❝', title: 'Quote', run: () => exec('formatBlock', 'blockquote') },
    { label: 'Link', title: 'Add a link to the selected words', run: () => { const url = window.prompt('Link address (https://…)'); if (url && /^(https?:\/\/|mailto:|tel:|\/)/i.test(url.trim())) exec('createLink', url.trim()) } },
    { label: 'Unlink', title: 'Remove the link', run: () => exec('unlink') },
    { label: 'Clear', title: 'Remove formatting', run: () => exec('removeFormat') },
  ]

  async function generate() {
    const form = box.current?.closest('form')
    const title = (form?.elements.namedItem('name') as HTMLInputElement | null)?.value ?? ''
    const category = (form?.elements.namedItem('taxonomyPath') as HTMLInputElement | null)?.value || (form?.elements.namedItem('productType') as HTMLInputElement | null)?.value || ''
    if (title.trim().length < 2) { setNote({ tone: 'bad', text: 'Type the product title first, so the AI knows what to write about.' }); return }
    if (box.current?.innerText.trim() && !window.confirm('Replace the current description with a new one written by AI? (Your current text is used as notes.)')) return
    setBusy(true); setNote(null)
    try {
      const r = await generateDescriptionAction({ title, category, existing: box.current?.innerHTML ?? '' })
      if (!r.ok) setNote({ tone: 'bad', text: r.error })
      else if (box.current) { box.current.innerHTML = r.html; sync(); setNote({ tone: 'ok', text: `Written by AI. Read it and change anything that is not exactly true for your product. ${r.left} left this hour.` }) }
    } catch { setNote({ tone: 'bad', text: 'Could not reach the server. Please try again.' }) }
    setBusy(false)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 rounded-t-lg border border-b-0 border-slate-300 bg-slate-50 p-1.5" role="toolbar" aria-label="Text formatting">
        {tools.map((t) => (
          <button key={t.title} type="button" title={t.title} aria-label={t.title} onMouseDown={(e) => e.preventDefault()} onClick={act(t.run)} className="rounded px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200">{t.label}</button>
        ))}
        {ai && <button type="button" onClick={generate} disabled={busy} className="ml-auto rounded-lg bg-violet-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Writing…' : '✨ Generate with AI'}</button>}
      </div>
      <div
        ref={box} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Description"
        onInput={sync} onBlur={sync}
        // Pasting from Word or a website brings hidden styling: paste the words only.
        onPaste={(e) => { e.preventDefault(); exec('insertText', e.clipboardData.getData('text/plain')) }}
        className="min-h-48 max-h-[32rem] overflow-y-auto rounded-b-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-slate-400 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-3 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_a]:text-blue-700 [&_a]:underline"
        dangerouslySetInnerHTML={{ __html: initialHtml }}
      />
      <input type="hidden" name={name} value={html} />
      {note && <p role={note.tone === 'bad' ? 'alert' : 'status'} className={`mt-1 text-sm ${note.tone === 'bad' ? 'text-red-700' : 'text-emerald-700'}`}>{note.text}</p>}
    </div>
  )
}
