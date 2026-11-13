/**
 * Is THIS request a valid preview, and for which store? Used by the shop's data loaders.
 * A preview is real only when all of these hold:
 *   - Next.js draft mode is on (so cached pages are bypassed and the page is built fresh for the owner),
 *   - the session pass in the cookie has a valid signature and has not expired,
 *   - the staff member named in it is still an active member of that store (checked once per request).
 * The answer is worked out once per request (`cache`).
 */
import { cache } from 'react'
import { cookies, draftMode } from 'next/headers'
import { db } from '@/lib/db'
import { PREVIEW_COOKIE, readSessionPass, type PreviewPass } from '@/lib/preview/rules'

export const getPreview = cache(async (): Promise<PreviewPass | null> => {
  try {
    if (!(await draftMode()).isEnabled) return null
    const pass = readSessionPass((await cookies()).get(PREVIEW_COOKIE)?.value)
    if (!pass) return null
    const stillStaff = await db.user.count({ where: { id: pass.userId, storeId: pass.storeId, isActive: true } })
    return stillStaff ? pass : null
  } catch {
    return null // outside a request (a scheduled job, a build step): never a preview
  }
})

/** True only when the visitor is previewing THIS store. Store A's pass shows nothing extra on store B. */
export async function isPreviewFor(storeId: string): Promise<boolean> {
  return (await getPreview())?.storeId === storeId
}
