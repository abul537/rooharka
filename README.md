# Rooharka

Multi-tenant e-commerce storefront + admin platform (Next.js 16, Prisma 7, Neon Postgres).

## Setup

1. Install Node 22+ and pnpm, then `pnpm install` (this also runs `prisma generate`).
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL` (pooled), `DIRECT_URL` (direct) (the address dropdowns use `DATABASE_URL` too; `ADDRESS_DATABASE_URL` is no longer needed) from the Neon **Connect** dialog. Never commit `.env`.
3. Create the platform tables (the existing `provinces` / `cities` / `localities` tables are reused as they are):
   ```bash
   pnpm db:push
   ```
   Read Prisma's prompt carefully. It should only list **new tables** being created.
4. Load the starter data (service catalogue, the MPPMHK store, checkout field settings, the Darwaish product with **placeholder prices**):
   ```bash
   pnpm db:seed
   ```
5. Run the site: `pnpm dev`, then open http://localhost:3000 and try `/checkout`.

## Useful commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the dev server |
| `pnpm db:studio` | Browse the database in your browser |
| `pnpm db:push` | Sync the Prisma schema to the database (development) |
| `pnpm db:seed` | Insert starter data (safe to repeat) |

## Project layout

- `prisma/schema.prisma`: the whole database design, grouped and commented
- `lib/db.ts`: the shared database client
- `lib/address-db.ts` + `app/api/pakistan/*`: province / city / locality endpoints used by the checkout (read-only)
- `app/checkout`, `app/product`, `components/`: the storefront

## Product page (`/product/[slug]`)

Everything on the page comes from the database, nothing is hard-coded:

| What | Where it lives |
| --- | --- |
| Name, subtitle, descriptions, SEO | `Product` |
| Sizes, prices, crossed-out price, stock, badge ("Most Popular") | `ProductVariant` |
| Images and video | `MediaAsset` + `ProductMedia` |
| Key benefits, ingredients, usage steps, tips, FAQ, custom tabs | `ProductSection` (`type` = how it is drawn, `tab` = where it appears) |
| Reviews (only approved ones are shown) | `Review` |
| Page switches: show/hide reviews, FAQ, trust badges, sticky bar, low-stock message, button label, badge and guarantee text | `ContentBlock` where `page = 'product'`, `key = 'settings'` |

Until the admin dashboard exists, edit these rows with `pnpm db:studio`. Changes appear on the live page within about a minute.

## Orders, payments and tracking

Flow: `/product/[slug]` → `/checkout?variant=…&qty=…` → `POST /api/orders` → `/checkout/success?code=…` → `/track`.

- **The server decides every price.** The browser only sends *which* size and *how many*; `lib/orders/create-order.ts` reads prices and stock from the database, checks the province > city > locality chain, subtracts stock atomically, and saves customer, order, items, payment and status history in one transaction. Sending the same request twice returns the same order.
- **Checkout fields** (show/hide, required/optional) come from the `CheckoutField` rows. First name, phone, province, city and locality are always required.
- **Payment policy** is `StoreSettings.paymentPolicy`: `COD_ONLY`, `DELIVERY_ADVANCE`, `FULL_ADVANCE` or `CUSTOMER_CHOICE`; for advances see `advanceAmountMode` / `advanceAmountValue`. Delivery price: `deliveryCharge` and `freeDeliveryOver`.
- **JazzCash / Easypaisa advance (manual)**: the customer sends the money to your wallet number and enters the Transaction ID; the order stays "waiting for payment" until you confirm it. Configure the wallets in `StoreSettings.extra`:
  ```json
  { "manualPayments": {
      "jazzcash":  { "accountTitle": "Your Name", "accountNumber": "03XXXXXXXXX" },
      "easypaisa": { "accountTitle": "Your Name", "accountNumber": "03XXXXXXXXX" } } }
  ```
  If a policy needs an advance and no wallet is configured, checkout says online payment is unavailable instead of skipping the rule.
- **Tracking** (`/track`): the customer enters the code from checkout (e.g. `MP-7K4Q-9XMD`) and, if `trackingRequiresPhoneLast4` is on, the last 4 phone digits. They see first name + last initial, city, items, status timeline and courier details, never the phone or street address. Lookups are rate limited and every failure gives the same message.
- Pricing / payment rules are in `lib/pricing.ts`; request rules are in `lib/orders/validate.ts`.
