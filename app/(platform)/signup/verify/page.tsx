import type { Metadata } from 'next'
import Link from 'next/link'
import { peekVerifyLink } from '@/lib/signup/service'
import ConfirmForm from './ConfirmForm'

export const metadata: Metadata = { title: 'Confirm your email', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams
  const r = await peekVerifyLink(token).catch(() => ({ ok: false as const, error: 'Something went wrong. Please try the link again in a moment.' }))
  return (
    <div className="mx-auto max-w-lg px-4 pt-20 text-center">
      {r.ok ? (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Confirm your email</h1>
          <p className="mt-4 text-stone-600">One last step to create <strong>{r.storeName}</strong> for {r.email}.</p>
          <ConfirmForm token={token} />
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold tracking-tight">This link cannot be used</h1>
          <p className="mt-4 text-stone-600">{r.error}</p>
          <p className="mt-6 text-sm"><Link href="/admin/login" className="underline mr-4">Sign in</Link><Link href="/signup" className="underline">Sign up again</Link></p>
        </>
      )}
    </div>
  )
}
