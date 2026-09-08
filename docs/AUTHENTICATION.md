# Authentication

## Library

`@shopify/shopify-app-react-router` (`app/shopify.server.ts`), configured with:

```ts
shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: { expiringOfflineAccessTokens: true },
});
```

Do not hand-roll OAuth, token exchange, or session validation — the library owns this entirely. See `app/routes/auth.$.tsx`, a two-line route that delegates everything to `authenticate.admin(request)`.

## Three separate authentication concerns

### 1. Install / OAuth

Handled by the library at `authPathPrefix` (`/auth`), catch-all route `app/routes/auth.$.tsx`. Shopify redirects the merchant through `/auth` → OAuth consent → `/auth/callback` (library-internal) → back into the embedded app. Nothing in this repo implements OAuth manually.

### 2. App Home request auth (admin routes)

Every `/app/*` route loader/action calls:

```ts
const { session, admin } = await authenticate.admin(request);
```

This validates the embedded session token (or falls back to OAuth redirect if missing/expired) and returns a `session` (shop, scopes) and an `admin` GraphQL client scoped to that shop. **Every** admin route in this app does this as its first line — grep for `authenticate.admin` in `app/routes/app.*.tsx` to confirm before adding a new one.

### 3. Public storefront routes

`app/routes/api.storefront.*.tsx` are called directly by the theme extension's browser JS — they have **no Shopify session** and must not call `authenticate.admin`. Instead:

- `resolveShopFromRequest()` (`app/services/resolveShop.server.ts`) validates the `?shop=` query param against `^[a-z0-9][a-z0-9-]*\.myshopify\.com$` and confirms a `Session` row exists for that shop (i.e. the app is actually installed there) before touching any data.
- Never trust a client-supplied shop value beyond this check — it gates every subsequent database query by `where: { shop }`.

### 4. Webhooks

`app/routes/webhooks.app.uninstalled.tsx` and `webhooks.app.scopes_update.tsx` use `authenticate.webhook(request)`, which verifies the Shopify HMAC signature. Never accept a webhook payload without this.

## Reinstall / uninstall behavior

- On `app/uninstalled`: all `Session` rows for that shop are deleted (`app/routes/webhooks.app.uninstalled.tsx`). Scheme/enquiry data is **not** deleted — it persists so a reinstall doesn't lose configuration. This is a deliberate choice; revisit if merchant data-retention policy requires deletion on uninstall.
- On `app/scopes_update`: the stored session's `scope` field is updated to match what the merchant actually approved.
- Reinstall has not been tested against a fresh store as of 2026-09-08 (see `APP-STORE-REVIEW.md` — this is a required test before submission).

## What happens if `shop`/`host` is missing or invalid

- Admin routes: the library's `authenticate.admin` handles this — invalid/missing session token triggers its own re-auth redirect flow. Not customized in this app.
- Storefront routes: `resolveShopFromRequest` returns a typed error (`400` missing/invalid shop, `403` not installed) which the route turns into a JSON error response with CORS headers appropriate to the failure (no `Access-Control-Allow-Origin` until a shop is validated — see `resolveShop.server.ts` comment).

## Session storage

`PrismaSessionStorage(prisma)` — sessions live in the `Session` table (SQLite locally, see `DEPLOYMENT.md` for production DB considerations). No custom session logic.

## Rules for future changes

- Do not invent a custom token/session scheme "for the storefront" — the storefront intentionally has no Shopify session; keep using the shop-validation + CORS pattern.
- Do not change `authPathPrefix` without updating `redirect_urls` in `shopify.app.vishal-app.toml` to match exactly (see `SHOPIFY-CONFIG.md`).
- Do not add a new admin route without `authenticate.admin(request)` as its first statement.
