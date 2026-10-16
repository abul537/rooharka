/** Formats a money amount for display, e.g. 2500 -> "Rs. 2,500". */
export function formatPrice(amount: number, currency = 'PKR'): string {
  if (currency === 'PKR') return `Rs. ${Math.round(amount).toLocaleString('en-PK')}`
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

/** Percentage saved when a compare-at (crossed-out) price is set; otherwise 0. */
export function discountPercent(price: number, compareAt: number | null): number {
  if (!compareAt || compareAt <= price) return 0
  return Math.round(((compareAt - price) / compareAt) * 100)
}
