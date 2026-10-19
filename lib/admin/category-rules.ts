import { slugify } from '@/lib/admin/product-rules'
import type { Getter, Parsed } from '@/lib/admin/settings-rules'

export interface CategoryInput { name: string; slug: string | null; sortOrder: number; isActive: boolean }

/** `slug` is null when the owner left it empty (the server then makes one from the name). */
export function parseCategory(g: Getter): Parsed<CategoryInput> {
  const name = String(g.get('name') ?? '').trim()
  if (name.length < 2 || name.length > 60) return { ok: false, error: 'Category name must be 2 to 60 characters.' }
  const slugRaw = String(g.get('slug') ?? '').trim()
  if (slugRaw && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugRaw) || slugRaw.length > 60)) return { ok: false, error: 'The address may only use lowercase letters, digits and single dashes.' }
  const sortRaw = String(g.get('sortOrder') ?? '').trim()
  const sortOrder = sortRaw ? Number(sortRaw) : 0
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) return { ok: false, error: 'Order must be a whole number from 0 to 9999.' }
  return { ok: true, value: { name, slug: slugRaw || null, sortOrder, isActive: g.get('isActive') === 'on' } }
}
export const categorySlug = (c: CategoryInput) => c.slug ?? slugify(c.name)
