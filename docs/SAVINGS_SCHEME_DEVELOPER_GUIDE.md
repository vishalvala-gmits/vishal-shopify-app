# Jewellery Savings Scheme — Developer Guide

This doc explains what was built, how the pieces fit together, and how to run, extend, and debug the feature. It assumes you've read the original spec at `docs/SHOPIFY_SAVINGS_SCHEME_IMPLEMENTATION_PLAN.md` for business context — this doc is about the actual implementation.

## 1. What this feature does

Merchants configure a "savings scheme" (a monthly gold/jewellery contribution plan) per shop and assign it to specific products. Customers see a calculator widget on the product page (via a Theme App Extension), pick a monthly amount with a slider or preset buttons, and submit an "enquiry" (interest form) — no real payment happens in V1. Merchants view submitted enquiries in the admin.

## 2. High-level architecture

```
Shopify Admin (embedded app)
  /app/savings-scheme            <- merchant configures the scheme
  /app/savings-scheme/enquiries  <- merchant views submitted enquiries
        |
        v
   Prisma / SQLite (this app's own DB — NOT Shopify's product DB)
        |
        v
Theme App Extension (runs on the live storefront, outside this app's origin)
  extensions/savings-scheme/
        |  calls over plain HTTPS fetch (no App Proxy)
        v
   /api/storefront/savings-scheme    <- GET, returns scheme config for a product
   /api/storefront/savings-enquiry   <- POST, submits + recalculates + stores an enquiry
```

Two separate runtimes matter here:
- **The React Router app** (`app/`) — everything Shopify-authenticated (admin UI) plus the two public JSON APIs the storefront calls.
- **The Theme App Extension** (`extensions/savings-scheme/`) — plain Liquid + vanilla JS/CSS that Shopify serves directly on the merchant's storefront. It has no access to this app's code or env vars at runtime — it only knows what's baked into the Liquid block and what it fetches over HTTP.

## 3. File map

```
prisma/schema.prisma                                  Data model (see §4)
prisma/migrations/20260908042211_add_savings_scheme_tables/

app/services/
  savingsSchemeCalculator.server.ts   Pure calculation function (single source of truth)
  savingsSchemeValidation.server.ts   Admin form validation + enquiry field validation
  savingsScheme.server.ts             Prisma access: get/upsert scheme, replace product assignments
  resolveShop.server.ts               Shop resolution (?shop= param) + CORS origin validation
  rateLimit.server.ts                 In-memory rate limiter (enquiry endpoint only)

app/routes/
  app.savings-scheme.tsx              Admin: create/update the scheme + assign products
  app.savings-scheme_.enquiries.tsx   Admin: read-only paginated enquiry list
  api.storefront.savings-scheme.tsx   Public GET: scheme config for a product
  api.storefront.savings-enquiry.tsx  Public POST: submit an enquiry

extensions/savings-scheme/
  shopify.extension.toml
  blocks/savings-scheme.liquid        App block markup + schema (targets product pages)
  assets/savings-scheme.js            Slider/presets/calculation-mirror/enquiry-form logic
  assets/savings-scheme.css           Scoped styles (jss- prefix)
  locales/en.default.json

vitest.config.ts
app/services/*.test.ts                Unit tests for the above services
```

Route naming note: `app.savings-scheme_.enquiries.tsx` has a **trailing underscore** on `savings-scheme_`. This is intentional — React Router's flat-routes convention treats `app.savings-scheme.enquiries.tsx` as a *child* of `app.savings-scheme.tsx` (nesting inside it as a layout, which it isn't built to be). The trailing `_` opts the enquiries route out of that nesting so it renders as an independent sibling page. **Do not rename this file to remove the underscore** — that will silently break the enquiries page (it'll render inside the scheme-settings layout instead of on its own).

## 4. Data model (`prisma/schema.prisma`)

Three new tables, all scoped by a plain `shop` string column (the shop's `.myshopify.com` domain) — **never trust a query without filtering by `shop`**.

- **`SavingsScheme`** — one row per configured scheme. Holds duration, bonus config, min/max amount, `presetAmounts` (stored as Prisma `Json`, a plain `number[]`), gift config, currency symbol, primary color, and `status` (`"active"` / `"inactive"`).
- **`SavingsSchemeProduct`** — join table: which Shopify product IDs (GIDs, stored verbatim as strings) a scheme is assigned to. `@@unique([shop, shopifyProductId])` — a product can only have one scheme assignment per shop.
- **`SavingsEnquiry`** — one row per customer submission. Stores a **snapshot** of duration/bonus/contribution/benefit/gift at submission time, not a live reference — so if the merchant edits the scheme later, historical enquiries still show what the customer actually saw.

Design choices worth knowing:
- **Money is stored as plain `Int`** (whole rupees, e.g. `10000`), not decimal/float. SQLite has no safe native decimal type, and every example in the business spec is a whole number. If you ever need fractional currency, that's a deliberate future migration, not an oversight.
- **`onDelete: Restrict`** on `SavingsEnquiry → SavingsScheme` — you cannot hard-delete a scheme that has enquiries against it (protects historical data). Use `status = "inactive"` instead of deleting.
- **`onDelete: Cascade`** on `SavingsSchemeProduct → SavingsScheme` — deleting a scheme does clean up its product assignments.

To change the schema: edit `prisma/schema.prisma`, then run `npx prisma migrate dev --name <description>` (this also regenerates the Prisma client — `npm run setup` only runs `migrate deploy`, which does NOT regenerate the client, so don't rely on it during local schema changes).

## 5. The calculation logic — one function, reused everywhere it matters

`app/services/savingsSchemeCalculator.server.ts`:

```ts
calculateSavingsScheme({ monthlyAmount, durationMonths, bonusEnabled, bonusMonths })
  → { monthlyAmount, durationMonths, totalContribution, bonusAmount, totalBenefit }
```

```
totalContribution = monthlyAmount * durationMonths
bonusAmount       = bonusEnabled ? monthlyAmount * bonusMonths : 0
totalBenefit      = totalContribution + bonusAmount
```

**The gift value is never added to `totalBenefit`.** This is a deliberate business rule (a regression test in `savingsSchemeCalculator.server.test.ts` guards it) — the gift is always displayed as a separate line item.

This function is pure (no DB, no I/O) and is the **authoritative** version used by the enquiry API for server-side recalculation. The Theme Extension's JS (`assets/savings-scheme.js`) has its own small hand-written copy of the same formula for instant client-side display — this is an accepted, deliberate duplication (there's no shared module boundary between a Theme App Extension bundle and the React Router app). It's safe because the enquiry POST always recalculates authoritatively server-side regardless of what the browser displayed or sent.

## 6. Validation (`savingsSchemeValidation.server.ts`)

Two independent validators:
- `validateSavingsSchemeInput(input)` — admin form rules (name required, duration ≥ 1 integer, max ≥ min, presets within range with no duplicates, bonus/gift conditional requirements, valid hex color). Returns `Record<string, string[]>` — empty object means valid.
- `validateMonthlyAmount({ monthlyAmount, minAmount, maxAmount })` — used by the enquiry API to reject non-numeric/NaN/Infinity/negative/out-of-range amounts. Deliberately does **not** require an exact preset match — any value between min and max (e.g. from the slider) is valid.

Plus `isValidEmail` / `isValidPhone` helpers.

## 7. Admin routes

### `/app/savings-scheme` (`app.savings-scheme.tsx`)

- **Loader**: `authenticate.admin(request)` → `getSchemeForShop(session.shop)`. V1 manages **exactly one scheme per shop** (find-or-create pattern) — the schema supports multiple schemes, but the admin UI doesn't expose that yet.
- **Action**: reads `FormData`, validates, and:
  1. If there are selected product IDs, re-validates them against Shopify via `admin.graphql(...)` (a `nodes(ids:)` query) — this is inherently shop-scoped by the authenticated session, so any product it returns is guaranteed to belong to the current shop.
  2. Upserts the scheme (`upsertSchemeForShop`) and replaces its product assignments (`replaceSchemeProducts`, done as a transaction: delete-all-then-recreate).
  3. Returns a plain object — **never a `Response` with a non-2xx status** (see the callout in §9 below, this is a real gotcha).
- Product selection uses App Bridge's `shopify.resourcePicker({ type: "product", multiple: true })`.
- Form fields use Polaris **web components** (`<s-text-field>`, `<s-number-field>`, `<s-switch>`, etc.) — this project does not use the classic `@shopify/polaris` React component library.

### `/app/savings-scheme/enquiries` (`app.savings-scheme_.enquiries.tsx`)

Read-only, paginated (`?page=` query param, 20 per page), scoped to `session.shop`. No edit/delete — enquiries are immutable once created.

## 8. Storefront APIs

Both routes share `resolveShopFromRequest(request)` from `resolveShop.server.ts`: reads `?shop=<domain>` from the query string, validates the format, and confirms an installed `Session` row exists for that shop. **This is the entire tenant-isolation mechanism for these public routes** — there is no Shopify App Proxy and no HMAC signature verification in V1 (see §11, Known limitations).

### `GET /api/storefront/savings-scheme?shop=...&productId=...`

Looks up the `SavingsSchemeProduct` + its scheme for that shop/product. Returns `{ enabled: false }` if no assignment or the scheme is inactive; otherwise returns the scheme config in the exact shape the storefront JS expects (name, duration, bonus config, min/max, presets, gift, currency symbol, primary color). Internal DB fields (`id`, `createdAt`, etc.) are never exposed.

### `POST /api/storefront/savings-enquiry?shop=...`

Body: `{ productId, name, email?, phone?, monthlyAmount, sourceUrl? }`. **The server never trusts any totals the client might send** — it only reads `monthlyAmount`, looks up the product's active scheme, validates the amount against that scheme's min/max, and recalculates `totalContribution`/`bonusAmount`/`totalBenefit` itself via `calculateSavingsScheme` using the scheme's own `durationMonths`/`bonusEnabled`/`bonusMonths`. The resulting snapshot is what gets saved to `SavingsEnquiry`.

### CORS (why it's more complex than a simple `*`)

A shop's live storefront is very often served from a **custom domain** (`www.example.com`), not its `*.myshopify.com` domain — and the browser's `Origin` header reflects whatever domain the page is actually running on. `buildCorsHeadersForOrigin(shop, request)` in `resolveShop.server.ts`:
1. Reads the request's actual `Origin` header.
2. Fetches the shop's real domains (`myshopifyDomain` + all `domains[].host`) via `unauthenticated.admin(shop).graphql(...)`, cached in-memory for 5 minutes per shop.
3. Only reflects the origin back in `Access-Control-Allow-Origin` if it matches one of those real hosts. No match (or no `Origin` header at all) → no CORS header is set, so cross-origin browser reads are denied by default.

**If you ever see the widget fail only in the browser but the API works fine when tested with curl/Postman, check this first** — it's almost always a CORS/Origin mismatch, not a server bug.

### Rate limiting

`rateLimit.server.ts` — a simple in-memory fixed-window counter, keyed by `shop:clientIP`, applied only to the enquiry POST route (5 submissions / 10 minutes by default). It resets on server restart and doesn't share state across multiple server processes — acceptable for V1's scale, flagged as a future hardening item if the app ever runs multiple instances.

## 9. Gotcha: action responses must not use HTTP error status codes

This bit us twice during development, so it's worth its own section.

React Router v7's "single fetch" mode (the current default) does **not** deliver a `Response` with a non-2xx status from an `action` back to `fetcher.data` the way you might expect from classic Remix. Instead, `singleFetchAction` throws it, and — critically — a `useFetcher` submission doesn't route through the page's `ErrorBoundary` (only navigations do), so it surfaces as a bare, unhelpful **"Bad Request"** error in the console.

**The rule for any action driven by `useFetcher`/`fetcher.Form` in this codebase:**
- Return a **plain object** (implicit 200) for both success and validation-failure outcomes. Put your success/failure discriminant in the object shape itself (see `ActionResult` in `app.savings-scheme.tsx` — `{ success: true }` vs `{ success: false, errors, submitted }`).
- Only `throw` a `Response` for things that should genuinely interrupt the flow (e.g. letting a Shopify auth redirect propagate — `authenticate.admin()` can legitimately throw a `Response` when a session needs reauth; don't swallow that).
- Wrap risky operations (external API calls like `admin.graphql`, DB writes) in `try/catch` inside the action, and convert unexpected errors into the same object shape (see the `catch` block in `app.savings-scheme.tsx`'s action) rather than letting them throw uncaught.

The two storefront API routes (`api.storefront.savings-scheme.tsx`, `api.storefront.savings-enquiry.tsx`) are **not** affected by this — they're plain HTTP endpoints called via `fetch()` from the Theme Extension's JS, not through React Router's data-fetching layer, so returning `Response.json(..., { status: 400 })` there is correct and expected.

## 10. Theme App Extension

`extensions/savings-scheme/blocks/savings-scheme.liquid` — an app block targeting product pages only (`enabled_on.templates: ["product"]`). It renders a container div carrying `data-shop`, `data-product-id` (built as a GID from `{{ product.id }}`), and `data-app-url` (a **merchant-configured block setting** — see below), then loads `savings-scheme.js`/`.css` via the schema's `javascript`/`stylesheet` fields (auto-injected once per page by Shopify).

**Why `data-app-url` is a manual setting, not auto-detected:** there's no App Proxy in this design, so the extension's JS has no built-in way to know this app's backend URL — Liquid inside a theme app extension has no access to this app's env vars. The merchant (or you, during dev) must paste the app's backend URL into the block's settings in the theme editor. In dev, this is your `shopify app dev` tunnel URL (changes every session unless you have a persistent tunnel); in production, it's your app's stable `application_url` — set once.

`assets/savings-scheme.js` handles: loading state → fetch scheme config → hide the widget entirely if `enabled: false` → render slider + preset buttons (kept in sync with each other) → live-recalculate on every change using the mirrored formula → conditionally show bonus/gift sections → on "Continue," reveal the enquiry form → POST to the enquiry endpoint → show success/error state.

To add the block to a product page: **Online Store → Themes → Customize → switch to a Product template → click into the main product section → Add block → "Savings Scheme Widget"**. Then set its App URL setting and make sure the product has an active scheme assigned in `/app/savings-scheme`.

## 11. Known V1 limitations (intentional, not bugs)

- **No App Proxy / no HMAC signature verification.** Tenant isolation on the public storefront routes relies solely on `?shop=` + confirming an installed session exists. Someone could pass another installed shop's domain as `?shop=` to read that shop's scheme config or submit enquiries under it. Hardenable later via a proper App Proxy.
- **Money has no fractional/decimal support** (whole-unit `Int` only).
- **Rate limiter is in-memory**, per-process — doesn't survive restarts or scale across multiple server instances.
- **Legacy storefront routes are untouched.** `app/services/storefront.server.ts`, `api.storefront.products.tsx`, and `app.api.mobile.home.tsx` remain single-tenant (hardcoded via env vars) — they predate this feature and were deliberately left alone.
- **Single scheme per shop** in the admin UI (schema supports more, UI doesn't expose it yet).

## 12. Running and testing locally

```bash
npm run dev          # shopify app dev — starts the app + a tunnel; note the printed tunnel URL
npm run typecheck    # react-router typegen && tsc --noEmit
npm run lint         # eslint
npm run test         # vitest run — all savings-scheme service unit tests
npm run build        # react-router build
npx shopify app build   # validates + bundles the theme app extension (theme-check)
```

After any `prisma/schema.prisma` change: `npx prisma migrate dev --name <description>` (regenerates the client too).

Test files live next to the service they test (`app/services/*.test.ts`). Coverage today: the full calculation matrix + edge cases (bonus off, custom duration, min=max, gift-never-included regression), admin validation rules, monthly-amount bounds, shop resolution, and CORS origin matching (myshopify domain, custom domain, rejected foreign origin, Admin API fallback).

## 13. Extending this feature

- **Adding a new admin-configurable field**: add the column to `SavingsScheme` in `schema.prisma` → migrate → add it to `SchemeUpsertInput`/`upsertSchemeForShop` in `savingsScheme.server.ts` → add validation in `savingsSchemeValidation.server.ts` → add the form field in `app.savings-scheme.tsx` → add it to the storefront API response shape in `api.storefront.savings-scheme.tsx` if the storefront needs to see it → mirror any display logic in `savings-scheme.js`.
- **Supporting multiple schemes per shop**: the schema already supports it (`SavingsScheme.shop` isn't unique). You'd need to change `getSchemeForShop`/the admin UI from find-or-create to a list+detail pattern, and change product assignment resolution (`SavingsSchemeProduct` is already `@@unique([shop, shopifyProductId])`, so a product can still only have one active scheme — that constraint would need rethinking if a product should be assignable to multiple schemes).
- **Moving to an App Proxy**: would replace `resolveShopFromRequest`'s query-param approach with HMAC-verified requests from Shopify itself; the storefront JS would call `/apps/<subpath>/...` instead of the app's raw origin, and the CORS logic in `resolveShop.server.ts` would become unnecessary (App Proxy requests are server-to-server, not subject to browser CORS).
