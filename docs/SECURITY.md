# Security measures and error handling

The rules this platform keeps. Read this before changing sign-in, sign-up, billing, integrations or anything that touches another store's data. Every rule below is enforced **on the server**; hiding a button is never security.

## Security measures

**Accounts and sign-in**
- Passwords are hashed with scrypt; the plain password is never stored or logged. Minimum 12 characters, with a strength check (not the email, not repetitive).
- A sign-in creates a random session token held in an httpOnly cookie; only its hash is stored. Changing the password signs every other browser out.
- 5 wrong passwords lock the account for 15 minutes. Every failure shows one generic message and takes the same time, so nobody can discover which emails exist.
- Two-factor protection (authenticator app codes, RFC 6238) with single-use recovery codes. A used code cannot be replayed; wrong codes count towards the lockout. Turning it off needs the password and a current code. Lost phone and codes: `pnpm admin:reset-2fa`.
- Per-IP and per-account rate limits on sign-in, sign-up, codes, slug checks and OTP sending. The owner area (CSMI) is stricter.
- The platform owner login (CSMI) is separate from store logins: store staff cannot enter CSMI and platform staff cannot enter a store.

**Data**
- Every store-owned query is filtered by `storeId`. An id from another store never matches.
- Store owners' API keys (couriers, SMS, wallets) are encrypted with AES-256-GCM using `APP_SECRET`. Secrets never appear in error messages, logs or pages.
- Signed, short-lived tokens for the phone-verification cookie and the two-factor step; compared in constant time.
- Outbound requests only go to public https addresses (no internal networks), with timeouts and strict reply parsing.
- CSV exports neutralise spreadsheet formulas. User text is escaped in emails and pages.
- The audit log records every important change (who, what, when, before and after).

**Platform**
- Admin and CSMI pages send `noindex` and `no-store` headers.
- Scheduled jobs (`/api/cron/*`) refuse to run without a long `CRON_SECRET`; with no secret they are off.
- The public site exists only on the platform's own address (`PLATFORM_HOST`); on a store's address its pages return 404.

**Sign-up**
- Email is verified **before** a store exists; until then only a request exists (no store, no login), so nobody can squat an address or someone else's email.
- The emailed link works once, expires in 24 hours, and only its hash is stored. Opening the link does not use it up (a button must be pressed), so email scanners cannot consume it.
- Reserved store addresses (admin, csmi, api, www, courier and wallet names…) cannot be taken.
- Honeypot field, per-IP and per-email limits, a daily sign-up cap, and the same answer whether or not an email already has an account.
- CSMI kill switch (sign-ups closed by default) and optional manual approval. Without email set up, every sign-up needs approval.
- Passwords are hashed before the request is saved.

## Error handling

- Every server action returns a readable message and **changes nothing** on failure. Messages never reveal stack traces, secrets, or whether an email exists.
- Writes that must go together use one database transaction (for example: store + settings + checkout form + subscription + owner login).
- Repeatable jobs (billing, courier sync) are idempotent and run under a database lock so they never overlap. One failing store or parcel never stops the rest of the batch; failures are counted and shown.
- Outside services (couriers, SMS, email) get timeouts and strict reply parsing. An unknown or broken reply means "no change", never a guess.
- Booked-but-not-saved situations (a courier took the parcel but saving failed) tell the owner loudly, with the tracking number, so nothing is booked twice.
- A database problem on a public page shows a calm fallback ("plans are being prepared", sign-ups closed) instead of an error page.
- Pages read defensively: missing or malformed saved settings fall back to safe defaults (for example, sign-ups closed).

## Operator checklist
- Set `APP_SECRET` (never change it casually: saved keys become unreadable) and `CRON_SECRET`.
- Set `PLATFORM_HOST`, and `RESEND_API_KEY` with `MAIL_FROM` if you want email confirmation.
- Rotate the Neon password that was exposed earlier; keep the database and hosting in the same region.
- After pulling schema changes: `pnpm db:push` then `pnpm exec prisma generate`.
- Turn on two-factor protection for the owner login.
- Have a lawyer review the Terms and Privacy pages before relying on them.

## Approvals (platform owner is the only authority)
- Three gates: new account (sign-up queue), shop go-live (`Store.shopApproval`), service use (`StoreService.approval`, plus `ServiceCatalog.requiresApproval`).
- Enforced in ONE place each: `getCurrentStore()` returns null for a shop that is not APPROVED (pages, APIs and checkout all close together); `getServiceSecrets()` reports a service as off unless approval is APPROVED, so a held or blocked service never runs even if the store ticked it.
- Every refusal needs a reason (5-300 chars, `reasonProblem`). The reason goes to the store owner (dashboard banner, service card, email or WhatsApp link) and is NEVER shown to shop customers.
- Decisions need `csmi.manage` and are audited (`csmi.shop.decide`, `csmi.service.decide`, `csmi.signup.*`) with the reason.
- Existing stores/services default to APPROVED so nothing live closes on upgrade.
