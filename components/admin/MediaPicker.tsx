'use client'

import { useEffect, useRef, useState } from 'react'
import { themeMediaListAction, themeMediaSaveAction, themeMediaSignAction, themeVideoApproveAction } from '@/app/admin/(panel)/storefront/media-actions'
import type { LibraryItem } from '@/lib/theme/media'
import { classifyFile } from '@/lib/media/constants'
import { imageVariant, videoPoster } from '@/lib/media/urls'
import { VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS } from '@/lib/theme/schema'
import { inputCls, primaryBtn } from '@/components/admin/ui'

/** Sends a file straight from the browser to the store's Cloudinary account, reporting progress. */
function send(url: string, form: FormData, onProgress: (p: number) => void): Promise<Record<string, unknown>> {
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
/** How long a video file is, measured in the browser before anything is uploaded (the server measures again). */
function secondsOf(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video'), src = URL.createObjectURL(file)
    const done = (n: number | null) => { URL.revokeObjectURL(src); resolve(n) }
    v.preload = 'metadata'; v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null); v.onerror = () => done(null); v.src = src
  })
}

/**
 * THE MEDIA PICKER: choose a picture or video for a section. Three ways: upload a new file, pick one the store
 * already uploaded (product photos included), or (pictures only) paste an address. Videos are checked on the
 * server before they can be chosen: 15 seconds and 10 MB at most.
 */
export default function MediaPicker({ kind, onPick, onClose }: { kind: 'image' | 'video'; onPick: (url: string, bytes: number | null) => void; onClose: () => void }) {
  const [items, setItems] = useState<LibraryItem[] | null>(null)
  const [cloudReady, setCloudReady] = useState(true)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [address, setAddress] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const video = kind === 'video'
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    let live = true
    themeMediaListAction(video ? 'VIDEO' : 'IMAGE').then((r) => { if (!live) return; if ('error' in r) { setNote(r.error); setItems([]) } else { setItems(r.items); setCloudReady(r.cloudReady) } }).catch(() => live && (setNote('Could not load your library. Close this box and try again.'), setItems([])))
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', esc)
    return () => { live = false; window.removeEventListener('keydown', esc) }
  }, [video]) // the library is fetched once per opening

  async function upload(file: File | undefined) {
    if (!file) return
    setNote(null)
    const check = classifyFile(file.name, file.size)
    if (!check.ok) return setNote(check.error)
    if (check.type !== kind) return setNote(video ? 'Choose a video file (MP4 or WebM).' : 'Choose a picture file (JPG, PNG or WebP).')
    let seconds: number | null = null
    if (video) {
      if (!/\.(mp4|webm)$/i.test(file.name)) return setNote('Section videos must be MP4 or WebM files. Save the video as MP4 first.')
      if (file.size > VIDEO_MAX_BYTES) return setNote(`This video is ${(file.size / 1024 / 1024).toFixed(1)} MB. Section videos can be at most ${VIDEO_MAX_BYTES / 1024 / 1024} MB.`)
      seconds = await secondsOf(file)
      if (seconds !== null && seconds > VIDEO_MAX_SECONDS + 0.5) return setNote(`This video is ${Math.round(seconds)} seconds long. Section videos can be at most ${VIDEO_MAX_SECONDS} seconds. Trim it first.`)
    }
    try {
      setBusy('Preparing…')
      const signed = await themeMediaSignAction(kind)
      if ('error' in signed) return setNote(signed.error)
      const u = signed.upload, form = new FormData()
      form.append('file', file); form.append('api_key', u.apiKey); form.append('timestamp', String(u.timestamp)); form.append('folder', u.folder); form.append('signature', u.signature)
      const reply = await send(u.uploadUrl, form, (p) => setBusy(`Uploading… ${p}%`))
      setBusy(video ? 'Checking the video…' : 'Saving…')
      const saved = await themeMediaSaveAction(reply as never, seconds)
      if ('error' in saved) return setNote(saved.error)
      onPick(saved.item.url, saved.item.bytes)
    } catch (e) { setNote((e as Error).message) } finally { setBusy(null); if (fileRef.current) fileRef.current.value = '' }
  }
  async function choose(m: LibraryItem) {
    if (m.approved) return onPick(m.url, m.bytes)
    setNote(null); setBusy('Checking the video…')
    try {
      const r = await themeVideoApproveAction(m.id)
      if ('error' in r) return setNote(r.error)
      onPick(r.item.url, r.item.bytes)
    } catch { setNote('Could not reach the server. Please try again.') } finally { setBusy(null) }
  }
  const paste = () => { const u = address.trim(); if (!/^https:\/\/\S+$/.test(u) || /[<>"']/.test(u)) return setNote('The address must start with https://'); onPick(u, null) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={video ? 'Choose a video' : 'Choose a picture'} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
          <h2 className="font-semibold">{video ? 'Choose a video' : 'Choose a picture'}</h2>
          <button type="button" onClick={onClose} className="rounded border border-slate-300 px-3 py-1 text-sm">Close</button>
        </div>
        <div className="space-y-4 overflow-y-auto p-4">
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" accept={video ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp,image/avif,image/gif'} className="sr-only" id="mp-file" onChange={(e) => upload(e.target.files?.[0])} disabled={!!busy || !cloudReady} />
            <label htmlFor="mp-file" className={`${primaryBtn} cursor-pointer ${busy || !cloudReady ? 'pointer-events-none opacity-50' : ''}`}>{busy ?? (video ? 'Upload a video' : 'Upload a picture')}</label>
            <span className="text-xs text-slate-500">{video ? `MP4 or WebM, at most ${VIDEO_MAX_SECONDS} seconds and ${VIDEO_MAX_BYTES / 1024 / 1024} MB. Checked before it is kept.` : 'JPG, PNG or WebP, up to 10 MB. You choose its shape in the section, not here.'}</span>
          </div>
          {!cloudReady && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Uploading needs your own Cloudinary account. Connect it under Settings, then come back.{!video && ' Until then you can paste a picture address below.'}</p>}
          {note && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{note}</p>}
          {!video && (
            <div className="flex gap-2">
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Or paste a picture address: https://" maxLength={500} className={inputCls} aria-label="Picture address" onKeyDown={(e) => e.key === 'Enter' && paste()} />
              <button type="button" onClick={paste} className="shrink-0 rounded-lg border border-slate-300 px-3 text-sm font-medium">Use</button>
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold">Your library</h3>
            {items === null ? <p className="mt-2 text-sm text-slate-500">Loading…</p>
              : items.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nothing uploaded yet.</p>
              : (
                <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {items.map((m) => {
                    const thumb = m.kind === 'VIDEO' ? videoPoster(m.url, 240) : imageVariant(m.url, 240)
                    return (
                      <li key={m.id}>
                        <button type="button" disabled={!!busy} onClick={() => choose(m)} className="group relative block aspect-square w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 hover:ring-2 hover:ring-slate-900 disabled:opacity-50" aria-label={m.kind === 'VIDEO' ? 'Use this video' : 'Use this picture'}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {thumb && <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />}
                          {m.kind === 'VIDEO' && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">{m.approved ? 'Video' : 'Video · will be checked'}</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
          </div>
        </div>
      </div>
    </div>
  )
}
