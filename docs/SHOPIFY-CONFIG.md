# Shopify Configuration

## Which TOML file is actually active

There are **two** `shopify.app*.toml` files in this repo — only one is linked to the real app registration.

| File | Status |
|---|---|
| `shopify.app.vishal-app.toml` | **Active.** `client_id = "39b25f1e82d4dfd85fc7a18b9e03cd0c"` matches `.shopify/project.json`, which is what Shopify CLI actually uses. Edit this one. |
| `shopify.app.toml` | Unused template default (`client_id = "49b0cf32c704f2937073a8a396312058"`, a different, unrelated app registration). Left over from `shopify app init` scaffolding. Do not edit this expecting it to affect the live app — confirm with the team whether it should be deleted. |

Always verify `.shopify/project.json`'s key against a TOML's `client_id` before assuming which file is "the" config.

## Current state of `shopify.app.vishal-app.toml`

```toml
client_id = "39b25f1e82d4dfd85fc7a18b9e03cd0c"
name = "vishal-app"
application_url = "https://example.com"   # PLACEHOLDER — see below
embedded = true

[webhooks]
api_version = "2026-07"

[access_scopes]
scopes = "read_products,write_products,read_online_store_pages,write_files"
optional_scopes = [ ]
use_legacy_install_flow = false

[auth]
redirect_urls = [ ]   # EMPTY — see below

[build]
automatically_update_urls_on_dev = true
```

### `application_url` — BLOCKER as of 2026-09-08

Still `https://example.com`. This is a placeholder from scaffolding, not a real deployment. **The app cannot complete OAuth against this configuration** — Shopify would attempt to redirect installs to a domain that doesn't serve this app. Confirmed left as-is deliberately (app not deployed yet, per project decision on 2026-09-08). Update this the moment a real hosting URL exists, and re-run the release checklist in `APP-STORE-REVIEW.md`.

### `redirect_urls` — BLOCKER as of 2026-09-08

Empty (`[ ]`). Must contain the exact OAuth callback URL once `application_url` is real, e.g.:

```toml
[auth]
redirect_urls = [ "https://app.example.com/auth/callback" ]
```

`authPathPrefix` in `app/shopify.server.ts` is `/auth` — the callback path must match whatever the `@shopify/shopify-app-react-router` library derives from that prefix. Do not guess the exact suffix; confirm it against the library's current behavior (or by inspecting the network request during a real OAuth attempt) before hardcoding it here, since a mismatch silently breaks install.

### Access scopes

`read_products, write_products, read_online_store_pages, write_files` — all four are actually used:

- `read_products`/`write_products`: product lookups (settings form, enquiries table) and the demo `productCreate` mutation in the (now-rewritten) Home page's git history.
- `read_online_store_pages`: added per an earlier commit (`Update access scopes ... to include read_online_store_pages`) — grep the codebase for where this is consumed before removing it; if nothing uses it, it's an over-broad scope and should be dropped (guide §5 rule 3: minimal scopes only).
- `write_files`: added for the gift-image upload flow (`app/routes/app.api.upload-gift-image.tsx`, `stagedUploadsCreate` + `fileCreate`). **This scope addition requires merchants to re-approve permissions** on next app load — already flagged when it was added.

### Webhooks

`api_version = "2026-07"` under `[webhooks]`. As of 2026-09-08, five subscriptions are declared:

```toml
[[webhooks.subscriptions]]
uri = "/webhooks/app/uninstalled"
topics = [ "app/uninstalled" ]

[[webhooks.subscriptions]]
uri = "/webhooks/app/scopes_update"
topics = [ "app/scopes_update" ]

[[webhooks.subscriptions]]
uri = "/webhooks/customers/data_request"
compliance_topics = [ "customers/data_request" ]

[[webhooks.subscriptions]]
uri = "/webhooks/customers/redact"
compliance_topics = [ "customers/redact" ]

[[webhooks.subscriptions]]
uri = "/webhooks/shop/redact"
compliance_topics = [ "shop/redact" ]
```

**Two different fields, do not mix them up:**

- **`topics`** — regular event webhooks (`app/uninstalled`, `app/scopes_update`, and most other Shopify event topics).
- **`compliance_topics`** — the three mandatory GDPR/privacy webhooks only (`customers/data_request`, `customers/redact`, `shop/redact`). Declaring these under `topics` instead fails at `shopify app dev` / deploy time with `The following topic is invalid: <topic>` — **this exact mistake was made and fixed on 2026-09-08** (caught by `shopify app dev` at runtime; `shopify app config validate --json` did *not* catch it — that command only validates TOML shape, not whether Shopify's backend accepts the specific topic string against the field it's declared under).

Route files, matching by filename convention:

- `app/uninstalled` → `app/routes/webhooks.app.uninstalled.tsx`
- `app/scopes_update` → `app/routes/webhooks.app.scopes_update.tsx`
- `customers/data_request` → `app/routes/webhooks.customers.data_request.tsx`
- `customers/redact` → `app/routes/webhooks.customers.redact.tsx`
- `shop/redact` → `app/routes/webhooks.shop.redact.tsx`

None of this takes effect until `npm run deploy` is actually run — a route file and a TOML declaration existing is not the same as Shopify having registered the subscription.

### API version drift

Code (`app/shopify.server.ts`) uses `ApiVersion.July26`. The active TOML's `[webhooks].api_version = "2026-07"` matches. The unused `shopify.app.toml` uses `"2026-10"` — irrelevant since that file isn't active, but don't copy from it by accident.

## `application_url`'s actual role

Per the app's own `vite.config.ts`, the running server reads its own URL from `SHOPIFY_APP_URL` (an env var), **not** from the TOML directly. The TOML's `application_url` is what Shopify's servers use to know where to send the merchant/reviewer — it must equal the real value of `SHOPIFY_APP_URL` in production, or the two systems disagree about where the app lives.

## Rules for changing this file

- Any change here requires `npm run deploy` (`shopify app deploy`) to take effect on Shopify's side — see `DEPLOYMENT.md`.
- Scope changes trigger a merchant re-approval prompt on next app load — never add a scope "just in case."
- Never commit a real production secret into this file (it holds no secrets today — `client_id` is not sensitive — keep it that way).
