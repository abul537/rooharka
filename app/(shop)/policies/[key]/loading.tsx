import { Bar, Paragraph, Skeleton } from '@/components/shop/Skeletons'

/** POLICY skeleton (returns, privacy, terms...): a narrow reading column with a title and paragraphs. */
export default function PolicyLoading() {
  return (
    <Skeleton label="policy" className="container mx-auto max-w-3xl px-4 py-14">
      <Bar className="h-10 w-2/3" />
      <div className="mt-8 space-y-8"><Paragraph lines={5} /><Paragraph lines={4} /><Paragraph lines={5} /></div>
    </Skeleton>
  )
}
