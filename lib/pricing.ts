/**
 * Pure pricing + payment-policy rules. The SAME code runs in the browser (to show
 * the customer their totals) and on the server (the authority when the order is
 * saved), so the two can never disagree.
 */

export type PaymentPolicy = 'COD_ONLY' | 'DELIVERY_ADVANCE' | 'FULL_ADVANCE' | 'CUSTOMER_CHOICE'
export type PaymentMethodCode = 'COD' | 'JAZZCASH' | 'EASYPAISA'

export interface Wallet {
  provider: 'JAZZCASH' | 'EASYPAISA'
  accountTitle: string
  accountNumber: string
}

export interface PricingConfig {
  paymentPolicy: PaymentPolicy
  deliveryCharge: number
  freeDeliveryOver: number | null
  advanceMode: 'DELIVERY_CHARGE' | 'FIXED' | 'PERCENT'
  advanceValue: number | null
  wallets: Wallet[]
}

export interface Charges {
  subtotal: number
  delivery: number
  total: number
  /** Paid up-front through a wallet before dispatch. */
  advance: number
  /** Paid in cash when the parcel arrives. */
  dueOnDelivery: number
}

export interface PaymentOption {
  method: PaymentMethodCode
  charges: Charges
  wallet?: Wallet
}

const money = (n: number) => Math.max(0, Math.round(n))

export function deliveryFor(config: PricingConfig, subtotal: number): number {
  if (config.freeDeliveryOver !== null && subtotal >= config.freeDeliveryOver) return 0
  return money(config.deliveryCharge)
}

/** What the customer pays now / later if they choose `method` under this store's policy. */
export function computeCharges(config: PricingConfig, subtotal: number, method: PaymentMethodCode): Charges {
  const delivery = deliveryFor(config, subtotal)
  const total = money(subtotal) + delivery
  let advance = 0

  if (method !== 'COD') {
    switch (config.paymentPolicy) {
      case 'FULL_ADVANCE':
      case 'CUSTOMER_CHOICE':
        advance = total
        break
      case 'DELIVERY_ADVANCE':
        if (config.advanceMode === 'FIXED') advance = money(config.advanceValue ?? 0)
        else if (config.advanceMode === 'PERCENT') advance = money((total * (config.advanceValue ?? 0)) / 100)
        else advance = delivery
        break
      case 'COD_ONLY':
        advance = 0
        break
    }
    advance = Math.min(advance, total)
  }
  return { subtotal: money(subtotal), delivery, total, advance, dueOnDelivery: total - advance }
}

/**
 * The payment choices a customer may be offered.
 *  COD_ONLY          -> cash on delivery only
 *  DELIVERY_ADVANCE  -> must prepay the advance through a wallet (rest in cash)
 *  FULL_ADVANCE      -> must prepay everything through a wallet
 *  CUSTOMER_CHOICE   -> cash on delivery, or prepay everything
 * If the policy needs a prepayment but the store has no wallet set up, the list
 * is empty and checkout says so, rather than silently skipping the rule.
 */
export function buildPaymentOptions(config: PricingConfig, subtotal: number): PaymentOption[] {
  const options: PaymentOption[] = []
  const { paymentPolicy } = config
  if (paymentPolicy === 'COD_ONLY' || paymentPolicy === 'CUSTOMER_CHOICE') {
    options.push({ method: 'COD', charges: computeCharges(config, subtotal, 'COD') })
  }
  if (paymentPolicy !== 'COD_ONLY') {
    for (const wallet of config.wallets) {
      options.push({ method: wallet.provider, wallet, charges: computeCharges(config, subtotal, wallet.provider) })
    }
  }
  // A delivery-advance rule with nothing to prepay (e.g. free delivery) is just cash on delivery.
  if (paymentPolicy === 'DELIVERY_ADVANCE' && options.length > 0 && options.every((o) => o.charges.advance === 0)) {
    return [{ method: 'COD', charges: computeCharges(config, subtotal, 'COD') }]
  }
  return options
}
