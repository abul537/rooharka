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

## Admin dashboard (`/admin`)

**Create the first admin** (after `pnpm db:push` and `pnpm db:seed`):

```bash
pnpm admin:create     # asks for store slug (mppmhk), email, name, role and a password (min 12 characters)
```

Run it again with the same email to reset a password (all of that person's sessions are signed out).

| Role | Can do |
|---|---|
| `STORE_OWNER`, `STORE_MANAGER` | everything: orders, payments, customers, products, settings |
| `STORE_STAFF` | view and update orders, view customers and products |

**Pages:** Overview (sales, new orders, pending payments, low stock), Orders (search, status, confirm advance payments, shipments, cancel with restock), Customers (history, notes, block a phone number), Products (add, edit, archive/delete, sizes, photos and videos, page sections, categories), Settings (store details, payment policy and JazzCash/EasyPaisa wallets, checkout fields, phone verification, couriers, photo storage, tracking, product-page switches).

**Security design:** passwords hashed with scrypt; random session token in an httpOnly cookie (only its hash is stored); 5 wrong passwords lock the account 15 minutes; every page and action checks the signed-in user's role and filters data by their own store; every change is written to the audit log; admin pages are `noindex` and never cached.

**Not built yet:** two-factor login (TOTP), password change screen (use `pnpm admin:create`), automatic courier status updates, CSMI owner dashboard.

**Tests:** `pnpm test` runs the pure business-rule tests (order status rules, payment policies, validation, settings, passwords). Database code is verified by running the app.

## Products, photos and the catalog

- **Admin > Products**: add unlimited products, edit every text, price and stock, add or remove sizes, reorder sections, archive or delete (a product that has orders can only be archived, so order history never breaks). **Admin > Categories** manages the catalog categories.
- **Photos and videos** go straight from the browser to the store owner's OWN Cloudinary account (Settings > Photos and videos). The server signs each upload, then checks Cloudinary's reply before saving it, so a customer-facing link can never be forged. A pasted https link also works.
- **Catalog**: `/shop` (search, categories, sorting, pages). Each product opens at `/product/[slug]`.

## Phone verification (OTP) to stop fake orders

Settings > **Phone verification**. The store owner switches it on; the platform pays nothing because messages go through the owner's own provider account (Twilio for SMS and WhatsApp, or any local SMS company with a web link).

Flow: Buy → `/verify` (enter number, receive code) → `/checkout` with that number locked → order.

- The gate **cannot be skipped**: `POST /api/orders` rejects any order whose phone is not covered by the signed, 30-minute "verified" cookie. One verification covers one order.
- It cannot be switched ON without a working provider; if the provider breaks later the dashboard shows a red warning and customers see "temporarily unavailable" (the store fails closed rather than letting fake orders through).
- Codes are stored only as keyed hashes. Wrong tries are counted atomically (parallel guessing cannot beat the limit). Limits: 1 code per minute and 5 per hour per number, 10 sends per IP per 10 minutes, and a daily message cap the owner sets to protect their balance.
- The owner can send themselves a test message before turning the gate on.

## Couriers

Settings > **Couriers**. The owner chooses which companies they use (TCS, Leopards, PostEx, Other), adds any local company (name plus an optional tracking link such as `https://trax.pk/t?n={tn}`), and picks a default.

- **Every courier works the same way:** book on the courier's own site, type the tracking number on the order. The customer sees the courier, the number and (for custom couriers with a link) a tracking link on `/track`.
- **One-click booking** exists for PostEx and Leopards after the owner connects their own merchant account (keys are encrypted with `APP_SECRET`). A parcel is recorded only if the courier returns a valid tracking number; any other reply becomes a readable message and nothing is changed.
- Adding another courier API later means one new adapter in `lib/couriers/adapters.ts`; nothing else changes.
- **Beta notice:** the PostEx and Leopards calls follow the merchant API as documented to merchants but could not be tried against a live merchant account when they were written. Use "Test connection", then book one real parcel and check it with the courier before relying on it.
