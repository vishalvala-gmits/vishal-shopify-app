# App Store Review Status

**Last reviewed:** 2026-09-08 (AI-assisted audit against `SHOPIFY_APP_BUILD_DEPLOYMENT_REVIEW_GUIDE.md`, human-directed, no deploy/release actions taken).

This is a living document — update it after every audit pass or real submission attempt. Do not claim "App Store ready" here unless Level 3 testing (`TESTING.md`) has actually been performed on a fresh store.

## Checklist (guide §17)

### UI
- [x] No blank page (App Home has a real loader/UI in every route)
- [x] Loading state exists (React Router's own navigation states; `s-button loading` on save actions)
- [x] Errors are visible (form validation errors rendered inline; `ErrorBoundary` via `boundary.error()` on every route)
- [x] Core functionality works (scheme settings, enquiries table, storefront widget — manually exercised throughout development)
- [ ] **No 404 / No 500 / No redirect loop** — NEEDS VERIFICATION, requires a real deployment to test (Level 2)

### Embedded
- [x] `embedded = true` in TOML, and `<AppProvider embedded apiKey={apiKey}>` used consistently in `app/routes/app.tsx`
- [x] App Bridge CDN script loaded automatically by `AppProvider` (verified by reading the library source, 2026-09-08) — not a bundled/outdated version
- [x] App Bridge loads before app JS (framework-guaranteed by `AppProvider`'s render order)
- [x] CSP allows Shopify Admin framing (`addDocumentResponseHeaders` from the official package — not custom-rolled)
- [ ] "App is usable inside Shopify Admin" — NEEDS VERIFICATION on a real embedded install (Level 3)

### Authentication
- [x] Installation authentication delegated entirely to `@shopify/shopify-app-react-router` (`app/routes/auth.$.tsx`)
- [ ] **Fresh install works** — NOT YET TESTED (blocked on `application_url` being a placeholder)
- [ ] **Reinstall works** — NOT YET TESTED
- [x] ID/session-token validation works (`authenticate.admin()` on every admin route)
- [x] Current Shopify authentication strategy used (library-managed, no custom token system)
- [ ] **OAuth callback matches TOML** — `redirect_urls` is currently empty; BLOCKER, see below
- [x] No open redirects found (no custom redirect logic exists outside the library)
- [x] No API secret in browser (verified — `SHOPIFY_API_SECRET` only referenced server-side)

### APIs
- [x] GraphQL Admin API only (no REST Admin API calls found anywhere)
- [x] Scopes appear minimal and justified — `read_products`, `write_products`, `read_online_store_pages`, `write_files` — **except** `read_online_store_pages` should be re-confirmed as actually used (NEEDS VERIFICATION — grep for its consumer before next submission)
- [x] No Direct API (frontend calls its own backend only, backend calls Admin GraphQL — no Shopify Direct API usage)
- [x] API errors handled (try/catch around GraphQL calls in loaders, e.g. `app.savings-scheme.tsx`, `app.savings-scheme_.enquiries.tsx`)

### Security
- [ ] **HTTPS** — depends on final hosting choice, NEEDS VERIFICATION once deployed
- [x] CSP reviewed (framework-managed, see above)
- [x] Secrets protected (no hardcoded secrets found; `.env` gitignored)
- [x] Inputs validated (`savingsSchemeValidation.server.ts`, shop-param regex, monthly-amount range check)
- [x] Webhooks verified — HMAC via `authenticate.webhook()` on all 5 handlers
- [x] No sensitive logs found (webhook handlers log only `topic`/`shop`, not payload contents)
- [x] No permissive CORS (`resolveShop.server.ts` reflects only verified real storefront origins, never `*`)

### Compliance (guide doesn't list this explicitly under §17, but it's a hard App Store requirement — added 2026-09-08)
- [x] `customers/data_request` webhook implemented (acknowledges only — see `SECURITY.md` for the manual fulfillment procedure, since this app has no Shopify customer ID linkage)
- [x] `customers/redact` webhook implemented (deletes matching `SavingsEnquiry` rows by email/phone)
- [x] `shop/redact` webhook implemented (deletes all shop data)
- [ ] **Compliance webhooks verified against real delivery** — NOT YET TESTED (Level 3)

### Deployment
- [ ] **Production application URL works** — BLOCKER, `application_url` is still `https://example.com`
- [ ] Production environment variables verified — NOT YET SET (app not deployed)
- [ ] Database/session storage works in production — SQLite persistence strategy undocumented, see `DEPLOYMENT.md`
- [ ] Web application deployed — NOT YET
- [ ] Shopify configuration deployed (`shopify app deploy`) — NOT YET (webhook subscriptions and scopes added 2026-09-08 have not been pushed)
- [ ] Fresh-install test completed — NOT YET

## A. BLOCKERS (as of 2026-09-08)

1. **`application_url = "https://example.com"`** in `shopify.app.vishal-app.toml` — placeholder, not a real deployment. Left as-is deliberately per project decision (app not deployed yet).
2. **`redirect_urls = []`** in the same file — must contain the real OAuth callback URL once `application_url` is real.
3. Neither of the above can be resolved without a real hosting decision. Nothing else in this checklist can reach "verified" status until these are fixed and the app is deployed.

## B. HIGH-RISK ITEMS

1. SQLite as the production datasource, path hardcoded in `prisma/schema.prisma` (not env-configurable) — confirm persistent storage on the eventual host before going live with real merchants.
2. Compliance webhooks (added 2026-09-08) are implemented but **completely unverified** against real Shopify-triggered delivery — must be tested via the Partner Dashboard's webhook testing tool once deployed.
3. `read_online_store_pages` scope — usage not re-confirmed in this audit; verify before next submission or drop it (guide §5 rule 3: minimal scopes only).

## C. MEDIUM-RISK ITEMS

1. No route-level/integration automated tests — only service-layer unit tests exist (see `TESTING.md`).
2. `registerWebhooks` is exported from `shopify.server.ts` but never called — confirmed **not a bug** (TOML-declarative subscriptions are the active mechanism, and `shopify app deploy` handles registration), but the dead export is confusing; consider removing it or adding a comment explaining why it's unused.

## D. TESTS REQUIRED (before submission)

1. Level 2 HTTP smoke tests against the real deployed URL (`TESTING.md`).
2. Level 3 fresh-install test on a store that has never installed this app version.
3. Reinstall test after uninstall — confirm `app/uninstalled` webhook actually fires (webhook subscriptions were only just declared in TOML on 2026-09-08 and have not yet been deployed via `shopify app deploy`).
4. Manually trigger each of the 5 webhook topics and confirm correct behavior + 200 response.
5. Confirm the gift-image upload flow (`write_files` scope) prompts for re-approval correctly on a fresh install.

## E. DEPLOYMENT REQUIREMENTS

See `DEPLOYMENT.md` in full. Summary: real hosting URL → set `application_url`/`redirect_urls` in TOML → set production env vars → `npm run deploy` (pushes the webhook subscriptions and scopes added today) → deploy the web app → run Level 2/3 tests.

## F. APP STORE SUBMISSION READINESS

**NOT READY.** Blocked on real production deployment (item A above). Once deployed:

1. Re-run this checklist end to end.
2. Complete all items in section D.
3. Get explicit human approval (this document being "mostly checked" is not itself approval — see the guide §21 final release gate).

## Reviewer / test store notes

No dedicated reviewer test store or credentials documented yet. Add here once a Partner Dashboard test store is designated for App Store review purposes.

## Change log

| Date | Change |
|---|---|
| 2026-09-08 | Initial full audit against the review guide. Removed orphaned `app.additional.tsx` scaffold route, rewrote `app._index.tsx` from demo content to a real dashboard. Discovered and fixed: no webhook subscriptions declared in active TOML (added 5, including the 3 mandatory GDPR topics which were completely missing); implemented `webhooks.customers.data_request/redact` and `webhooks.shop.redact` route handlers. All 9 `docs/` files from guide §19 created for the first time. |
| 2026-09-08 | Follow-up fix: the 3 GDPR webhook subscriptions were initially declared under `topics` (like regular webhooks), which `shopify app dev` rejected at runtime with "The following topic is invalid" — `shopify app config validate --json` did not catch this. Corrected to use `compliance_topics` per Shopify's documented distinction. See `SHOPIFY-CONFIG.md` and `TROUBLESHOOTING.md` for the corrected pattern. Not yet re-verified that `shopify app dev` starts cleanly with the fix — user should confirm. |
