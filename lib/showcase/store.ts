import { db } from '@/lib/db'
import { memoAsync } from '@/lib/memo'

export interface ShowcaseClient { id: string; name: string; logoUrl: string | null; website: string | null; quote: string | null; person: string | null }

const clients = memoAsync(30_000, (): Promise<ShowcaseClient[]> =>
  db.showcaseClient.findMany({ where: { isVisible: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], take: 24, select: { id: true, name: true, logoUrl: true, website: true, quote: true, person: true } }))
// Stores that are really live: not suspended or cancelled, and approved to be open to customers.
const liveStores = memoAsync(60_000, async (): Promise<number> => (await db.store.count({ where: { status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] }, shopApproval: 'APPROVED' } })) as number)

export const getShowcaseClients = (): Promise<ShowcaseClient[]> => clients.get().catch(() => [])
export const getLiveStoreCount = (): Promise<number> => liveStores.get().catch(() => 0)
export const clearShowcaseCache = () => clients.clear()
