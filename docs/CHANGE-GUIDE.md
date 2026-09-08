# Change Guide

Quick reference for "what do I need to touch/redeploy" when making a specific kind of change to this app. See `DEPLOYMENT.md` for the full release process.

## Decision table

| Change | Requires `npm run deploy` (Shopify config)? | Requires web app redeploy? | Also update |
|---|---|---|---|
| Edit a route's UI/logic (`app/routes/*.tsx`) | No | Yes | — |
| Edit a service (`app/services/*.ts`) | No | Yes | Tests if behavior changed |
| Add/remove an access scope | **Yes** | Yes (if code depends on it) | `SHOPIFY-CONFIG.md`, `.env`/prod `SCOPES` |
| Add/remove a webhook topic | **Yes** | Yes (add the route handler) | `SHOPIFY-CONFIG.md`, `AUTHENTICATION.md` |
| Change `application_url` or `redirect_urls` | **Yes** | No (unless the domain itself changed) | `SHOPIFY-CONFIG.md`, prod `SHOPIFY_APP_URL` |
| Edit `extensions/savings-scheme/**` (liquid/CSS/JS) | **Yes** | No | — |
| Add a Prisma model/field | No | Yes, plus run the migration | `ARCHITECTURE.md` if it's a new model |
| Change `prisma/schema.prisma` datasource | No | Yes, careful — see `DEPLOYMENT.md` SQLite caveat | `DEPLOYMENT.md` |
| Bump `ApiVersion` in `shopify.server.ts` | Usually yes (webhook `api_version` in TOML should match) | Yes | `SHOPIFY-CONFIG.md` |

## Database migrations

```bash
npx prisma migrate dev --name <description>   # local: creates + applies a migration
npx prisma generate                             # regenerate the client after schema changes
```

In production, `docker-start` runs `prisma migrate deploy` automatically (applies pending migrations, does not create new ones). Never run `migrate dev` against production data.

**Known friction**: `prisma generate` can fail with `EPERM ... query_engine-windows.dll.node` on Windows if a dev server (`shopify app dev`) is currently running and holding the engine DLL open. Stop the dev server first, then regenerate, then restart it. (Encountered and resolved this way on 2026-09-08.)

## Adding a new admin route

1. Create `app/routes/app.<name>.tsx` (or `app.<parent>_.<child>.tsx` for a nested path with its own layout escape — see React Router's `@react-router/fs-routes` convention already used by `app.savings-scheme_.enquiries.tsx`).
2. First line of `loader`/`action`: `await authenticate.admin(request)`.
3. Add a nav link in `app/routes/app.tsx`'s `<s-app-nav>` if it should be reachable from the sidebar.
4. If it needs a primary page action, make the action button a **direct child of `<s-page>`**, not nested inside a form — `slot="primary-action"` only projects correctly one level deep (this bit us on 2026-09-08 with the Savings Scheme save button; see git history for the fix pattern: form gets a `ref`, button submits via `fetcher.submit(formRef.current)`).

## Adding a new public storefront route

1. Create `app/routes/api.storefront.<name>.tsx`.
2. Call `resolveShopFromRequest(request)` first — never trust a `shop` query param directly.
3. Build CORS headers via `buildCorsHeadersForOrigin(shop, request)` — never hand-roll `Access-Control-Allow-Origin: *`.
4. If it accepts writes from anonymous buyers, add rate limiting via `checkRateLimit()` (see `api.storefront.savings-enquiry.tsx` for the pattern).
5. Recompute anything money-related server-side — never trust client-submitted totals.

## Adding a new webhook

1. Create `app/routes/webhooks.<topic-with-dots>.tsx` (dots in the filename become path segments, e.g. `webhooks.customers.redact.tsx` → `/webhooks/customers/redact`).
2. First line of `action`: `const { shop, topic, payload } = await authenticate.webhook(request)`.
3. Add a matching `[[webhooks.subscriptions]]` block to `shopify.app.vishal-app.toml` — the `uri` **must exactly match** the route's derived path.
4. Run `npm run deploy` to push the new subscription to Shopify.
5. Test via the Partner Dashboard's webhook testing tool before considering it done — a route file existing is not the same as the webhook actually being registered (this was a real gap found and fixed on 2026-09-08).

## Working with the Polaris web components (`s-*` elements)

- These are custom elements, not React components — React's synthetic event props (`onClick`, `onChange`, `onInput`) work for simple cases, but some events (e.g. `keydown` on `s-text-field`) are **not** exposed as React props and need a `ref` callback + `addEventListener` instead (see `app.savings-scheme_.enquiries.tsx`'s search field for the pattern).
- Use `s-grid gridTemplateColumns="1fr 1fr"` for side-by-side form fields — `s-stack direction="inline"` does not work for form controls (no intrinsic width, one field pushes siblings onto their own row).
- Before using an unfamiliar prop, check `node_modules/@shopify/polaris-types/dist/polaris.d.ts` directly — the Shopify AI Toolkit's doc search sometimes surfaces a newer/RC version's props that aren't in the actually-installed package version (happened with `s-number` and `s-drop-zone`'s `details` prop on 2026-09-08).

## Working with the Shopify AI Toolkit

This project's `AGENTS.md` requires installing the toolkit in the **agent host**, not the repo (`npx skills add Shopify/shopify-ai-toolkit --list`). If it gets installed into `.agents/` or `.claude/skills/` inside this repo (it can land there depending on the installer's detection), delete those directories and `skills-lock.json` before committing — they are not meant to be checked in.
