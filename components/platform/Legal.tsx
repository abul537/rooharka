import type { ReactNode } from 'react'

/** Shared page frame for the legal pages. */
export default function Legal({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 pt-16 leading-relaxed text-stone-700">
      <h1 className="text-4xl font-bold tracking-tight text-stone-900">{title}</h1>
      <p className="mt-2 text-sm text-stone-500">Last updated: {updated}</p>
      <div className="mt-10 space-y-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-stone-900 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1">{children}</div>
    </article>
  )
}
