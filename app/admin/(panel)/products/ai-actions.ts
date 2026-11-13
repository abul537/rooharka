'use server'

import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { generateDescription, type AiResult } from '@/lib/ai/describe'

/** The "Generate with AI" button. The result goes into the editor for the owner to change; nothing is saved here. */
export async function generateDescriptionAction(input: { title: string; category?: string; existing?: string }): Promise<AiResult> {
  const g = await adminOrError('products.edit')
  if ('error' in g) return { ok: false, error: g.error }
  try {
    const r = await generateDescription(g.admin, { title: String(input?.title ?? '').slice(0, 300), category: String(input?.category ?? '').slice(0, 300) || null, existing: String(input?.existing ?? '').slice(0, 20_000) || null })
    if (r.ok) await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'product.ai_description', entity: 'Product' })
    return r
  } catch (e) {
    console.error('[ai description]', e instanceof Error ? e.message : 'error') // never the key or the text
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}
