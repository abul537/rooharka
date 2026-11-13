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
| `pnpm admin:reset-2fa you@example.com` | Switch off two-factor protection for a login whose phone AND recovery codes are lost |

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

**Not built yet:** a QR code on the two-factor setup screen (the setup key is typed instead), automatic status for TCS and custom couriers (they have no API here: update those orders by hand).

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

## CSMI: the platform owner's dashboard (`/csmi`)

Your own view across ALL stores. It is separate from the store dashboards: a store owner can never open it, and your login cannot open a store dashboard.

**Create your login** (after `pnpm db:push`): `pnpm admin:create`, type `platform` as the store, then `owner` (full control) or `support` (can look, cannot change money or stores).

| Page | What it shows or does |
|---|---|
| Overview | Monthly recurring revenue (MRR), yearly, profit and margin, collected this month, unpaid and overdue, at-risk and trial money, stores by status, who needs attention, top stores. 7 / 30 / 90 day views |
| Stores | All stores with plan, monthly revenue, orders, sales, last order and health flags; filter and search. Add a store |
| Store page | Plan and agreed price, status (suspend with a reason), that store's profit, services and their errors, invoices |
| Billing | **Run billing** (safe to repeat), invoices, mark paid (bank / JazzCash / EasyPaisa / cash), cancel |
| Plans | Your plans and prices |
| Costs and profit | Your monthly running costs. Profit = MRR minus costs; a cost can belong to one store or be shared |
| Services | Every service, how many stores use it, how many are failing, and your add-on fee per store |
| Reports | One row per store, with CSV download |

**How the numbers are decided** (all in `lib/csmi/rules.ts`, unit-tested):
- MRR counts only stores that are **active with an active subscription**. Trials, past-due and suspended stores are shown separately, never inside MRR. A yearly plan counts as one twelfth per month. Add-on fees count for those stores too.
- Costs are monthly. A store's own costs hit that store; shared costs are split equally across live stores.
- A store needing attention: overdue invoice, failing integration (the owner's SMS, courier or photo account), no orders for 14 days, 30%+ cancelled or returned, open ticket, or active without a subscription.
- Run billing: moves finished periods on, creates exactly one invoice per store per period, marks unpaid invoices past due as overdue and the store as past due. It never suspends a store by itself. Past-due stores are not billed again until settled. It also runs by itself every day (see Scheduled jobs below); the button does the same work.
- Numbers come live from orders, so there is no nightly job to forget. Suspending a store closes its shop to customers within 30 seconds.

## Account security (both dashboards: "My security")

- **Two-factor protection (TOTP).** Any login can turn it on from **My security**: add the setup key to an authenticator app (Google/Microsoft Authenticator, Authy, 1Password), type the 6-digit code once to prove it works, and save the 8 one-time **recovery codes** (shown only once). From then on, signing in needs the password **and** a code. A used code cannot be replayed; five wrong codes lock the login for 15 minutes; turning it off or renewing recovery codes needs the password and a current code. The CSMI shows a reminder bar to the platform owner until it is on. Lost phone and recovery codes: run `pnpm admin:reset-2fa you@example.com` on a computer that can reach the database.
- **Change password.** Needs the current password, the same strength rules as account creation (12+ characters), and signs every other browser out.
- Secrets are encrypted with `APP_SECRET` (changing it makes saved two-factor keys unreadable: nobody with two-factor on could sign in until reset).

## Per-store web addresses

Each store can have up to 5 web addresses (CSMI, open a store, **Web addresses**). Flow: add `shop.example.pk`, point the domain's DNS at your hosting (the hosting company shows the exact record, and the domain must also be added there), use **Check** to see what it points to, then **Switch live**. The shop then opens that store for anyone visiting that address (`www.` is optional). An address that is off never opens a shop. A suspended store's address shows no shop. Addresses that match nothing (localhost, preview links) use `DEFAULT_STORE_SLUG`. Changes take effect within 30 seconds. The store's dashboard (`/admin`) works on any of the addresses.

## Scheduled jobs (billing and courier status)

Two jobs run by themselves. Both are web addresses the hosting scheduler calls; both refuse to run without the secret, so the internet can never trigger them.

| Job | Address | What it does | Default schedule (`vercel.json`) |
|---|---|---|---|
| Billing | `/api/cron/billing` | Same as CSMI "Run billing": one invoice per store per period, marks late invoices overdue | daily, 02:00 Pakistan time |
| Courier status | `/api/cron/courier-sync` | Asks PostEx / Leopards where in-flight parcels are (read-only) | daily, 10:00 Pakistan time |

**Set up once:** add `CRON_SECRET` (24+ random characters, `openssl rand -base64 32`) to the server's environment and redeploy. On Vercel the scheduler then sends it automatically. On other hosting (or for more frequent courier checks on a plan that allows it), call the address with the header `Authorization: Bearer <CRON_SECRET>` from any scheduler (for example cron-job.org). Courier checks can run as often as every 30 minutes; billing once a day is plenty.

**Safety:** a job never overlaps itself (a database lock: pressing the button while the schedule runs does nothing twice), one failing store or parcel never stops the rest, and every run is saved. CSMI Billing shows "Automatic billing: working / late / failed" and the latest run.

### Courier status updates
- For **PostEx and Leopards** parcels (booked here or typed in), the courier's news is saved on the parcel and the order page shows it. **Refresh from courier** on an order asks right now and shows exactly what the courier said.
- **Orders move by themselves only if the owner switches on** "Update my orders automatically from the courier" (Settings, Couriers; off by default). Then out for delivery / delivered / returned follow the courier. Delivered records the cash collected, exactly as pressing Delivered by hand. Cancelled or already finished orders are never touched, and a parcel status never goes backwards.
- Beta: the courier tracking formats are written from the couriers' merchant documentation and tested with sample replies, but only a real merchant account proves them. That is why orders do not move on their own until the owner has checked a few "Refresh from courier" results. TCS and custom couriers have no tracking API here: update those orders by hand.

## Public sign-up site (store owners join like on Shopify)

The platform's own address (`PLATFORM_HOST`, for example `rooharka.pk`) shows a public site instead of a shop: home page (features, why it fits Pakistan, FAQ), `/pricing` (your plans from CSMI), `/signup`, `/terms` and `/privacy`. On any store's address these pages do not exist (404). In development, with `PLATFORM_HOST` unset, open `/platform`.

**Flow:** choose a plan and billing period, name the store (the address is suggested and checked live), enter name, email, mobile and a strong password, accept the terms. A sign-up *request* is saved (password already hashed; no store or login exists yet). The person confirms their email by pressing a button on the emailed link; then the store, its settings, checkout form, free-trial subscription and owner login are created together in one step and they land in `/admin`. With "I approve every new store myself" on (or whenever email is not set up) the request waits in CSMI, **Sign-ups**, until you press Approve or Reject.

**Your controls (CSMI, Sign-ups):** the kill switch (sign-ups start CLOSED), approval, free-trial days, a daily sign-up cap, brand name, support email/WhatsApp, an announcement bar, and the "how to pay" text store owners see. Plans (CSMI, Plans) hold the price, limits shown on the pricing page, a tagline and "Most popular". Plan limits are shown but **not enforced** by the platform yet.

**Lifecycle:** trial, then billing converts the subscription to paid and creates the first invoice; an unpaid invoice turns the store "past due" (never suspended automatically). Store owners see their plan, trial days left, invoices and how to pay under **Plan and billing**; a bar shows trial days left or overdue invoices.

**Set up:** `PLATFORM_HOST` (and a wildcard DNS record `*` to the same hosting so `store.rooharka.pk` works), `RESEND_API_KEY` + `MAIL_FROM` (optional: without them every sign-up needs your approval), then `pnpm db:push`, add a plan, open sign-ups. The Terms and Privacy pages are plain-language starting texts: have a lawyer review them. Security and error-handling rules: see `docs/SECURITY.md`.

## Running the platform from CSMI (approvals, plans, offers, banners, public site)
Everything below is controlled by you in `/csmi`; no code change or redeploy is needed.
- **Approvals** (`/csmi/approvals`): the one inbox for new accounts, shops waiting to go live to customers, and stores asking to use a service. "Not now" always needs a reason; the store owner is told by email, or you tap a ready WhatsApp message. Close a live shop or block a service from the store's own page. Turn on "new shops stay closed until I open them" in Sign-up settings, and "Needs my approval" per service on the Services page.
- **Plans** (`/csmi/plans`): prices, limits, included services, order on the pricing page. Untick "Show on pricing page" for a tailor-made plan for one client, then give it to the store from its page.
- **Offers** (`/csmi/offers`): discount codes (percent off the plan fee for the first N invoices, optional dates, plan and maximum uses). Share `/signup?offer=CODE`. The discount is its own line on the invoice.
- **Banners** (`/csmi/banners`): notices for visitors, store owners or both, between dates, in three styles.
- **Public site** (`/csmi/site`): headline, features (with icons), FAQ and which sections appear on the home page. **Clients** (`/csmi/clients`): the "Trusted by" logos and testimonials (show only businesses that agreed), plus an optional real store counter.
- After pulling these changes run `pnpm db:push` then `pnpm exec prisma generate` (new tables: Offer, Banner, ShowcaseClient; new fields on Store, StoreService, ServiceCatalog, Plan, Subscription, SignupRequest). Existing stores and services stay approved, so nothing live closes.

## The storefront (what your clients' customers see)
Every word and colour on a store's public site is controlled by its owner in the dashboard; nothing is shared between stores or hard-coded.
- **Storefront** (`/admin/storefront`): layout (modern many-product shop, or the **original single-product layout**, kept as a ready-made starting point), colour and heading style, logo, announcement bar, footer, social links, home page (headline, highlights, story, benefits, which sections show), questions, About text, Contact details and four policy pages. Changes show within 15 seconds.
- **Settings** still owns the store name, phone, WhatsApp, email, payments, delivery, tracking and the product page; the storefront reads them (header, footer, Contact page).
- **Pages**: Home `/`, Shop `/shop` (search, categories, sort, paging), Product `/product/<slug>` (breadcrumbs, gallery, sizes, reviews, related products), About `/about`, Contact `/contact` (message form), Track order `/track`, policies `/policies/<shipping|returns|privacy|terms>` (only linked when written), Checkout.
- **Messages** (`/admin/messages`): what customers send from the Contact page, with call, WhatsApp and email buttons and an unread count.
- Reviews on the home page are only real, approved customer reviews. There is no cart yet (one product per order), so the header has none.
- First store: `pnpm db:seed` gives it the original single-product (Darwaish) storefront if it has none; any store can load either starting point with one click.

## Staff limit and POS lite (decided by the platform owner)
**What it is for.** You (CSMI) decide, per plan and per store, how many people may sign in to a store's dashboard and whether the store gets a counter-sale screen. Stores can never change either.

- **Staff limit.** Counts active managers and staff; the owner is always free. Set it on the plan (Plans page, "Staff logins": empty = unlimited, 0 = owner only) and override it for one store on its page ("Staff limit and POS lite": empty = follow the plan, a number, or `unlimited`). A store with no plan gets a safe default of 2.
- **Team page** (`/admin/team`, owner only): add a person (name, email, role, starting password), switch them off (signed out at once), switch them on, reset their password. Adding or switching on checks the limit on the server under a lock on the store row, so two clicks can never take the last slot. If you lower a limit, nobody is removed; the store just cannot add more.
- **POS lite** (`/admin/pos`): tick "POS lite" on a plan, or set the store to Always on / Always off. It rings up a counter sale as an ordinary order (marked "counter"), already paid and delivered: stock is reduced safely, prices come from the database, an optional mobile number builds the customer's history (otherwise one "Walk-in customer" profile), payment is *recorded* (cash with change, card, JazzCash, EasyPaisa, bank transfer; nothing is charged from here). Includes a print receipt, today's takings per method, and "Cancel sale" (managers and owners): stock goes back and the sale is marked refunded.
- Code: `lib/entitlements/` (rules, service), `lib/team/`, `lib/pos/` (rules are pure and tested in `tests/entitlements.test.ts`).
- After pulling run `pnpm db:push` (adds `Store.staffLimit`, `Store.posMode`, `Order.source`, `Order.soldById`, payment methods CASH and CARD) and `pnpm exec prisma generate`. Existing plans do not include POS until you tick it (or set stores to Always on).

## Product types, variants and units
**What it is for.** A store owner chooses how each product is sold when creating it (the type cannot be changed later; existing products behave as "with variants" exactly as before).

- **Simple product**: one SKU counted in pieces, boxes, bags, packs... (whole numbers, own stock).
- **Product with variants**: the owner lists options (`Size: S, M, L` and `Colour: Red, Blue`, up to 3 options and 100 combinations). The system builds every combination as its own variant with its own SKU (like `TSHIRT-M-RED`), price and stock. Editing the options later only adds missing combinations, switches off removed ones and revives returned ones; nothing is deleted, so orders and stock history stay intact. Customers pick each option with buttons; combinations that are sold out are marked.
- **Measurable product**: sold by weight, volume or length. The unit table (`lib/units/registry.ts`) is the only place units live: g, kg, tola, seer, maund, mL, L, mm, cm, m, gaz; add a unit with one line. Stock and order quantities are stored as whole base units (grams, millilitres, millimetres) so stock never drifts; the price is per selling unit (Rs. 850 per kg) and the line is rounded to a whole rupee. The owner sets a smallest order and an order step (for example 0.5 kg and 0.25 kg); customers use +/- or type an amount, and the server enforces the same rule on every order and counter sale.
- Orders keep a snapshot of the unit (`OrderItem.unitCode`), so receipts, tracking, the admin order page and courier summaries read "1.5 kg" or "3 boxes". POS lite supports all three types.
- Code: `lib/units/` (registry, quantity rules), `lib/variants/rules.ts`, `lib/admin/product-rules.ts`; tests in `tests/units.test.ts` and `tests/product-types.test.ts`.
- After pulling run `pnpm db:push` (adds `Product.type/optionGroups/unitCode/qtyMin/qtyStep`, `ProductVariant.optionValues`, `OrderItem.unitCode`) and `pnpm exec prisma generate`.

## Courier layer (PostEx)

One contract for every courier: `lib/couriers/contract.ts` (the `CourierAdapter` interface, the one status vocabulary), `factory.ts` (name -> adapter), `vault.ts` (encrypted tokens), `webhook.ts` (the router), `idempotent.ts` (book at most once).

- **Only `lib/couriers/postex.ts` knows PostEx** (endpoints, fields, status words). Order code never imports it.
- **Add a courier:** one adapter file + one `case` in `factory.ts` + one 3-line route in `app/api/webhooks/<courier>/[tenantId]/route.ts`. No order code or database change.
- **Vault:** table `tenant_courier_credentials`. Token is AES-256-GCM encrypted (key = `APP_SECRET` env var), bound to its store and courier, decrypted only inside `withCredentials` for one call; never logged, never returned.
- **Connect:** Settings > PostEx. Paste token > Connect. A harmless read-only call proves it, only then is it saved.
- **Automatic booking:** every new online order (and every confirmed advance payment) is booked after checkout answers the customer. The order number is the idempotency key. A claim row is written under an order row lock BEFORE the courier is called; a timeout leaves the claim, so a retry never books twice (the owner is told to check PostEx and use "Add shipment"). The daily job retries orders that were missed.
- **Webhook:** `/api/webhooks/postex/<storeId>?key=<store key>` (the owner sees the link in Settings). Key is derived per store+courier; only that store's parcels are looked up. Statuses are saved as `label_created, picked_up, in_transit, out_for_delivery, delivered, exception` (stored as the existing `ShipmentStatus` values); PostEx wording is never stored.
- **Before launch:** confirm the PostEx field names (cancel call, webhook body, webhook authentication) against PostEx's official docs/sandbox, then test with one real merchant token, real orders and real webhooks. This cannot be done without a PostEx merchant account.

## Product admin (Shopify-style)

- **List** (`/admin/products`): search (name, SKU, barcode, vendor, tag), status tabs with counts, low-stock / sold-out filters, category and type filters, sorting, 25 per page, bulk actions (activate, draft, archive, feature, move to category, add/remove tags, delete) and **Export (CSV)**. Filters live in the address, so a filtered list can be bookmarked.
- **Editor** (`/admin/products/[id]`): two columns. Left: media, details, one **variants grid** (price, crossed-out price, cost with profit and margin, stock, SKU, barcode, weight, track stock, on sale), search-engine preview with editable page address. Right: status, organisation (category, vendor, tags), how it is sold.
- **Duplicate**: `duplicateProduct` copies the product with every connection: variants (new SKUs), media links (same files), page sections, category, vendor, tags, options, unit, SEO. Not copied: reviews, orders, barcodes; stock only if ticked. The copy is a draft.
- New columns: `Product.vendor`, `Product.tags`, `ProductVariant.costPrice`, `ProductVariant.barcode` (run `pnpm db:push`). Cost is never selected by storefront queries.
- Rules are pure and tested in `lib/admin/product-extras.ts` (`tests/product-extras.test.ts`). The CSV export defuses cells starting with `= + - @` so a product name can never run as a spreadsheet formula.

## Product module (MVP brief, Nov 2026)

How the brief maps onto this codebase: `title` = `Product.name`, `handle` = `Product.slug`, `tenant_id` = `storeId`. Money stays `Decimal(12,2)` (exact, never a float). Price, SKU, stock and weight live on `ProductVariant` (a simple product has exactly one).

- **Fields:** product type, vendor, tags, Google category (`taxonomyId` + `taxonomyPath`), taxable, physical product, weight unit (kg/g/lb, stored in grams), origin country, HS code; per variant: cost (private), barcode, `allowBackorder`, `imageId`, `storeId`.
- **Rules** (`lib/admin/product-mvp.ts`, tested): crossed-out price must be higher than the price; page address unique per store with a suggested free one; **SKU unique per store** (`@@unique([storeId, sku])` plus a readable check); 2 options and 100 variants in the UI (schema allows 3).
- **Rich text:** `components/admin/RichTextEditor.tsx`. The server rebuilds the HTML from an allow-list (`sanitizeHtml`) before saving and again before showing. Old plain-text descriptions still display.
- **AI description:** `lib/ai/describe.ts`. Uses the store's own Anthropic key (Settings > AI writing assistant) or the platform's `ANTHROPIC_API_KEY`; model from `AI_MODEL`. 10 per store per hour, counted in `AiUsage` under a row lock; every request is logged.
- **Google taxonomy:** `lib/taxonomy/`. Read-only; fetched from Google and kept in memory for a day; only the id from the form is trusted.
- **Media:** same Cloudinary pipeline. Drag-and-drop order (`reorderMedia`); the first photo is the main picture. Video size per plan (`Plan.limits.videoMb`, default 20 MB, set in CSMI > Plans), checked on the server.
- **Variants table:** `components/admin/VariantGrid.tsx`, windowed above 16 rows (`lib/admin/window.ts`), "set for all" boxes, photo per variant (shown in the shop gallery when picked).
- **Collections:** manual only. `/admin/collections`, shop page `/collections/<handle>`.
- **Backorder:** `stockLimited()` in `lib/units/quantity.ts` is the one rule used by checkout, POS and the shop.
- **Tenant isolation:** `tests/tenant-isolation.test.ts` reviews every query in the product, collection and courier code for a store filter.

After pulling: `pnpm db:push`, `pnpm exec prisma generate`, then once `pnpm exec tsx scripts/backfill-variant-store.ts` (gives old variants their store so the store-wide SKU rule covers them).

## Preview store

The eye button in the dashboard ("Preview store", and "Preview it in your shop" on a draft product) opens the shop as the owner sees it: draft products included, and even before the shop is approved.

1. `/admin/preview?path=...` (signed-in staff only) makes a **one-minute link token** for this store and this person at the moment of the click and sends the browser to the shop's own address.
2. `/api/preview?secret=...&slug=...` checks the token, checks that the shop at this address IS the token's store and that the person is still an active member, switches on Next.js draft mode, and sets a signed one-hour **session pass** cookie (`rk_preview`). Cookies are `SameSite=None; Secure` on https.
3. Shop data (`lib/data/catalog.ts`, `lib/data/product.ts`) asks `isPreviewFor(storeId)` and uses `visibleStatuses()`: live only for customers, live + draft in preview, never archived. The preview catalogue is never put in the shared 15-second memory.
4. `PreviewBanner` (bottom bar) with **Exit preview** -> `/api/disable-preview`.

Why not draft mode alone: its cookie has the same value for every store on the platform, so it cannot tell one store's owner from another's. Drafts show only with draft mode AND a valid pass for the store being viewed. Orders and phone codes are refused in preview. Rules and tests: `lib/preview/rules.ts`, `tests/preview.test.ts`. No database change.

Note: pages still send `X-Frame-Options: DENY` (anti-clickjacking), so the preview opens in a new tab, not inside a frame.
