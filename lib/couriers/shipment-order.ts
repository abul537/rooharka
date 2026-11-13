import { isMeasured, formatQuantity } from '@/lib/units/registry'
import type { ShipmentOrder } from '@/lib/couriers/contract'

export type OrderRow = { id: string; storeId: string; number: string; total: { toNumber(): number }; amountPaid: { toNumber(): number }; customerName: string; customerEmail: string | null; customerPhone: string; cityName: string; landmark: string | null; localityName: string | null; items: { name: string; variantLabel: string | null; quantity: number; unitCode: string | null }[] }

/** Pure: the order as the courier layer sees it. */
export function toShipmentOrder(o: OrderRow): ShipmentOrder {
  return {
    reference: o.number,
    customer: {
      name: o.customerName, email: o.customerEmail ?? '',
      phone: o.customerPhone.startsWith('+92') ? `0${o.customerPhone.slice(3)}` : o.customerPhone,
      address: [o.landmark, o.localityName].filter(Boolean).join(', '), city: o.cityName,
    },
    codAmount: Math.max(0, o.total.toNumber() - o.amountPaid.toNumber()),
    // A measured line (1.5 kg of rice) is one parcel item, not 1500 grams.
    itemCount: o.items.reduce((n, i) => n + (isMeasured(i.unitCode) ? 1 : i.quantity), 0),
    itemsSummary: o.items.map((i) => `${i.name}${i.variantLabel ? ` ${i.variantLabel}` : ''} x${formatQuantity(i.quantity, i.unitCode)}`).join(', '),
  }
}

