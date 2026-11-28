import { db } from '@/lib/db'
import { shopOrigin } from '@/lib/platform-host'

/**
 * The address a store's shop opens at (see shopOrigin for the order of choices), read from the database.
 * Only addresses the platform owner has switched live count. null = the store has no public address yet.
 */
export async function shopOriginFor(storeId: string, requestHost: string | null, preview = false): Promise<string | null> {
  const store = await db.store.findUnique({
    where: { id: storeId },
    select: { slug: true, domains: { where: { verifiedAt: { not: null } }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], select: { host: true, isPrimary: true } } },
  })
  return store ? shopOrigin({ slug: store.slug, domains: store.domains, requestHost, preview }) : null
}
