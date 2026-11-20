'use server'

import { revalidatePath } from 'next/cache'
import { adminOrError } from '@/lib/auth/guard'
import { audit } from '@/lib/audit'
import { IMPORT_MAX_BYTES, describePlan } from '@/lib/admin/product-import'
import { previewImport, runImport } from '@/lib/admin/product-import-run'
import { storeLimit } from '@/lib/rate-limit'
import { featureProblem } from '@/lib/plans/access'

export interface ImportAnswer { summary: string; problems: string[]; updates: number; creates: number; done: boolean; error?: string }
const refuse = (error: string): ImportAnswer => ({ summary: '', problems: [], updates: 0, creates: 0, done: false, error })

/**
 * Step 1 (`apply` false): read the file and say what it WOULD do; nothing is saved.
 * Step 2 (`apply` true): do it. The file is read and checked again from scratch; the first answer is not trusted.
 */
export async function importProductsAction(text: unknown, apply: unknown): Promise<ImportAnswer> {
  const g = await adminOrError('products.edit'); if ('error' in g) return refuse(g.error)
  const locked = await featureProblem(g.admin.storeId, 'product-import'); if (locked) return refuse(locked)
  if (typeof text !== 'string' || text.length === 0) return refuse('Choose a file first.')
  if (text.length > IMPORT_MAX_BYTES) return refuse('The file is larger than 1 MB. Split it into smaller files.')
  if (!storeLimit(g.admin.storeId, 'import').ok) return refuse('Too many imports at once. Please wait a minute.')
  try {
    const plan = apply === true ? await runImport(g.admin, text) : await previewImport(g.admin.storeId, text)
    if (apply === true && (plan.updates.length || plan.creates.length)) {
      await audit({ storeId: g.admin.storeId, userId: g.admin.id, action: 'product.import', entity: 'Product', after: { updated: plan.updates.length, created: plan.creates.length, problems: plan.problems.length } })
      revalidatePath('/admin/products')
    }
    const summary = apply === true ? describePlan(plan).replace(/will be /g, '').replace('Nothing in this file would change', 'Nothing in this file changed') : describePlan(plan)
    return { summary, problems: plan.problems, updates: plan.updates.length, creates: plan.creates.length, done: apply === true }
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') return refuse('A SKU or barcode in the file is already used by another product. Nothing was changed. Check the file and try again.')
    console.error('[product import]', e)
    return refuse('Something went wrong. Nothing was changed; please try again.')
  }
}
