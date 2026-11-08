import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCurrentStore } from '@/lib/store'
import { getShopContext } from '@/lib/storefront/data'
import { paragraphs, POLICY_KEYS, POLICY_TITLES, type PolicyKey } from '@/lib/storefront/rules'

export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ key: string }> }
const isKey = (k: string): k is PolicyKey => (POLICY_KEYS as readonly string[]).includes(k)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params
  return { title: isKey(key) ? POLICY_TITLES[key] : 'Policy' }
}

/** One of the owner's policy pages (shipping, returns, privacy, terms). A policy with no text is a 404 and is not linked from the footer. */
export default async function PolicyPage({ params }: Props) {
  const { key } = await params
  const store = await getCurrentStore()
  if (!store || !isKey(key)) notFound()
  const text = (await getShopContext(store)).content.policies[key as PolicyKey]
  if (!text) notFound()
  return (
    <div className="container mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">{POLICY_TITLES[key as PolicyKey]}</h1>
      <div className="mt-8 space-y-4 leading-relaxed text-gray-700">{paragraphs(text).map((p, i) => <p key={i}>{p}</p>)}</div>
    </div>
  )
}
