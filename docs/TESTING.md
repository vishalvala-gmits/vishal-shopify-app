# Testing

Three levels, per `SHOPIFY_APP_BUILD_DEPLOYMENT_REVIEW_GUIDE.md` §16. Do not consider the app release-ready on Level 1 alone.

## Level 1 — Unit / build tests (current status: automated, passing)

```bash
npm run typecheck   # react-router typegen && tsc --noEmit
npm test             # vitest run
```

As of 2026-09-08: **53 tests passing, 4 test files**, typecheck clean.

| File | Covers |
|---|---|
| `app/services/rateLimit.server.test.ts` | Rate-limit window/reset/per-key isolation, dev-mode bypass |
| `app/services/resolveShop.server.test.ts` | Shop param validation, CORS origin matching |
| `app/services/savingsSchemeCalculator.server.test.ts` | Contribution/bonus/benefit math, explicit assertion that gift value is *not* folded into `totalBenefit` |
| `app/services/savingsSchemeValidation.server.test.ts` | Form validation rules |

**Gaps** (not currently covered by automated tests):
- No route-level tests (loaders/actions) — only service-layer unit tests exist.
- No test confirms the App Home document actually renders without error (no CSP/HTTP smoke test in the suite).
- No test confirms `SHOPIFY_API_SECRET` is absent from a built frontend bundle.
- The three new GDPR webhook routes (`webhooks.customers.*`, `webhooks.shop.redact`) have no automated tests — they're new as of 2026-09-08.

## Level 2 — Production-like HTTP tests (not yet run against a real deployment)

Once deployed, verify manually or via a script:

```text
GET  /                              -> expect a real response, not a crash
GET  /auth?shop=<test>.myshopify.com -> expect OAuth redirect to Shopify
GET  /auth/callback                  -> exact path depends on library internals; verify against a real OAuth attempt
GET  /app                            -> expect redirect to auth if no session, else App Home HTML
POST /webhooks/app/uninstalled       -> expect 401/403 without valid HMAC, 200 with it
POST /webhooks/customers/redact      -> same
GET  /api/storefront/savings-scheme?shop=<test>.myshopify.com&productId=<gid> -> expect JSON, correct CORS headers
```

Check on each: status code, redirect target, CSP header presence, no secret leakage in the response body, error handling for malformed input.

**Status: not yet performed** — the app is not deployed (`application_url` is still a placeholder, see `SHOPIFY-CONFIG.md`).

## Level 3 — Fresh Shopify installation (most important, not yet performed)

Requires a development store that has never installed this app's current version.

```text
Install -> OAuth -> Admin redirect -> App Home loads -> Savings Scheme settings work -> Assign a product -> Storefront widget appears -> Submit a test enquiry -> Enquiry appears in admin table -> Uninstall -> Reinstall -> Confirm clean state
```

Also verify:
- Gift image upload works end-to-end (requires the `write_files` scope re-approval on a fresh install — confirm the consent screen actually lists it).
- The three GDPR webhooks fire correctly — trigger them via the Partner Dashboard's webhook testing tool (or `shopify app webhook trigger` if available in the current CLI) against the deployed app, and confirm: 200 response, and for `customers/redact`/`shop/redact`, confirm the targeted rows are actually gone from the database afterward.

**Status: not yet performed.** This is the single most important remaining gate before App Store submission — see `APP-STORE-REVIEW.md`.

## Running tests locally

```bash
npm install
npm run typecheck
npm test
```

No test database setup is required — `app/services/*.test.ts` are pure unit tests against exported functions, not integration tests against a live Prisma client. If integration tests are added later (recommended — see gaps above), use a separate `file:test.sqlite` datasource, never the dev database.
