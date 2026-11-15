/**
 * STOCK HISTORY. Every change of stock writes one line here, inside the same database transaction as the change,
 * so the history and the stock can never disagree. `tx` is that transaction.
 */
export const STOCK_REASONS = { ORDER: 'Online order', ORDER_CANCELLED: 'Order cancelled (back on the shelf)', COUNTER_SALE: 'Counter sale', COUNTER_VOID: 'Counter sale cancelled', ADJUSTED: 'Changed by hand', IMPORT: 'Spreadsheet import', RETURN_RESTOCKED: 'Return put back on the shelf' } as const
export type StockReason = keyof typeof STOCK_REASONS
export interface StockLine { productId: string; variantId: string; delta: number; reason: StockReason; note?: string | null; orderId?: string | null; userId?: string | null }

type Tx = { stockMovement: { createMany(args: { data: object[] }): Promise<unknown> } }
/** Lines with no real change (a delta of zero) are skipped. */
export async function logStock(tx: Tx, storeId: string, lines: StockLine[]): Promise<void> {
  const data = lines.filter((l) => Number.isInteger(l.delta) && l.delta !== 0 && l.productId && l.variantId).map((l) => ({ storeId, productId: l.productId, variantId: l.variantId, delta: l.delta, reason: l.reason, note: l.note?.slice(0, 200) ?? null, orderId: l.orderId ?? null, userId: l.userId ?? null }))
  if (data.length) await tx.stockMovement.createMany({ data })
}
/** "+5" / "-2" for display. */
export const signed = (n: number) => (n > 0 ? `+${n}` : String(n))
