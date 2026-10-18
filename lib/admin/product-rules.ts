import type { Getter, Parsed } from './settings-rules'

const text = (g: Getter, k: string) => String(g.get(k) ?? '').trim()
const whole = (s: string) => (/^\d{1,9}$/.test(s) ? Number(s) : null)

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const

export interface ProductEdit {
  name: string; subtitle: string | null; shortDescription: string | null
  status: (typeof PRODUCT_STATUSES)[number]
}
export interface VariantEdit {
  id: string; label: string; badge: string | null; price: number; compareAtPrice: number | null
  /** Stock the admin saw when the form opened, and the stock they typed: the DIFFERENCE is applied, so orders placed meanwhile are never lost. */
  stockWas: number; stock: number; isActive: boolean
}

/**
 * Parses the product form. `variantIds` are the variants that belong to this product (from the database),
 * so a tampered form cannot touch anyone else's variants.
 */
export function parseProductEdit(g: Getter, variantIds: string[]): Parsed<{ product: ProductEdit; variants: VariantEdit[]; defaultId: string }> {
  const name = text(g, 'name')
  if (name.length < 2 || name.length > 120) return { ok: false, error: 'Product name must be 2 to 120 characters.' }
  const subtitle = text(g, 'subtitle'), shortDescription = text(g, 'shortDescription')
  if (subtitle.length > 160) return { ok: false, error: 'Subtitle must be 160 characters or fewer.' }
  if (shortDescription.length > 500) return { ok: false, error: 'Short description must be 500 characters or fewer.' }
  const status = PRODUCT_STATUSES.find((s) => s === text(g, 'status'))
  if (!status) return { ok: false, error: 'Choose a status.' }

  const variants: VariantEdit[] = []
  for (const id of variantIds) {
    const label = text(g, `v_${id}_label`)
    if (!label || label.length > 40) return { ok: false, error: 'Every size needs a name of up to 40 characters.' }
    const price = whole(text(g, `v_${id}_price`))
    if (price === null || price < 1) return { ok: false, error: `${label}: price must be a whole number above 0.` }
    const cmpRaw = text(g, `v_${id}_compareAt`)
    const compareAtPrice = cmpRaw ? whole(cmpRaw) : null
    if (cmpRaw && (compareAtPrice === null || compareAtPrice < price)) return { ok: false, error: `${label}: the crossed-out price must be a whole number not lower than the price.` }
    const stock = whole(text(g, `v_${id}_stock`)), stockWas = whole(text(g, `v_${id}_stockWas`))
    if (stock === null || stock > 1_000_000) return { ok: false, error: `${label}: stock must be a whole number from 0 to 1000000.` }
    const badge = text(g, `v_${id}_badge`)
    if (badge.length > 30) return { ok: false, error: `${label}: badge must be 30 characters or fewer.` }
    variants.push({ id, label, badge: badge || null, price, compareAtPrice, stock, stockWas: stockWas ?? stock, isActive: g.get(`v_${id}_active`) === 'on' })
  }

  const defaultId = text(g, 'defaultVariant')
  const def = variants.find((v) => v.id === defaultId)
  if (!def) return { ok: false, error: 'Choose which size is shown first.' }
  if (!def.isActive) return { ok: false, error: 'The size shown first must be switched on.' }
  if (status === 'ACTIVE' && !variants.some((v) => v.isActive)) return { ok: false, error: 'A live product needs at least one size switched on.' }
  return { ok: true, value: { product: { name, subtitle: subtitle || null, shortDescription: shortDescription || null, status }, variants, defaultId } }
}
