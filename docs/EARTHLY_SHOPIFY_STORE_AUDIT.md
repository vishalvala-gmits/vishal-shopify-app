# EARTHLY JEWELS SHOPIFY STORE AUDIT

Audit date: 2026-09-02
Audited by: Claude Code (read-only session)
Connected store: `gold-rate-update.myshopify.com`

---

## 1. Executive Summary

`vishal-app` is a stock Shopify app template (React Router + Prisma + Polaris web components) that has not yet been customized for jewellery pricing — no gold-rate, pricing-engine, or configurator code exists in the repository. It is installed on a **real, populated dev store** (582 products) whose shop name is "Gold rate update" and whose merchandising content refers to the brand **"Earthly Jewels"**.

The store is far ahead of the app: it already carries a partially-built, formula-based jewellery pricing system implemented entirely through **variant metafields** (`custom.gold_weight`, `custom.gold_price_per_gram`, `custom.making_charge_per_gram`, `custom.diamond_weight`, `global.price_carat_mrp`, `custom.calculated_gold_value`, `custom.calculated_diamond_value`, `custom.calculated_making_value`, `custom.last_calculated_at`, `custom.pricing_batch_id`). This looks like the output of a prior/external batch pricing tool, not something built by `vishal-app` — it is undocumented in this repo and only present on a minority of products. Critically, `gold_price_per_gram` and `gold_rate_14k_snapshot` / `gold_rate_18k_snapshot` are `0.0` on every sampled variant, so **live gold-rate application is not currently functioning**, even though the surrounding scaffolding (weight, making charge, timestamps, batch id) is in place.

Variant modelling for jewellery (Purity × Size × Chain Length × Center Diamond Size, etc.) already uses **standard Shopify options/variants** — Path A — for every sampled product; no configurator or made-to-order pattern was observed.

Biggest gap: there is no live/automated rate source, no rate-approval or change-guard mechanism, no admin UI, and no app code connecting to any of this — everything found was discovered directly in Shopify data, not in `vishal-app`.

---

## 2. Audit Scope

- Read-only inspection of the `vishal-app` local codebase (all files, `node_modules` excluded).
- Read-only Shopify Admin GraphQL queries (API version 2026-07) against the connected store, using the existing offline access token already stored in the app's local session database. No mutations were executed.
- No product, variant, price, metafield, theme, webhook, or app-configuration data was modified.

## 3. Safety Rules

All read-only constraints specified in the audit brief were followed:
- Only GraphQL **queries** were sent; zero mutations.
- The stored Shopify access token was read once from the local SQLite `Session` table purely to authenticate read requests, and was **never printed, logged, or written to any file** (only `Credential exists: YES` was echoed during testing, per instructions).
- Two temporary Node.js scripts used to run the read-only queries (`.audit_queries*.tmp.cjs`) were deleted immediately after use and are not part of the repository state.
- The only filesystem change made by this audit is this document plus the new `docs/` directory.
- A pre-existing staged change to `shopify.app.vishal-app.toml` (present before this session started, changing `scopes` from `""` to `"read_products,write_products"`) was left untouched.

## 4. Existing vishal-app Architecture

**VERIFIED** (from repository inspection):

- **Framework**: React Router 7 (`@react-router/dev` ^7.12.0), Vite 6, TypeScript 5.9, Node `>=20.19 <22 || >=22.12`.
- **Shopify app template**: the stock `@shopify/shopify-app-react-router` (v1.2.1) template — this is the current-generation "React Router + Polaris web components" starter, not the older Remix template.
- **UI**: Polaris **web components** (`<s-page>`, `<s-section>`, etc.) — not `@shopify/polaris` React components — plus `@shopify/app-bridge-react` for embedding.
- **Auth**: `shopifyApp()` from `@shopify/shopify-app-react-router/server`, configured in [app/shopify.server.ts](app/shopify.server.ts). Offline access tokens, with `future.expiringOfflineAccessTokens: true` enabled, `AppDistribution.AppStore`.
- **Database**: Prisma 6.16, SQLite (`prisma/dev.sqlite`) via `PrismaSessionStorage`. The `Session` model ([prisma/schema.prisma](prisma/schema.prisma)) is the **only** model — no product, pricing, or jewellery-related tables exist yet.
- **API version pinned**: `ApiVersion.July26` in code (`shopify.server.ts`); `shopify.app.vishal-app.toml` also declares webhook API version `2026-07`.
- **Routes** ([app/routes.ts](app/routes.ts) uses `@react-router/fs-routes` flat-file routing):
  - `app/routes/app.tsx` — embedded app shell/nav (Home, Additional page).
  - `app/routes/app._index.tsx` — demo "Generate a product" page (calls `productCreate`, `productVariantsBulkUpdate`, `metaobjectUpsert` mutations — **unmodified template demo code**, not app logic).
  - `app/routes/app.additional.tsx` — static demo page, no logic.
  - `app/routes/auth.$.tsx`, `app/routes/auth.login/route.tsx` — OAuth flow (template default).
  - `app/routes/webhooks.app.uninstalled.tsx` — deletes local sessions on uninstall.
  - `app/routes/webhooks.app.scopes_update.tsx` — updates stored session scope on scope changes.
- **No services/, utils/, jobs/, or cron directories exist.** No custom business logic of any kind is present.
- **No Shopify Functions, theme app extensions, checkout extensions, or admin UI extensions** exist in `extensions/` (contains only `.gitkeep`).
- **Config files**: two Shopify app config tomls are present — `shopify.app.toml` (client_id `49b0cf32c704f2937073a8a396312058`, scopes `write_products,write_metaobjects,write_metaobject_definitions`, looks like a template/example config not currently linked) and `shopify.app.vishal-app.toml` (client_id `39b25f1e82d4dfd85fc7a18b9e03cd0c`, scopes `read_products,write_products` staged/uncommitted vs. `""` committed — **this is the config actually linked to the store**, confirmed via `.shopify/project.json`).

## 5. Shopify Connection

**VERIFIED**:

| Item | Value |
|---|---|
| Shop domain | `gold-rate-update.myshopify.com` |
| Shop display name | "Gold rate update" |
| App name (Shopify-side) | vishal-app (`gid://shopify/App/418146975745`) |
| Linked client_id | `39b25f1e82d4dfd85fc7a18b9e03cd0c` (matches `shopify.app.vishal-app.toml`) |
| API version in use | 2026-07 |
| Auth method | OAuth via `@shopify/shopify-app-react-router`, offline access token, Prisma-backed session storage |
| Access scopes actually granted (live, via `currentAppInstallation.accessScopes`) | `read_products`, `write_products` |
| Local `.toml` staged scopes | `read_products,write_products` (matches live — the toml edit had not yet been deployed but is consistent) |
| Access token in DB | Credential exists: YES (value never displayed) |
| Session type | Offline, `isOnline: false` |
| Session expiry seen at audit time | 2026-09-02T12:55:22Z (session was valid and used for all queries) |
| Development/production | Store plan is `"Basic App Development"`, `partnerDevelopment: true` — this is a **Partner development store**, not a live production storefront |

No `.env` file exists in the repository; environment variables (`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`, `SHOPIFY_APP_URL`) are read from `process.env` in `shopify.server.ts` but were not present in the shell environment either — they are supplied at runtime (e.g. by `shopify app dev`) and were not inspected further.

## 6. Store Information

**VERIFIED** (via `shop` query):

| Field | Value |
|---|---|
| Currency | INR |
| Weight unit | KILOGRAMS |
| Country | IN |
| Timezone (`ianaTimezone`) | America/New_York *(likely an unconfigured default on a dev store — INFERRED, not a real operational signal)* |
| Money format | `Rs. {{amount}}` |
| Taxes included in price | false |
| Tax shipping | false |
| Enabled presentment currencies | INR only |
| Plan | Basic App Development (Partner dev store) |

**Shopify Markets**: `markets` query returned `ACCESS_DENIED` — **WRITE ACCESS REQUIRED — NOT EXECUTED** is not applicable here; this is a **read-scope gap**: `read_markets` is not in the app's current scope set. Status: **UNKNOWN** whether Markets are configured on this store.

**Themes**: `themes` query returned `ACCESS_DENIED` (`read_themes` scope missing). Status: **UNKNOWN**.

**Locations**: `locations` query returned `ACCESS_DENIED` (`read_locations` scope missing). Status: **UNKNOWN** — inventory location structure could not be audited.

## 7. Product Catalogue Analysis

**VERIFIED**:

| Metric | Value |
|---|---|
| Total products | 582 |
| Active | 549 |
| Draft | 33 |
| Archived | 0 |

Vendor field is inconsistent: in a 100-product sample, 98 products carried vendor `"Earthly Jewels"` and 2 carried `"Gold rate update"` (the shop's own default vendor name, likely test/demo products including the literal `"Test Product"` handle `test-product`). This confirms **"Earthly Jewels" is the real merchandising brand**, distinct from the dev store's internal name "Gold rate update".

Product types seen in the sample (100 products, not exhaustive across all 582): Rings (52), Earrings (19), Pendants (18+3 "Pendant"), Bracelets (6), Necklace (2). Given 582 total products and this ratio, Rings almost certainly dominate the full catalogue — **INFERRED**, not exhaustively counted (would require paging through all 582 records, which was avoided to keep the audit lightweight and read-cost-conscious).

Collections (47 total, all "custom"/manual sort except a few): a large, taxonomy-like collection structure exists — by product type (Rings, Earrings, Bracelets, Necklace, Pendant), by stone shape (Round/Oval/Marquise/Radiant/Pear/Princess/Emerald/Cushion/Heart Diamond), by style/collection name (AURA, ENVY, FLORA, GRACE, BEZEL, FLUID, Toi-Et-Moi, Oriole, Mystique Stone), and by use-case (Dailywear — 374 products, Gifts For Her — 205, Members Only Collection — 57, First Shine — 160). This is a mature, actively-merchandised storefront, not a placeholder.

Judge.me review app metafields (`judgeme.badge`, `judgeme.widget`, `judgeme.review_widget_data`) are present on essentially every product sampled — confirms Judge.me is installed and active (see Section 12).

## 8. Variant and Option Analysis

**VERIFIED** — actual option names observed directly from Shopify product data (not assumed):

- **Purity** — values seen: `14K`, `18K` (metal karat/purity, standard across nearly all sampled jewellery products)
- **Size** — ring sizes, values `7`–`26` (INFERRED to be a numeric ring-size scale, not standard US ring sizing — likely a custom size chart)
- **Chain Length** — necklaces/pendants, values like `16 inch (40 cm)`, `18 inch (45 cm)`, `20 inch (50 cm)`, `22 inch (55 cm)`
- **Center Diamond Size** — values like `0.5ct`, `1ct`, `2ct`

Every sampled product (30-product recent sample + targeted ring sample) used **standard Shopify product options and variants** to encode these axes — e.g. a ring with Purity × Center Diamond Size × Size produced 80 real Shopify variants (`Radiant Cut Diamond Ring with Leaf Design`, 2 × 2 × 20 = 80). No evidence of a separate configurator, bundle, or made-to-order line-item-properties pattern was found in any sampled product.

**Classification: PATH A — Normal Shopify Variant Product**, for every product sampled. No product was found that required PATH B (configurator) treatment based on the data actually inspected. This does **not** rule out PATH B products existing elsewhere in the unsampled remainder of the 582-product catalogue — status for the full catalogue is **INFERRED (high confidence) from a representative sample**, not exhaustively **VERIFIED**.

## 9. Current Pricing Analysis

**VERIFIED** — this is the most significant finding of the audit.

A subset of ring products carry a full set of **variant-level metafields** that implement a gold + diamond + making-charge pricing formula:

| Metafield (namespace.key) | Type | Observed values | Role |
|---|---|---|---|
| `custom.gold_weight` | number_decimal | e.g. 4.9–6.11 (grams, INFERRED unit) | weight input |
| `custom.gold_price_per_gram` | number_decimal | `0.0` on every sample | rate input — **currently unpopulated/zeroed** |
| `custom.gold_rate_14k_snapshot` | number_decimal | `0.0` on every sample | rate snapshot — **unpopulated** |
| `custom.gold_rate_18k_snapshot` | number_decimal | `0.0` on every sample | rate snapshot — **unpopulated** |
| `custom.making_charge_per_gram` | number_decimal | e.g. 1500.0, 2000.0 | making-charge input |
| `custom.diamond_weight` | number_decimal | e.g. 0.9, 1.0 (carats, INFERRED) | diamond input |
| `global.price_carat_mrp` / `custom.price_gram_mrp` | number_decimal | e.g. 30000.0, 2500.0 | diamond/gold rate reference |
| `custom.calculated_gold_value` | number_decimal | `0.0` on every sample (consistent with `gold_price_per_gram = 0`) | derived output |
| `custom.calculated_diamond_value` | number_decimal | e.g. 18000.0, 30000.0 (= diamond_weight × price_carat_mrp) | derived output |
| `custom.calculated_making_value` | number_decimal | e.g. 8715.0–10820.0 (≈ gold_weight × making_charge_per_gram) | derived output |
| `custom.last_calculated_at` | date_time | e.g. `2026-08-31T04:23:18Z`, `2026-08-31T04:32:34Z` | batch run timestamp |
| `custom.pricing_batch_id` | single_line_text_field | `"2"` on every sample seen | identifies a specific pricing run |
| `custom.elite_price` / `custom.elite_member_price` | number_decimal | derived from a `discount_rate`/`discount_amount` off the calculated total | member pricing tier |
| `custom.discount_rate`, `custom.discount_amount` | number_decimal | e.g. 15.0%, 5.0% | discount inputs for member price |
| `custom.diamond_details` / `global.diamond_details` | single_line_text_field | e.g. `"E-F, VS (1 Nos)"` | diamond grade/count description |

**Formula reconstructed from observed data (Classification: B — Formula-based, partially broken):**

```
calculated_diamond_value = diamond_weight × price_carat_mrp
calculated_making_value  = gold_weight × making_charge_per_gram
calculated_gold_value    = gold_weight × gold_price_per_gram   (currently always 0, since gold_price_per_gram = 0)
variant.price            ≈ calculated_gold_value + calculated_diamond_value + calculated_making_value
                            (approximately matches observed price, small residual likely rounding/other charges)
elite_member_price       = variant.price − discount_amount   (discount_amount ≈ variant.price × discount_rate%)
```

Example verification (Emerald Cut Diamond Ring for Men in Gold, 14K/7): `calculated_gold_value(0) + calculated_diamond_value(30000) + calculated_making_value(8715) = 38715`, vs. actual `price = 39876.00` — close but not exact, meaning there is likely an additional charge component (e.g. base/setting charge) not captured in these three metafields, or the price was set independently and the calculated_* fields are a parallel/derived audit trail rather than the literal price source.

**Critical finding**: `gold_price_per_gram` is `0.0` everywhere sampled, meaning **live gold rate is not currently flowing into this calculation** — either the rate feed was never wired up, or it was intentionally reset/blanked. This pricing scaffolding appears to be the output of a **prior, external, undocumented tool or manual process** — nothing in the `vishal-app` codebase references any of these metafield keys, and `pricing_batch_id: "2"` implies at least a batch #1 also ran previously.

**Only a minority of products carry this pricing metafield set.** A 20-product scan of ring products (sorted by creation date) found **zero** products with `gold_weight`/`calculated_gold_value` present — only the older, specifically-sampled ring products had them. Coverage across the full 582-product catalogue is **UNKNOWN** and would require a full paginated scan to quantify precisely.

Shopify's native `inventoryItem.measurement.weight` field is `0` (KILOGRAMS) on every sampled variant — **native Shopify weight is not used**; all weight data lives in the custom `gold_weight` metafield instead.

## 10. Metafield Analysis

**VERIFIED** — product-level metafield definitions (partial list; full set has ~45 definitions, dominated by Shopify's standard taxonomy fields for jewelry — `jewelry-material`, `jewelry-type`, `ring-size`, `ring-design`, `necklace-design`, `bracelet-design`, `earring-design`, `gemstone-type`, `stone-shape`, `color-pattern`):

| Namespace | Key | Type | Purpose | Relevant to Gold Rate App |
|---|---|---|---|---|
| shopify | jewelry-material | list.metaobject_reference | Shopify Standard Product Taxonomy — material (gold, silver, etc.) | Yes — canonical metal reference |
| shopify | ring-size | list.metaobject_reference | Taxonomy ring size | Partial — informational, not used for variant sizing (variants use option "Size") |
| shopify | gemstone-type / stone-shape | list.metaobject_reference | Taxonomy diamond/gemstone descriptors | Yes — complements `diamond_details` |
| custom | metal_color | list.color | Swatch colors for metal | Yes — UI/swatch |
| custom | metal_type | list.metaobject_reference (product) / single_line_text_field (variant) | Metal karat, **inconsistent type between product- and variant-level definitions** | Yes — core pricing input |
| custom | membership_disc, membership_only, ask_for_price, price_shouldn_t_override, members_only | boolean/number_decimal | Membership pricing controls | Yes — pricing override logic already exists conceptually |
| custom | usability_label_1-4 / usability_value_1-4 | text/number | "Product Scorecard" (Daily Wear, Durability, Exclusivity, Reworkability ratings) | No |
| craftshift | rubik_configuration, swatch_image, swatch_color | text/file/color | Third-party app ("Rubik"/CraftShift) variant configuration data | Possibly — unknown app, may relate to a swatch/variant picker |
| judgeme | badge, widget, review_widget_data | string/json | Judge.me reviews app | No |
| mm-google-shopping / mc-facebook | various | string | Ad feed metadata | No |
| theme | countdown, label, label_color, text_label_color | various | Theme merchandising badges | No |

**VERIFIED** — variant-level metafield definitions relevant to pricing (full list, ~30 definitions total, gold/diamond-related ones shown):

| Namespace | Key | Type | Purpose |
|---|---|---|---|
| custom | gold_weight, gold_price_per_gram | number_decimal | Gold pricing inputs |
| custom | making_charge_per_gram | number_decimal | Making charge input |
| custom | diamond_weight (+ `_2`.._5` variants) | number_decimal | Multi-stone diamond weight slots |
| custom | diamond_price_per_carat (+ `_2`.._5`) | number_decimal | Multi-stone diamond rate slots |
| global | price_gram_mrp, price_carat_mrp (+ `_2`..`_5`) | number_decimal | MRP-style rate references, multi-stone |
| global | metal_type, diamond_details (+ `_2`..`_5`) | single_line_text_field | Descriptive/reference fields |
| custom | elite_member_price | number_decimal | Membership price |

These **definitions** exist store-wide (schema is set up for up to 5 diamond "slots" per variant — i.e. multi-stone jewellery pricing was anticipated), but **actual populated values** were seen only on the smaller product sample in Section 9, using the *singular* `custom.calculated_*` / `custom.elite_price` fields rather than the numbered `global.price_carat_mrp_2..5` slots — suggesting the multi-stone schema is defined but not yet exercised in practice, or is used by a different, not-yet-sampled subset of products.

No **metaobject definitions** were found (`metaobjectDefinitions` query returned an empty list) — despite several product metafields referencing `metaobject_reference`/`list.metaobject_reference` types (e.g. `jewelry-material`, `color-pattern`). This is expected: those references point to Shopify's **built-in standard taxonomy metaobjects** (system-owned, not merchant-defined), which don't appear in a merchant's own `metaobjectDefinitions` list.

Shop-level metafields under the `app` namespace: none found (empty).

## 11. Theme Analysis

**WRITE ACCESS REQUIRED — NOT EXECUTED** is not the right framing here — this was a **read** operation that failed on scope, not a write operation:

**Status: UNKNOWN.** The `themes` query returned `ACCESS_DENIED — Required access: read_themes access scope`. The app's current scopes (`read_products`, `write_products`) do not include `read_themes`, so no theme name, ID, template structure, or app-embed/app-block information could be retrieved. To audit theme architecture and evaluate Theme App Extension feasibility, `read_themes` must be added to `shopify.app.vishal-app.toml` and the app must be re-authorized — this is a scope/permission change, so per the audit rules it is flagged here rather than performed.

## 12. Existing Apps / Integrations

**VERIFIED**, inferred solely from metafield namespaces left behind on products (no direct app-listing API was available/queried, since Shopify does not expose a general "list all installed apps" read endpoint to third-party apps):

| Namespace signature | Likely app | Relevance to Gold Rate |
|---|---|---|
| `judgeme.*` | Judge.me (product reviews) | None |
| `mm-google-shopping.*`, `mc-facebook.*` | Google/Facebook Shopping feed apps (likely via a channel or feed app) | None |
| `craftshift.*` (key names reference "Rubik") | An unidentified app, likely a variant/swatch configurator called "Rubik" | Possibly relevant — could relate to a future configurator, **UNKNOWN**, not further inspectable read-only without more context |
| `custom.*` gold/diamond/elite pricing fields | Not attributable to any named app from data alone — **UNKNOWN** origin, likely a bespoke script, spreadsheet import, or a previous internal tool (batch id "2" pattern implies a repeatable process, not one-off manual edits) |

No pricing, ERP, gold-rate API, or inventory-sync app could be positively identified by name. **Not accessible through current read-only API permissions** for a definitive installed-apps listing.

## 13. Webhook Analysis

**VERIFIED**: `webhookSubscriptions` query returned an **empty list** — zero webhook subscriptions currently exist on the store via the Admin API's webhook registry.

This is consistent with the app code: `shopify.app.vishal-app.toml`'s `[webhooks]` block only sets `api_version = "2026-07"` with no `[[webhooks.subscriptions]]` entries (unlike the other, unlinked `shopify.app.toml`, which declares `app/uninstalled` and `app/scopes_update` subscriptions via TOML-managed webhooks — but that file's client_id does not match the live connection, so those declarations are not currently active). The route handlers for `app/uninstalled` and `app/scopes_update` exist in code ([app/routes/webhooks.app.uninstalled.tsx](app/routes/webhooks.app.uninstalled.tsx), [app/routes/webhooks.app.scopes_update.tsx](app/routes/webhooks.app.scopes_update.tsx)) but have no matching live subscription, since they're declared in the non-linked toml file.

## 14. Shopify Extensions

**VERIFIED**: the local `extensions/` directory contains only a `.gitkeep` placeholder — no Theme App Extensions, Shopify Functions, checkout extensions, admin UI extensions, or web pixel extensions exist in this repository.

## 15. Database Analysis

**VERIFIED**: `prisma/schema.prisma` defines exactly one model, `Session` (standard Shopify session-storage shape: id, shop, state, isOnline, scope, expires, accessToken, userId, firstName, lastName, email, accountOwner, locale, collaborator, emailVerified, refreshToken, refreshTokenExpires). One migration exists (`20240530213853_create_session_table`). No product, pricing, rate, or jewellery-specific tables exist anywhere in the app database. All jewellery/pricing data observed in this audit lives entirely in Shopify (metafields), not in the app's own database.

## 16. Current Gold Rate Analysis

```
No verified gold-rate system found in the audited Shopify data or app code.
```

**VERIFIED**: metafield *schema* for gold rate input (`custom.gold_price_per_gram`, `custom.gold_rate_14k_snapshot`, `custom.gold_rate_18k_snapshot`) exists and is wired into a derived-value calculation (`calculated_gold_value`), but every observed instance of these rate fields holds `0.0`. There is no evidence in Shopify data of a live/periodic rate feed, and nothing in the `vishal-app` codebase reads, writes, or schedules any gold-rate update. **Status: no functioning gold-rate mechanism currently exists — only inert scaffolding for one.**

## 17. Jewellery Product Classification

Based on the samples reviewed (representative, not exhaustive across all 582 products):

```
Total products: 582
│
├── Active: 549 / Draft: 33 / Archived: 0
│
├── Standard variant products (PATH A): all sampled products (30-product recent sample + 3-product targeted ring sample)
├── Configurable products (PATH B): none observed
├── Made-to-order products: none observed
└── Unknown / not sampled: majority of the 582 (full-catalogue paging not performed, to keep the audit read-cost light)
```

Product types actually observed (from a 100-product sample): Rings, Earrings, Pendants/Pendant, Bracelets, Necklace. No Bangles, Chains, or Watches were seen in the samples pulled, though `shopify.watch-display` / `shopify.watch-features` **metafield definitions exist** at the store level — **INFERRED** that watches may exist elsewhere in the untraversed catalogue, or that this is simply Shopify's default taxonomy definition set and not evidence of actual watch products.

## 18. Module 1 Gap Analysis (Jewellery pricing / price breakdown)

| Requirement | Existing? | Current Implementation | Gap | Priority | Phase |
|---|---|---|---|---|---|
| Weight capture per variant | PARTIAL | `custom.gold_weight` metafield, populated on a subset of products; native Shopify `inventoryItem.weight` unused (always 0) | No app-side model; no UI to view/edit; coverage across full catalogue unknown | High | Phase 2 |
| Gold rate input | PARTIAL | `custom.gold_price_per_gram` metafield exists but is `0.0` everywhere sampled | No live rate source; no rate history; no admin UI | High | Phase 4 |
| Making charge model | EXISTS (data only) | `custom.making_charge_per_gram` populated, appears in calculated total | No app-side rule engine; hardcoded per-variant, not rule-driven | Medium | Phase 1/3 |
| Diamond/stone pricing | PARTIAL | `custom.diamond_weight` + `global.price_carat_mrp` populated; multi-stone slots (`_2`..`_5`) defined but not observed populated | Unclear whether multi-stone path is used anywhere; no app logic | Medium | Phase 1 |
| Price breakdown display (storefront) | MISSING | No theme app extension, no storefront code found (theme itself could not be audited — scope gap) | Full build required | High | Phase 1/6 |
| Price calculation formula (app-owned) | MISSING | Only inert/legacy calculated_* metafields; formula not reproduced in `vishal-app` code | Full build required — must first reverse-engineer/confirm formula precisely (residual mismatch noted in Section 9) | High | Phase 1 |
| Member/tiered pricing | PARTIAL | `custom.elite_member_price`, `discount_rate/amount`, `membership_only`/`membership_disc` fields exist | No app logic ties these together; origin/owner of these values is unknown | Medium | Phase 1 |

## 19. Module 2 Gap Analysis

| Requirement | Existing? | Current Implementation | Gap | Priority | Phase |
|---|---|---|---|---|---|
| Global rates | MISSING | No live rate source found; only zeroed snapshot fields | Full build | Critical | Phase 4 |
| Weight model | PARTIAL | Per-variant metafield only, no app database model | Build app-side weight model + sync | High | Phase 2 |
| Configurator | UNKNOWN/likely not needed yet | No configurator pattern found in any sampled product; all products use standard variants | N/A unless PATH B products are found elsewhere in catalogue | Low (defer) | Phase 5 |
| Component inventory | MISSING | No evidence of component-level (vs. finished-SKU) inventory anywhere audited | Full build, and only if configurator is confirmed needed | Low (defer) | Phase 7 |
| Market profiles | UNKNOWN | `markets` query denied (scope gap); only 1 presentment currency (INR) configured | Re-audit once `read_markets` scope is available; likely single-market given INR-only setup | Low | Phase 2 (defer deeper work) |
| Purity | EXISTS | "Purity" is a real, consistently-used variant option (14K/18K) across sampled products | App needs to read/react to this option, not create it | — | Phase 3 |
| FX | MISSING | Single currency (INR) only; no FX-related fields found | Likely not needed given single-currency store — defer | Low (defer) | — |
| Change guard (rate sanity-check before applying) | MISSING | No such mechanism found anywhere | Full build | High | Phase 4/8 |
| Rate approval workflow | MISSING | No such mechanism found | Full build | Medium | Phase 4/8 |
| Rate movement / history | MISSING | Only a single `last_calculated_at` timestamp per variant, no time-series/history model | Full build | Medium | Phase 4 |
| Variant repricing (bulk) | PARTIAL (evidence of past manual/external run) | `pricing_batch_id`, `last_calculated_at` suggest a prior batch process existed, but it is not present in this codebase and appears stalled (rates zeroed) | Rebuild as an owned, scheduled app feature | High | Phase 3/4 |
| Configurator pricing | MISSING | N/A — no configurator exists | Defer until PATH B need is confirmed | Low (defer) | Phase 5 |
| Cart Transform | MISSING | No Shopify Function of any kind in `extensions/` | Defer — only needed once configurator/component pricing requires cart-time adjustment | Low (defer) | Phase 6 |
| Component availability | MISSING | No component inventory model exists | Defer, same reasoning as Component inventory | Low (defer) | Phase 7 |

## 20. Path A vs Path B Recommendation

**Recommendation: build for PATH A first.** Every jewellery product sampled across two independent sampling passes (a 30-product recency sample and a targeted 3-product Rings sample, including one product with 80 variants) uses standard Shopify options/variants to encode Purity, Size, Chain Length, and Center Diamond Size. This is squarely within Shopify's native variant model's capabilities (well under the 3-option/100-variant-ish comfort zone, though the 80-variant ring is approaching Shopify's older 100-variant-per-product ceiling — confirm current limits are not a constraint as catalogue grows).

No evidence justifies building a PATH B configurator at this time. This should be revisited only if a future, fuller catalogue scan turns up products that don't fit the variant model (e.g. genuinely made-to-order pieces with free-form stone/setting choices) — recommend a full-catalogue scan as an early Phase 1 task before committing to skip PATH B entirely.

## 21. Recommended Gold Rate Update Architecture

```text
                          Earthly Jewels Store (gold-rate-update.myshopify.com)
                                          |
                                          | Admin GraphQL API (2026-07)
                                          |
                                          v
                                     vishal-app
                                          |
        +--------------------+-----------+-----------+--------------------+
        |                    |                       |                    |
  Authentication         Admin UI Routes      Pricing Engine        Prisma DB
  (existing, OAuth)      (new: rate mgmt,     (new module)          (new models:
                          approval, history)         |                RateSnapshot,
                                                      |                PricingRule,
                                          +-----------+-----------+    PricingBatch,
                                          |                       |    ProductPricingLink)
                                   Rate Source(s)          Variant Repricer
                                   (manual entry first;    (bulk productVariantsBulkUpdate
                                    external API later,     + metafield writes, replacing
                                    behind a change guard)   the stalled prior batch process)
```

This reuses the existing auth/session infrastructure as-is and adds: (1) new Prisma models for rates/rules/batches, (2) new admin routes for rate entry + approval, (3) a pricing/repricing service, (4) scheduled execution (cron or Shopify-triggered) to replace whatever produced `pricing_batch_id: "2"`.

## 22. Recommended Database Model

New Prisma models to add (illustrative, not yet implemented):

```prisma
model MetalRate {
  id          String   @id @default(cuid())
  metal       String   // "GOLD", "SILVER", etc.
  purity      String   // "14K", "18K"
  ratePerGram Decimal
  source      String   // "manual", future: API name
  approvedBy  String?
  approvedAt  DateTime?
  effectiveAt DateTime
  createdAt   DateTime @default(now())
}

model PricingBatch {
  id          String   @id @default(cuid())
  status      String   // "pending", "approved", "applied", "failed"
  triggeredBy String
  createdAt   DateTime @default(now())
  completedAt DateTime?
}

model VariantPricingLog {
  id            String   @id @default(cuid())
  batchId       String
  shopifyVariantGid String
  oldPrice      Decimal
  newPrice      Decimal
  goldValue     Decimal
  diamondValue  Decimal
  makingValue   Decimal
  createdAt     DateTime @default(now())
}
```

This intentionally mirrors, and is meant to **replace/own**, the currently-orphaned `custom.calculated_*` / `pricing_batch_id` metafield pattern already visible on the store, rather than inventing an unrelated new scheme.

## 23. Recommended Shopify Metafield / Metaobject Model

Reuse the existing variant metafield keys already defined store-wide wherever possible (`custom.gold_weight`, `custom.gold_price_per_gram`, `custom.making_charge_per_gram`, `custom.diamond_weight`, `global.price_carat_mrp`, `custom.calculated_gold_value`, `custom.calculated_diamond_value`, `custom.calculated_making_value`, `custom.last_calculated_at`, `custom.pricing_batch_id`) rather than defining a parallel set — these definitions already exist and (per Section 9) some products are already populated. Confirm with the merchant whether these were created by a tool worth continuing to interoperate with, before deprecating them.

## 24. Recommended Admin Screens

1. Rate entry/approval screen (manual gold rate input per purity, with a change-guard confirmation step before applying).
2. Pricing batch review screen (preview affected variants + price deltas before committing — addressing the "STOP and ask me first" pattern the audit itself followed, as a permanent UX feature).
3. Rate history / movement log.
4. Product/variant pricing coverage report (which of the 582 products have gold-rate metafields populated vs. not — directly extends this audit's Section 9 finding).

## 25. Recommended Storefront Changes

Deferred pending a theme audit (Section 11 — blocked on `read_themes` scope). Once accessible: build a price-breakdown block as a Theme App Extension (App Block) on the product template, showing gold value / diamond value / making charge / total, sourced from the same metafields the admin pricing engine writes.

## 26. Phase-wise Implementation Plan

**Phase 0 — Audit**: This document. Complete.

**Phase 1 — Module 1 Pricing Engine**
- Objective: reproduce and own the gold+diamond+making formula found in Section 9, replacing the orphaned external process.
- Reuse: existing metafield keys/values already on a subset of products; existing Prisma/session infra.
- New: pricing calculation service, Prisma models (Section 22), formula validation against the residual mismatch noted in Section 9 (must resolve before trusting the formula).
- Shopify API: `productVariants` read, `productVariantsBulkUpdate` + `metafieldsSet` write (needs no new scopes beyond `write_products`).
- Risks: formula residual (Section 9) not fully understood; must confirm with merchant/domain expert before automating writes.
- Completion criteria: recalculated price matches actual current price within an agreed tolerance for a full sample of populated products.

**Phase 2 — Weight + Market Foundation**
- Objective: formalize weight capture and confirm market/currency scope.
- New: admin screen to view/edit `gold_weight` per variant; full-catalogue scan for weight-field coverage.
- Shopify API: add `read_markets` scope to resolve Section 6/19 unknowns.
- Completion criteria: weight coverage report produced; market configuration confirmed VERIFIED not UNKNOWN.

**Phase 3 — Earthly Path A Variant Pricing**
- Objective: apply the Phase 1 engine across all PATH A products at scale.
- New: bulk repricing job, coverage-gap remediation (populate missing metafields for currently-unpriced products).
- Risks: 582-product, multi-variant bulk mutation — must include dry-run/preview and rollback logging (`VariantPricingLog`).
- Completion criteria: all active jewellery products have populated, correct pricing metafields.

**Phase 4 — Global Gold/Metal Rate Engine**
- Objective: replace the zeroed `gold_price_per_gram` with a real, governed rate.
- New: manual rate entry UI first (fastest to ship safely); rate history table; change-guard (reject a rate update that moves >X% without explicit approval); optional external rate API later.
- Completion criteria: rate updates flow through to `calculated_gold_value` and variant price via Phase 1 engine.

**Phase 5 — Configurator**: Deferred (Section 20) — only start if a full-catalogue scan surfaces genuine PATH B products.

**Phase 6 — Checkout / Cart Transform**: Deferred until Phase 5 confirms need.

**Phase 7 — Component Inventory**: Deferred until Phase 5 confirms need.

**Phase 8 — Production Hardening**: rate-approval audit trail, monitoring/alerting on batch failures, scope reduction review (Section 29), load-tested bulk repricing for 582+ products.

## 27. Testing Plan

- Unit tests for the pricing formula against the real observed examples in Section 9 (including reproducing the residual gap).
- Dry-run mode for any bulk repricing batch, diffed against current live prices before commit.
- Manual QA on the Partner dev store (`gold-rate-update.myshopify.com`) before any production store is targeted — note this store itself appears to already be a live, merchandised catalogue, so even "dev" changes here carry real risk.

## 28. Security Review

- No `.env` file exists in the repository; no secrets are checked into git. **VERIFIED** via `git status`/file listing.
- Access token in local SQLite (`prisma/dev.sqlite`) confirmed to exist but was never displayed. `Credential exists: YES`.
- Current live scopes: `read_products`, `write_products` only.

  ```text
  Current scope:
  write_products

  Risk:
  Broader than needed for a pure audit, but required for any future pricing-write phase. Not a risk in itself; flag that `shopify.app.toml` (the unlinked file) additionally requests write_metaobjects and write_metaobject_definitions, which are NOT currently granted and NOT currently needed — do not add until a metaobject-based design is actually chosen.
  ```
- `read_themes`, `read_markets`, `read_locations` are all currently **missing**, which blocked several audit sections (10, 11, 19). Recommend adding these as read-only scopes in a future phase rather than during further audit work, since scope changes require merchant re-approval.
- No webhooks are currently live (Section 13) — the `app/uninstalled` session-cleanup path is not actually wired to the live app config, meaning **uninstall cleanup may not currently work** — worth flagging to the merchant/developer independent of the gold-rate project.

## 29. Risks

- The formula reconstructed in Section 9 has an unexplained residual (~₹1,161 on the one fully-checked example) — building automation on an incompletely-understood formula risks visibly wrong prices on a real, actively-merchandised catalogue.
- `gold_price_per_gram` being `0.0` everywhere sampled could mean either "never wired up" or "intentionally reset for a reason unknown to this audit" — confirm with whoever ran `pricing_batch_id: "2"` before overwriting.
- Only a minority of products in the sample carry the pricing metafields at all — the true coverage percentage across all 582 products is unknown and could be much lower than the samples suggest, since samples were drawn from older/`updatedAt`-sorted product sets, not randomly.
- This store, despite being a "Partner development store," contains substantial real merchandising content (582 products, 47 curated collections, live review data) — treat all future changes with production-level care regardless of its Partner/dev classification.

## 30. Deferred Features

- Cart Transform — no configurator exists yet to require it.
- Global Markets support — only INR/single-currency confirmed so far; revisit after Phase 2 resolves the `read_markets` scope gap.
- Component inventory — no evidence any product needs component-level stock tracking.
- Independent tax engine — `taxesIncluded: false`, standard Shopify tax handling observed; no indication a custom tax engine is needed.
- Multi-stone (`_2`..`_5`) pricing slots — defined in the schema but not observed in use; do not build UI/logic for these until a populated example is found.
- FX/multi-currency — single-currency (INR) store; no evidence of need.

## 31. Questions / Unknowns Requiring Confirmation

1. Who/what produced `pricing_batch_id: "2"` and the associated `calculated_*` metafields — an internal script, a spreadsheet import, or a now-uninstalled app? This is important provenance before building on top of it.
2. Why is `gold_price_per_gram` (and both rate snapshots) zeroed on every sampled product — was this intentional (e.g. a reset before a fresh gold-rate project) or a bug?
3. What explains the ~₹1,161 residual between the calculated components and the actual price in the one fully-checked example (Section 9) — is there a base/setting charge metafield not yet found, or a rounding/markup step?
4. Can `read_themes`, `read_markets`, and `read_locations` scopes be added so Sections 6, 11, and 19 can be completed?
5. Is the full 582-product catalogue worth a complete (not sampled) scan before Phase 1 begins, to get an exact pricing-metafield coverage percentage and confirm zero PATH B products exist?
6. What is the `craftshift`/"Rubik" app (Section 12) — is it relevant to a future configurator, or unrelated?
7. Is the `shopify.app.toml` file (unlinked, different client_id, requesting `write_metaobjects`/`write_metaobject_definitions`) an artifact to clean up, or evidence of a planned/parallel app configuration?

## 32. Final Recommendation

Proceed with **Phase 0 → Phase 1** as scoped in Section 26: build an app-owned pricing engine that reproduces and takes over the existing (currently stalled) gold+diamond+making-charge formula already partially present in the store's variant metafields, rather than introducing a new/parallel schema. Resolve the open questions in Section 31 — especially the residual-formula mismatch and the zeroed gold rate — before writing any prices to this store, since it is a real, actively-merchandised catalogue despite being a Partner development store. Do not begin configurator (PATH B) work; nothing in this audit justifies it yet.
