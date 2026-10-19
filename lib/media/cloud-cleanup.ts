import { getServiceSecrets } from '@/lib/services/store-services'
import { createDestroyRequest } from '@/lib/media/cloudinary'
import type { CloudRef } from '@/lib/admin/products'

/**
 * Removes files from the owner's Cloudinary account after a product or photo is deleted.
 * Best effort: if Cloudinary is unreachable the database is already correct, so we only log.
 */
export async function destroyCloudFiles(storeId: string, refs: (CloudRef | null)[]) {
  const todo = refs.filter((r): r is CloudRef => !!r && r.provider === 'cloudinary' && !!r.publicId)
  if (todo.length === 0) return
  try {
    const s = await getServiceSecrets(storeId, 'cloudinary')
    if (!s) return
    const creds = { cloudName: s.credentials.cloudName, apiKey: s.credentials.apiKey, apiSecret: s.credentials.apiSecret }
    await Promise.all(todo.map(async (r) => {
      const req = createDestroyRequest(creds, r.publicId!, r.kind === 'VIDEO' ? 'video' : 'image')
      await fetch(req.url, { method: 'POST', body: req.body, signal: AbortSignal.timeout(10_000) }).catch((e) => console.error('[cloudinary destroy]', e))
    }))
  } catch (e) {
    console.error('[cloudinary cleanup]', e)
  }
}
