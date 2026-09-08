# Security

## Secrets

- `SHOPIFY_API_SECRET` is read only server-side (`app/shopify.server.ts`), never sent to the browser. `SHOPIFY_API_KEY` is intentionally frontend-visible (Shopify's design — it's a client ID, not a secret) via the `apiKey` prop passed to `AppProvider`.
- `.env` is gitignored; only `.env.example` (a template with no real values) is committed. Verified via `git ls-files | grep env` — only `.env.example` is tracked.
- No hardcoded Shopify tokens (`shpat_`, `shpca_`, `shpss_`) found anywhere in `app/` or `extensions/` as of 2026-09-08 (verified by grep).
- Rule: never paste real `.env` values, session tokens, or database contents into an AI prompt, commit message, or log statement.

## Authentication boundary

See `AUTHENTICATION.md` for the full breakdown. Summary: admin routes require `authenticate.admin()`; public storefront routes validate the `shop` param against a real installed session and a strict domain regex before any database access; webhooks require `authenticate.webhook()` (HMAC-verified).

## Storefront (public, unauthenticated) endpoint hardening

`app/routes/api.storefront.savings-enquiry.tsx` and `api.storefront.savings-scheme.tsx`:

- **Shop validation**: `resolveShopFromRequest()` — regex `^[a-z0-9][a-z0-9-]*\.myshopify\.com$`, then confirms a `Session` row exists (app must actually be installed). No shop value is trusted without this.
- **CORS**: `buildCorsHeadersForOrigin()` reflects the request's `Origin` header back only if it matches the shop's real `myshopifyDomain` or a connected custom domain (fetched live via Admin GraphQL, 5-minute cache). Never a wildcard `*`. Falls back to no `Access-Control-Allow-Origin` (same-origin-only) if the shop lookup fails or the origin doesn't match.
- **Rate limiting**: `app/services/rateLimit.server.ts` — 5 enquiry submissions per 10 minutes per `shop:IP` key, in-memory (resets on server restart — acceptable for single-instance deployment; revisit if horizontally scaled, since each instance would track its own counts independently). Bypassed only when `NODE_ENV === "development"`; `Dockerfile` sets `NODE_ENV=production` explicitly so this bypass never applies in the documented deploy path.
- **Server-side recalculation**: the enquiry endpoint never trusts client-submitted totals — `calculateSavingsScheme()` recomputes contribution/bonus/benefit from the scheme's own stored config and the submitted `monthlyAmount` (itself range-validated against `scheme.minAmount`/`maxAmount`).
- **Input validation**: `app/services/savingsSchemeValidation.server.ts` validates email format, phone format, and monthly-amount range before any write.

## Customer PII

`SavingsEnquiry` stores `customerName`, `customerEmail`, `customerPhone` — real personal data submitted by buyers through the storefront widget. This is why the three mandatory Shopify compliance webhooks are required (added 2026-09-08, see `webhooks.customers.data_request.tsx`, `webhooks.customers.redact.tsx`, `webhooks.shop.redact.tsx`):

- **`customers/data_request`**: currently acknowledges only (200 response). This app has no Shopify customer ID linkage — enquiries are matched to a person only by free-text email/phone. If a merchant needs to fulfill a real data-access request, the current manual procedure is: query `SavingsEnquiry` where `shop = <shop>` and `customerEmail`/`customerPhone` matches the requester, and hand the merchant that data directly (per Shopify's requirement — the app delivers data to the *store owner*, not directly to the end customer).
- **`customers/redact`**: deletes matching `SavingsEnquiry` rows (matched by email/phone) for the requesting shop.
- **`shop/redact`**: deletes all `SavingsEnquiry`, `SavingsSchemeProduct`, `SavingsScheme`, and `Session` rows for the shop, 48 hours after uninstall per Shopify's timing.

None of this has been tested against a real webhook delivery yet — see `TESTING.md` and `APP-STORE-REVIEW.md` for the required verification before submission.

## CSP / iframe protection

Handled entirely by `addDocumentResponseHeaders` (from `@shopify/shopify-app-react-router/server`) in `app/entry.server.tsx`. This is the officially supported mechanism — do not hand-roll a custom `frame-ancestors` policy or CSP header. Never set `frame-ancestors 'none'` on any App Home response (would blank-screen the embedded app inside Shopify Admin).

## GraphQL Admin API only

No REST Admin API usage anywhere in this codebase (verified — every Shopify data call goes through `admin.graphql(...)`). Keep it that way; new public apps should avoid new REST Admin API integrations per current Shopify guidance.

## Known gaps / follow-ups

- SQLite production persistence/backup strategy is undocumented (see `DEPLOYMENT.md`) — a data-loss risk if the host has an ephemeral filesystem, separate from the security review but worth tracking here since it affects the compliance webhooks' ability to actually redact real data if the DB was already lost.
- No automated security-header or CSP test exists in the test suite (`TESTING.md` Level 1 gap).
- `write_files` scope (added for gift-image upload) should be periodically re-justified — drop it if the upload feature is ever removed.
