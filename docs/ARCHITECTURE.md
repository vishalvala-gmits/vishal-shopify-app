# Architecture

## Overview

This is a public-distribution embedded Shopify app (`distribution: AppDistribution.AppStore` in `app/shopify.server.ts`). It has two customer-facing surfaces sharing one backend:

- **App Home** (Shopify Admin, merchant-facing): configure a "savings scheme" (a monthly-premium jewelry savings plan) and review customer enquiries.
- **Storefront extension** (buyer-facing): a savings calculator widget embedded on product pages, letting shoppers pick a monthly amount and submit an enquiry.

```text
                         Shopify
                            |
                  +---------+---------+
                  |                   |
             Shopify Admin       Storefront (theme)
                  |                   |
             App Home iframe     savings-scheme extension block
                  |                   |
              App Bridge        savings-scheme.js/css (vanilla JS)
                  |                   |
        +---------+----------+        |
        |                    |        |
    Frontend              Backend  <--+  (calls api.storefront.* routes)
        |                    |
    React Router routes   React Router loaders/actions
    Polaris web components  Prisma (SQLite)
    (app/routes/app.*)      Admin GraphQL client
                             (app/routes/api.storefront.*,
                              app/routes/webhooks.*)
```

## Frontend

- Framework: React Router v7 (file-based routing under `app/routes/`), Polaris web components (`s-*` custom elements, no `@shopify/polaris` React library).
- Embedded shell: `app/routes/app.tsx` wraps all `/app/*` routes in `AppProvider` (`@shopify/shopify-app-react-router/react`), which injects the App Bridge CDN script (`https://cdn.shopify.com/shopifycloud/app-bridge.js`) and Polaris runtime script automatically when `embedded` is true.
- Storefront widget: `extensions/savings-scheme/` is a theme app extension block (`blocks/savings-scheme.liquid` + `assets/savings-scheme.js` + `assets/savings-scheme.css`), plain vanilla JS with no build step, rendered directly by the theme.

## Backend

- All `/app/*` routes call `authenticate.admin(request)` from `app/shopify.server.ts` (session-token/OAuth backed) before doing anything.
- All `/api/storefront/*` routes are **public** (no Shopify session) but validate the `shop` query param against an installed session and a strict `*.myshopify.com` regex (`app/services/resolveShop.server.ts`) before touching data.
- Admin GraphQL is the only Shopify data API used — no REST Admin API calls anywhere in the codebase.
- Database access goes through Prisma (`app/db.server.ts`), one shared client instance (dev-mode global-singleton pattern to survive HMR).

## Data model (`prisma/schema.prisma`)

| Model | Purpose |
|---|---|
| `Session` | Shopify session storage (via `PrismaSessionStorage`), required by `@shopify/shopify-app-react-router`. |
| `SavingsScheme` | One scheme per shop: duration, bonus rules, contribution range, gift config, currency/color, terms text, status. |
| `SavingsSchemeProduct` | Join table — which Shopify products a scheme is assigned to. |
| `SavingsEnquiry` | A buyer's submitted enquiry: contact info, chosen monthly amount, computed totals, gift name/value snapshot, and `giftEligible` (computed at submission time). |

## Routes map

| Route | Auth | Purpose |
|---|---|---|
| `app/routes/app.tsx` | Admin session | Embedded shell + nav (`AppProvider`, `s-app-nav`) |
| `app/routes/app._index.tsx` | Admin session | Home dashboard — scheme status, enquiry count |
| `app/routes/app.savings-scheme.tsx` | Admin session | Scheme settings form (create/edit) |
| `app/routes/app.savings-scheme_.enquiries.tsx` | Admin session | Enquiries table — search, gift eligibility, delete |
| `app/routes/app.api.upload-gift-image.tsx` | Admin session | Uploads a gift image to Shopify Files (staged upload + `fileCreate`) |
| `app/routes/api.storefront.savings-scheme.tsx` | Public + shop validation | Storefront widget reads scheme config for a product |
| `app/routes/api.storefront.savings-enquiry.tsx` | Public + shop validation + rate limit | Storefront widget submits an enquiry |
| `app/routes/auth.$.tsx` | Shopify OAuth | OAuth begin/callback (delegated to the Shopify library) |
| `app/routes/webhooks.app.uninstalled.tsx` | Webhook HMAC | Deletes shop's sessions on uninstall |
| `app/routes/webhooks.app.scopes_update.tsx` | Webhook HMAC | Updates stored session scope on scope change |

## Services (`app/services/`)

- `savingsScheme.server.ts` — scheme CRUD (Prisma).
- `savingsSchemeCalculator.server.ts` — pure contribution/bonus/benefit math (deliberately excludes gift value — see its test file for the explicit assertion).
- `savingsSchemeValidation.server.ts` — form/input validation shared by the admin form action and the storefront enquiry endpoint.
- `resolveShop.server.ts` — shop-parameter validation + dynamic CORS allowlist (myshopify domain + connected custom domains) for public storefront routes.
- `rateLimit.server.ts` — in-memory per-key rate limiter; bypassed only when `NODE_ENV === "development"`.

## What's still template scaffolding

None — `app/routes/app._index.tsx` and the removed `app.additional.tsx` were the last unmodified Shopify CLI scaffold pages; the Home page now reflects real app state (see git history for the 2026-09-08 rewrite).

## Extension: `extensions/savings-scheme/`

Theme app extension, one block target (`section`, enabled on the `product` template). No build step — the `.js`/`.css` assets ship as-is. Configuration (`app_url`) is set per-block in the theme editor and used to construct the API calls to this app's backend.
