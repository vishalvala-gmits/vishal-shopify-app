# Troubleshooting

## `prisma generate` fails with `EPERM ... query_engine-windows.dll.node`

```text
Error:
EPERM: operation not permitted, rename '...\query_engine-windows.dll.node.tmp...' -> '...\query_engine-windows.dll.node'
```

**Cause**: a running `shopify app dev` (or any process holding the Prisma query engine loaded) has the DLL file open on Windows.

**Fix**: stop the dev server, run `npx prisma generate`, then restart the dev server. Retrying immediately without stopping the process usually fails the same way.

## Enquiry form returns `"Too many enquiries submitted. Please try again later."`

This is the rate limiter (`app/services/rateLimit.server.ts`) working as intended — 5 submissions per 10 minutes per shop+IP, to protect the public storefront endpoint from abuse. Not a bug.

- **During local development**: this is bypassed automatically when `NODE_ENV === "development"` (the mode `shopify app dev` runs under). If you still hit it, check that `NODE_ENV` is actually `development` in your local process (log `process.env.NODE_ENV` at startup if unsure).
- **In production**: this is intentional and should not be raised without reconsidering the abuse-protection tradeoff — see `SECURITY.md`.
- The counter is in-memory and resets on server restart.

## "Save Scheme" / a primary-action button renders in the wrong place (bottom of page instead of the header)

**Cause**: `slot="primary-action"` only works when the element is a **direct child** of the component that declares that slot (`s-page`). If the button is nested inside a `<form>` or other wrapper, the browser can't project it into the header slot, and it falls back to rendering inline wherever it sits in the DOM.

**Fix**: move the button to be a direct sibling of the form under `<s-page>`. Since `s-button` has no native `type="submit"`/`form` attribute (it's a custom element, not an HTML `<button>`), give the form a `ref` and submit programmatically:

```tsx
const formRef = useRef<HTMLFormElement>(null);

<s-page heading="...">
  <fetcher.Form ref={formRef}>...</fetcher.Form>
  <s-button slot="primary-action" onClick={() => formRef.current && fetcher.submit(formRef.current)}>
    Save
  </s-button>
</s-page>
```

This exact bug occurred and was fixed in `app.savings-scheme.tsx` on 2026-09-08.

## Multiple `s-section` cards look merged into one continuous card with no padding/gap

**Cause**: consecutive `s-section` elements placed as bare siblings automatically merge into a single visual card (documented Polaris behavior — "context-aware section styling").

**Fix**: wrap them in `<s-stack direction="block" gap="base">` — this matches Shopify's own documented pattern for multiple top-level sections and gives each one its own distinct, padded, elevated card.

## A Polaris web component prop that "should exist" fails TypeScript

The Shopify AI Toolkit's documentation search sometimes returns props from a newer/release-candidate version of `@shopify/polaris-types` than what's actually installed in this project (e.g. `s-number` as a standalone display component, or a `details` prop on `s-drop-zone` — both encountered and had to be removed on 2026-09-08).

**Fix**: check `node_modules/@shopify/polaris-types/dist/polaris.d.ts` directly for the actual installed version's prop list before trusting a docs search result. `npm run typecheck` will catch the mismatch — trust that over the docs search when they disagree.

## Search field / keyboard events don't fire on an `s-text-field` etc.

React's synthetic `onKeyDown` (and some other DOM events) are not exposed as props on these custom elements — only specific documented events like `onInput`/`onChange` work as direct React props. For anything else, use a `ref` callback with native `addEventListener`:

```tsx
const fieldRef = useCallback((node: Element | null) => {
  if (!node) return;
  const handler = (event: Event) => { /* ... */ };
  node.addEventListener("keydown", handler);
  return () => node.removeEventListener("keydown", handler);
}, []);

<s-text-field ref={fieldRef} ... />
```

## A webhook route exists but never seems to fire

Check `shopify.app.vishal-app.toml` for a matching `[[webhooks.subscriptions]]` block — a route file existing does **not** mean Shopify knows to call it. The `uri` in the TOML must exactly match the route's derived path, and `npm run deploy` must have actually been run after adding it. This exact gap existed for `app/uninstalled` and `app/scopes_update` until it was found and fixed on 2026-09-08 (they had route files but no TOML subscription).

## `shopify app dev` fails with `The following topic is invalid: <topic>`

```text
❌ Error
└  The following topic is invalid: customers/data_request
└  The following topic is invalid: customers/redact
└  The following topic is invalid: shop/redact
```

**Cause**: the three mandatory GDPR/privacy webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) must be declared under a **`compliance_topics`** field, not the regular `topics` field used by every other webhook topic:

```toml
# Wrong — fails at shopify app dev / deploy time:
[[webhooks.subscriptions]]
uri = "/webhooks/customers/redact"
topics = [ "customers/redact" ]

# Correct:
[[webhooks.subscriptions]]
uri = "/webhooks/customers/redact"
compliance_topics = [ "customers/redact" ]
```

`shopify app config validate --json` does **not** catch this — it only validates TOML shape, not whether Shopify's backend accepts a given topic string under the field it's declared in. Only `shopify app dev` (or a real deploy) actually checks against Shopify's live topic list. This exact mistake was made and fixed on 2026-09-08; see `SHOPIFY-CONFIG.md` for the corrected block.

## Which `shopify.app*.toml` is actually active?

There are two in this repo. Check `.shopify/project.json` for the real `client_id`, then match it against the TOML files' `client_id` fields — only the matching one is live. See `SHOPIFY-CONFIG.md` for current details (as of 2026-09-08, `shopify.app.vishal-app.toml` is active; `shopify.app.toml` is an unused template leftover).

## Skill-installer tooling shows up as untracked files in `git status`

If `.agents/`, `.claude/skills/`, or `skills-lock.json` appear after using the Shopify AI Toolkit, they were installed into the repo instead of the agent host. Delete them — `AGENTS.md` requires this tooling to live outside the project.
