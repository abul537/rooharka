'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import ActionForm from '@/components/admin/ActionForm'
import { inputCls } from '@/components/admin/ui'
import { classifyFile } from '@/lib/media/constants'
import { imageVariant, videoPoster } from '@/lib/media/urls'
import {
  addExternalMediaAction, altMediaAction, attachUploadedMediaAction, moveMediaAction, primaryMediaAction, removeMediaAction, signMediaUploadAction,
} from '@/app/admin/(panel)/products/[id]/actions'

export interface MediaItem { id: string; isPrimary: boolean; kind: 'IMAGE' | 'VIDEO'; url: string; alt: string }

type Job = { name: string; percent: number; error?: string; done?: boolean }
const btn = 'rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-40'

/** Uploads straight from the browser to the owner's Cloudinary account (with progress), then registers the file. */
function upload(url: string, form: FormData, onProgress: (p: number) => void): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    xhr.onerror = () => reject(new Error('The upload was interrupted. Check your connection and try again.'))
    xhr.onload = () => {
      let body: Record<string, unknown> = {}
      try { body = JSON.parse(xhr.responseText) } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body)
      else reject(new Error((body.error as { message?: string } | undefined)?.message ?? `Cloudinary refused the file (${xhr.status}).`))
    }
    xhr.send(form)
  })
}

export default function MediaManager({ productId, items, cloudReady, maxItems }: { productId: string; items: MediaItem[]; cloudReady: boolean; maxItems: number }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [busy, setBusy] = useState(false)
  const patch = (i: number, j: Partial<Job>) => setJobs((all) => all.map((x, k) => (k === i ? { ...x, ...j } : x)))

  async function uploadOne(file: File, i: number) {
    const check = classifyFile(file.name, file.size)
    if (!check.ok) return patch(i, { error: check.error })
    try {
      const signed = await signMediaUploadAction(check.type)
      if ('error' in signed) return patch(i, { error: signed.error })
      const u = signed.upload
      const form = new FormData()
      form.append('file', file); form.append('api_key', u.apiKey); form.append('timestamp', String(u.timestamp))
      form.append('folder', u.folder); form.append('signature', u.signature)
      const reply = await upload(u.uploadUrl, form, (percent) => patch(i, { percent }))
      const res = await attachUploadedMediaAction(productId, reply as never)
      if (res?.error) return patch(i, { error: res.error })
      patch(i, { percent: 100, done: true })
    } catch (e) {
      patch(i, { error: (e as Error).message })
    }
  }

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0) return
    const list = [...files].slice(0, Math.max(0, maxItems - items.length))
    if (list.length < files.length) setJobs([{ name: '', percent: 0, error: `Only ${maxItems} photos and videos fit on one product.` }])
    else setJobs(list.map((f) => ({ name: f.name, percent: 0 })))
    setBusy(true)
    for (let i = 0; i < list.length; i++) await uploadOne(list[i], i) // one at a time: gentle on slow connections
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
    router.refresh()
  }

  return (
    <div className="space-y-5">
      {items.length === 0 && <p className="text-sm text-slate-500">No photos or videos yet. The first photo you add becomes the main picture.</p>}
      <ul className="grid sm:grid-cols-2 gap-4">
        {items.map((m, idx) => {
          const common = (extra: Record<string, string>) => (
            <>
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="linkId" value={m.id} />
              {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            </>
          )
          const thumb = m.kind === 'IMAGE' ? imageVariant(m.url, 400) : videoPoster(m.url, 400)
          return (
            <li key={m.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="relative aspect-video bg-slate-100 rounded overflow-hidden flex items-center justify-center">
                {thumb ? <img src={thumb} alt={m.alt} className="h-full w-full object-cover" loading="lazy" /> : <span className="text-sm text-slate-500">{m.kind === 'VIDEO' ? 'Video' : 'Photo'}</span>}
                {m.kind === 'VIDEO' && <span className="absolute bottom-1 left-1 rounded bg-black/70 text-white text-xs px-1.5">Video</span>}
                {m.isPrimary && <span className="absolute top-1 left-1 rounded bg-amber-600 text-white text-xs px-1.5">Main picture</span>}
              </div>
              <ActionForm action={altMediaAction} className="flex gap-2">
                {common({})}
                <input name="alt" defaultValue={m.alt} maxLength={200} placeholder="Describe it (helps search engines and screen readers)" className={`${inputCls} !py-1`} />
                <button className={btn}>Save</button>
              </ActionForm>
              <div className="flex flex-wrap gap-2">
                <ActionForm action={moveMediaAction}>{common({ dir: 'up' })}<button className={btn} disabled={idx === 0}>↑ Earlier</button></ActionForm>
                <ActionForm action={moveMediaAction}>{common({ dir: 'down' })}<button className={btn} disabled={idx === items.length - 1}>↓ Later</button></ActionForm>
                {m.kind === 'IMAGE' && !m.isPrimary && <ActionForm action={primaryMediaAction}>{common({})}<button className={btn}>Make main picture</button></ActionForm>}
                <ActionForm action={removeMediaAction} confirm="Remove this file from the product?">{common({})}<button className={`${btn} text-red-700`}>Remove</button></ActionForm>
              </div>
            </li>
          )
        })}
      </ul>

      {items.length < maxItems && (
        <div className="space-y-4 rounded-lg bg-slate-50 p-4">
          {cloudReady ? (
            <div>
              <label className="block text-sm font-medium mb-1">Upload photos or videos</label>
              <input ref={fileRef} type="file" multiple disabled={busy} onChange={(e) => onPick(e.target.files)}
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime" className="block text-sm" />
              <p className="text-xs text-slate-500 mt-1">Photos up to 10 MB, videos up to 100 MB. You can pick several at once.</p>
            </div>
          ) : (
            <p className="text-sm text-amber-800">To upload files, connect Cloudinary in <a className="underline" href="/admin/settings">Settings</a>. Until then you can paste a link below.</p>
          )}
          {jobs.length > 0 && (
            <ul className="space-y-1 text-sm" aria-live="polite">
              {jobs.map((j, i) => (
                <li key={i} className={j.error ? 'text-red-700' : j.done ? 'text-emerald-700' : 'text-slate-700'}>
                  {j.error ?? `${j.name}: ${j.done ? 'done' : `${j.percent}%`}`}
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={addExternalMediaAction} className="flex flex-col sm:flex-row gap-2 sm:items-start">
            <input type="hidden" name="productId" value={productId} />
            <input name="url" type="url" placeholder="Or paste a link ending in .jpg, .png, .webp, .mp4 …" maxLength={500} className={inputCls} aria-label="Link to a photo or video" />
            <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm shrink-0">Add link</button>
          </ActionForm>
        </div>
      )}
    </div>
  )
}
