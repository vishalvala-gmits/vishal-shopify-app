# Shopify Jewellery Savings Scheme App
## Full Implementation Plan — React Router + TypeScript + Shopify

**Document purpose:** Step-by-step implementation plan for the new Jewellery Savings Scheme / Monthly Contribution Widget.

**Target stack**
- Shopify App
- Node.js
- React Router
- TypeScript
- Shopify Admin GraphQL API
- Theme App Extension / App Block
- Existing project database if the current app already has one
- No real payment in V1

---

# 1. Business Requirement — Final Understanding

The app allows a Shopify merchant to configure a monthly jewellery savings scheme.

Example:

- Customer contribution: ₹10,000/month
- Customer contribution period: 9 months
- Merchant bonus: 1 extra month
- Customer actually pays: ₹90,000
- Bonus value: ₹10,000
- Total scheme benefit: ₹1,00,000
- Optional free gift: Diamond Pendant worth ₹10,000
- Customer clicks Continue / Enquire Now
- V1 captures customer interest; it does NOT process payment.

The customer can change only the monthly contribution amount.

The customer cannot change the scheme duration.

---

# 2. Important Scope Decision

This is NOT a replacement for Shopify's Product, Variant, Price, or Inventory system.

Shopify continues to manage:

- Products
- Variants
- Product prices
- Inventory
- Orders
- Customers

The app manages:

- Savings schemes
- Scheme configuration
- Monthly contribution rules
- Bonus rules
- Gift configuration
- Product/scheme assignment
- Enquiry capture

Recommended relationship:

```text
Shopify Product
      |
      | displayed with
      v
Savings Scheme Widget
      |
      v
App Savings Scheme Configuration
```

Do NOT add savings-specific columns directly to Shopify product/variant data unless a future requirement explicitly needs that.

---

# 3. V1 Scope

## Included

1. Merchant admin settings
2. Scheme duration
3. Minimum contribution
4. Maximum contribution
5. Quick-select contribution amounts
6. Bonus month ON/OFF
7. Bonus month calculation
8. Optional gift
9. Gift name and value
10. Product assignment
11. Storefront calculator
12. Responsive UI
13. Enquiry / interest form
14. Enquiry storage
15. Validation
16. Authentication and shop isolation
17. UI and calculation tests
18. Error handling
19. Documentation

## Not included in V1

- Real payment collection
- Subscription billing from customers
- Automatic jewellery order creation
- Inventory reservation
- Jewellery redemption processing
- Customer login/account system
- Complex CRM
- Coupon/discount logic
- Automatic payout
- Maturity settlement
- Refund processing

These should remain future phases.

---

# 4. Merchant Admin Flow

```text
Shopify Admin
    |
    v
Open App
    |
    v
Savings Scheme Settings
    |
    +--> Configure duration
    +--> Configure amount range
    +--> Configure presets
    +--> Configure bonus
    +--> Configure gift
    +--> Configure currency/style
    +--> Assign products
    |
    v
Save
```

---

# 5. Admin UI Requirements

Create an admin page such as:

```text
Savings Scheme
------------------------------------------------

Scheme Name
[ Gold Savings Scheme ]

Contribution Months
[ 9 ]

Bonus Month
[ ON ]

Bonus Months
[ 1 ]

Minimum Monthly Contribution
[ ₹2,000 ]

Maximum Monthly Contribution
[ ₹19,000 ]

Quick Select Amounts
[ ₹3,000 ] [ ₹5,000 ] [ ₹10,000 ] [ ₹19,000 ]

Free Gift
[ ON ]

Gift Name
[ Free Diamond Pendant ]

Gift Value
[ ₹10,000 ]

Currency Symbol
[ ₹ ]

Primary Color
[ #5C4642 ]

Assigned Products
[ Select Products ]

                    [ Save Scheme ]
```

## Admin validation

- Scheme name required
- Duration must be an integer >= 1
- Minimum amount must be > 0
- Maximum amount must be >= minimum
- Preset amounts must be >= minimum
- Preset amounts must be <= maximum
- Preset amounts should not contain duplicates
- Bonus months must be >= 1 when bonus is enabled
- Gift name required when gift is enabled
- Gift value must be > 0 when gift is enabled
- Currency symbol required
- Primary color must be a valid color
- Product IDs must belong to the current shop
- Reject invalid/unknown products

---

# 6. Storefront UI Requirements

Recommended layout:

```text
Adjust your monthly contribution

              ₹10,000

₹2,000 ---------------------- ₹19,000
              ●

[ ₹3,000 ] [ ₹5,000 ] [ ₹10,000 ] [ ₹19,000 ]


Estimated Benefit

You Pay
₹90,000

Bonus
₹10,000

You Get
₹1,00,000


Free Diamond Pendant
Worth ₹10,000


[ CONTINUE ]
```

The exact visual design can follow the supplied reference image, but do not copy branding or assets.

---

# 7. Storefront Behaviour

## Initial value

Choose a sensible default:

```text
First valid preset amount
```

For example:

```text
₹10,000
```

If presets are unavailable, use:

```text
minimum amount
```

## Slider

Slider must respect:

```text
minAmount
maxAmount
```

Example:

```text
min = ₹2,000
max = ₹19,000
```

## Quick buttons

Clicking:

```text
₹5,000
```

must update:

- slider
- displayed monthly amount
- total contribution
- bonus
- total benefit

All values must remain synchronized.

---

# 8. Calculation Logic

Use one shared calculation function.

Input:

```text
monthlyAmount
durationMonths
bonusEnabled
bonusMonths
```

Calculation:

```text
totalContribution =
    monthlyAmount * durationMonths

bonusAmount =
    bonusEnabled
        ? monthlyAmount * bonusMonths
        : 0

totalBenefit =
    totalContribution + bonusAmount
```

Example:

```text
monthlyAmount = ₹10,000
duration = 9
bonusMonths = 1

totalContribution = ₹90,000
bonusAmount = ₹10,000
totalBenefit = ₹1,00,000
```

Do not duplicate this calculation in multiple components.

Recommended:

```text
app/services/savingsScheme/calculator.ts
```

or equivalent existing service structure.

---

# 9. Important Business Rule

The optional gift is separate from the scheme monetary benefit.

Example:

```text
You Pay       ₹90,000
You Get       ₹1,00,000
Free Gift     Diamond Pendant worth ₹10,000
```

Do NOT automatically calculate:

```text
Total Benefit = ₹1,10,000
```

unless the business explicitly confirms that the gift value must be included in the financial benefit.

The gift should be displayed separately.

---

# 10. Database Design

Use the existing app database if one already exists.

Recommended tables:

## savings_schemes

```text
id
shop_id / shop_domain
name

duration_months

bonus_enabled
bonus_months

min_amount
max_amount

preset_amounts

gift_enabled
gift_name
gift_value

currency_symbol
primary_color

status

created_at
updated_at
```

## savings_scheme_products

```text
id
scheme_id
shop_id / shop_domain
shopify_product_id

created_at
updated_at
```

## savings_enquiries

```text
id
shop_id / shop_domain
scheme_id
shopify_product_id

customer_name
customer_email
customer_phone

monthly_amount
duration_months
bonus_amount
total_contribution
total_benefit

gift_name
gift_value

source_url

created_at
updated_at
```

---

# 11. Database Relationship

```text
shops
  |
  +---- savings_schemes
           |
           +---- savings_scheme_products
           |
           +---- savings_enquiries
```

Conceptually:

```text
One Shop
   |
   +-- One or more Schemes
             |
             +-- Many Products
             |
             +-- Many Enquiries
```

If the business confirms that there will always be exactly one scheme per shop, the schema can still support multiple schemes safely for future expansion.

---

# 12. Product Assignment

A scheme can be assigned to selected Shopify products.

Example:

```text
Gold Savings Scheme
       |
       +-- Gold Plan Product
       +-- Diamond Plan Product
```

When the storefront app block loads, it should determine:

```text
Current Shopify Product
        |
        v
Does this product have an active scheme?
        |
      YES
        |
        v
Load scheme configuration
```

If no scheme is assigned:

```text
Do not render the widget.
```

---

# 13. Recommended Shopify Storefront Integration

Use a **Theme App Extension with an App Block**.

Do not directly edit the merchant's theme files.

The merchant should be able to add the app block through Shopify's theme editor.

Example:

```text
Online Store
   |
Themes
   |
Customize
   |
Product Page
   |
Add block
   |
Savings Scheme Widget
```

Shopify's current documentation recommends theme app extensions for online-store integrations, and app blocks can be added/repositioned by merchants without directly modifying theme code.

---

# 14. Theme App Extension

Recommended extension structure:

```text
extensions/
  savings-scheme/
    blocks/
      savings-scheme.liquid
    assets/
      savings-scheme.js
      savings-scheme.css
    locales/
    shopify.extension.toml
```

The Liquid block should provide:

- Current product identifier
- App block settings if needed
- Widget container
- Required asset loading

JavaScript should:

- Load scheme configuration
- Render calculator
- Handle slider
- Handle presets
- Handle calculations
- Handle enquiry form
- Handle loading/error states

CSS should:

- Match the reference design
- Be responsive
- Avoid leaking styles into the merchant's theme
- Use scoped class names

---

# 15. Storefront API Design

Recommended endpoint:

```text
GET /api/storefront/savings-scheme?productId=...
```

Response:

```json
{
  "enabled": true,
  "scheme": {
    "name": "Gold Savings Scheme",
    "durationMonths": 9,
    "bonusEnabled": true,
    "bonusMonths": 1,
    "minAmount": 2000,
    "maxAmount": 19000,
    "presetAmounts": [3000, 5000, 10000, 19000],
    "gift": {
      "enabled": true,
      "name": "Free Diamond Pendant",
      "value": 10000
    },
    "currencySymbol": "₹",
    "primaryColor": "#5C4642"
  }
}
```

If no scheme:

```json
{
  "enabled": false
}
```

---

# 16. Enquiry API

Recommended endpoint:

```text
POST /api/storefront/savings-enquiry
```

Request:

```json
{
  "productId": "gid://shopify/Product/123",
  "name": "Rahul",
  "email": "rahul@example.com",
  "phone": "9876543210",
  "monthlyAmount": 10000
}
```

The server must NOT blindly trust calculated totals sent by the browser.

Server should:

1. Find the product
2. Find the active scheme
3. Validate monthly amount against min/max
4. Validate that the amount is an allowed preset or valid slider value according to business rules
5. Read duration from database
6. Read bonus configuration from database
7. Recalculate contribution
8. Recalculate bonus
9. Recalculate benefit
10. Read gift configuration
11. Save the final server-calculated values

---

# 17. Enquiry Validation

Required:

```text
name
phone OR email
productId
monthlyAmount
```

Recommended:

```text
name:
  trim
  reasonable length

email:
  valid email if provided

phone:
  valid expected phone format

monthlyAmount:
  numeric
  integer/decimal according to currency
  >= min
  <= max
```

Reject:

```text
NaN
Infinity
negative values
zero
unexpected product
inactive scheme
wrong shop
```

Use server-side validation even if the frontend validates.

---

# 18. Security / Tenant Isolation

Every database query must be scoped to the current Shopify shop.

Never do:

```text
SELECT * FROM savings_schemes WHERE id = ?
```

without checking shop ownership.

Prefer:

```text
WHERE id = ?
AND shop_id = currentShop
```

Same rule for:

- Schemes
- Products
- Enquiries

A merchant from Shop A must never be able to access Shop B's scheme.

---

# 19. Shopify Authentication

Admin routes must use the existing Shopify authentication mechanism.

The current Shopify React Router package supports Shopify authentication and Admin API calls.

Follow the existing app's authentication pattern.

Do not create a second authentication system unless the existing application requires it.

---

# 20. Admin Routes

Suggested route structure:

```text
/app/savings-scheme
/app/savings-scheme/new
/app/savings-scheme/$id
/app/savings-scheme/enquiries
```

If the existing project has different conventions, follow the project's conventions instead of blindly creating these exact routes.

---

# 21. Recommended Code Structure

Adapt this to the existing project:

```text
app/
  routes/
    app.savings-scheme.tsx
    app.savings-scheme.$id.tsx
    app.savings-scheme.enquiries.tsx

    api.storefront.savings-scheme.tsx
    api.storefront.savings-enquiry.tsx

  services/
    savingsScheme/
      calculator.server.ts
      scheme.server.ts
      enquiry.server.ts
      product.server.ts

  validators/
    savingsScheme.ts
    savingsEnquiry.ts

  components/
    savingsScheme/
      SchemeForm.tsx
      ContributionSlider.tsx
      SchemeSummary.tsx
      GiftCard.tsx
      EnquiryForm.tsx

extensions/
  savings-scheme/
    blocks/
      savings-scheme.liquid
    assets/
      savings-scheme.js
      savings-scheme.css
```

Do not force this structure if the existing repository already has a clear architecture.

---

# 22. Admin UI State

Admin form should have:

```text
loading
saving
success
validation errors
server error
```

After save:

```text
Scheme saved successfully
```

Do not lose unsaved form data when a validation error occurs.

---

# 23. Storefront UI States

The widget must support:

```text
1. Loading
2. Loaded
3. No scheme
4. Invalid configuration
5. API error
6. Enquiry form
7. Submitting enquiry
8. Enquiry success
9. Enquiry failure
```

Example:

```text
Loading...
```

Then:

```text
Savings Scheme
₹10,000/month
...
```

If unavailable:

```text
Savings scheme is currently unavailable.
```

Do not show a broken calculator.

---

# 24. UI Verification Checklist

Verify desktop:

```text
1280px+
```

Tablet:

```text
768px+
```

Mobile:

```text
320px - 767px
```

Check:

- Slider works
- Quick buttons work
- Selected state works
- Numbers update immediately
- No layout overflow
- Currency formatting is correct
- Gift section appears only when enabled
- Bonus section appears only when enabled
- CTA works
- Form validation works
- Success state works

---

# 25. Calculation Test Matrix

For:

```text
duration = 9
bonus = 1
```

Test:

```text
₹3,000
₹5,000
₹10,000
₹19,000
```

Expected:

| Monthly | Contribution | Bonus | Benefit |
|---:|---:|---:|---:|
| ₹3,000 | ₹27,000 | ₹3,000 | ₹30,000 |
| ₹5,000 | ₹45,000 | ₹5,000 | ₹50,000 |
| ₹10,000 | ₹90,000 | ₹10,000 | ₹1,00,000 |
| ₹19,000 | ₹1,71,000 | ₹19,000 | ₹1,90,000 |

Also test:

```text
bonus OFF
bonus months = 2
duration = 6
minimum = maximum
custom slider values
```

---

# 26. Edge Cases

Must verify:

### Bonus OFF

```text
₹10,000 × 9 = ₹90,000
Bonus = ₹0
Benefit = ₹90,000
```

### Bonus 2 months

```text
₹10,000 × 9 = ₹90,000
Bonus = ₹20,000
Benefit = ₹1,10,000
```

### Minimum equals maximum

```text
min = ₹10,000
max = ₹10,000
```

The UI should not break.

### Gift OFF

Gift card must disappear.

### No presets

Widget must still work using slider.

### Invalid preset

Admin save must reject it.

### Product has no scheme

Widget should not appear.

### Scheme disabled

Widget should not appear.

---

# 27. Important Currency Rule

Do not hard-code ₹ throughout the application.

Store:

```text
currencySymbol
```

Example:

```text
₹
$
€
```

Use a common money formatting utility.

For V1, the merchant can configure the symbol.

Future version can use Shopify's shop currency automatically.

---

# 28. Enquiry Data Example

Customer:

```text
Name: Rahul
Phone: 9876543210
Email: rahul@example.com
```

Selected:

```text
Product: Gold Savings Plan
Monthly: ₹10,000
Duration: 9 months
Bonus: ₹10,000
Contribution: ₹90,000
Benefit: ₹1,00,000
Gift: Free Diamond Pendant
```

Save this snapshot in the enquiry.

This is important because the scheme may change later.

The enquiry should preserve what the customer saw at the time.

---

# 29. Admin Enquiry Page

Recommended table:

```text
Customer
Phone
Email
Product
Monthly Amount
Duration
Contribution
Benefit
Created At
```

Example:

```text
Rahul
9876543210
rahul@example.com
Gold Savings Plan
₹10,000
9 months
₹90,000
₹1,00,000
07 Sep 2026
```

This is useful even though payment is not implemented.

---

# 30. API Request/Response Verification

For every API, verify:

```text
Authentication
Authorization
Validation
Database query
Shop isolation
Error response
Success response
Unexpected input
Missing input
Invalid IDs
```

Never verify only the happy path.

---

# 31. Recommended Error Response

Use a consistent format:

```json
{
  "success": false,
  "message": "Invalid monthly contribution amount.",
  "errors": {
    "monthlyAmount": [
      "Amount must be between ₹2,000 and ₹19,000."
    ]
  }
}
```

Success:

```json
{
  "success": true,
  "message": "Enquiry submitted successfully."
}
```

---

# 32. Implementation Phases

## PHASE 0 — Repository Analysis

Before writing code:

- Understand existing Shopify app
- Identify React Router version
- Identify TypeScript setup
- Identify database
- Identify ORM
- Identify authentication
- Identify route conventions
- Identify existing API patterns
- Identify existing Shopify GraphQL helpers
- Identify existing UI library
- Identify existing extensions
- Identify current shop/session model

Do not change code in Phase 0.

---

## PHASE 1 — Technical Design

Create:

```text
SAVINGS_SCHEME_IMPLEMENTATION_PLAN.md
```

Confirm:

- database model
- routes
- APIs
- UI
- extension
- calculation logic
- security
- tests

No implementation yet.

---

## PHASE 2 — Database

Implement:

```text
savings_schemes
savings_scheme_products
savings_enquiries
```

Create migration/schema.

Verify:

```text
npm run typecheck
npm run lint
```

and the project's database migration command.

---

## PHASE 3 — Calculation Service

Create one calculation service.

Example conceptual API:

```ts
calculateSavingsScheme({
  monthlyAmount,
  durationMonths,
  bonusEnabled,
  bonusMonths,
})
```

Return:

```ts
{
  totalContribution,
  bonusAmount,
  totalBenefit
}
```

Write unit tests before connecting UI.

---

## PHASE 4 — Admin Settings

Build admin UI.

Implement:

- load scheme
- create scheme
- update scheme
- validation
- presets
- bonus
- gift
- style
- product assignment

Verify UI manually.

---

## PHASE 5 — Storefront API

Implement:

```text
GET /api/storefront/savings-scheme
```

Verify:

- correct shop
- correct product
- active scheme
- configuration response
- no scheme response
- invalid product response

---

## PHASE 6 — Theme App Extension

Create Theme App Extension.

Build:

```text
savings-scheme.liquid
savings-scheme.js
savings-scheme.css
```

Connect current Shopify product to the app.

Do not edit merchant theme source files directly.

---

## PHASE 7 — Storefront Calculator

Implement:

- slider
- presets
- calculation
- bonus
- gift
- summary
- CTA

Use the shared business calculation rules.

---

## PHASE 8 — Enquiry

Implement:

```text
POST /api/storefront/savings-enquiry
```

Build:

- customer form
- validation
- server-side calculation
- database save
- success/error states

---

## PHASE 9 — Enquiry Admin

Create merchant enquiry list.

Add:

- filtering
- basic pagination if needed
- customer information
- scheme snapshot
- product
- selected amount

---

## PHASE 10 — Verification

Run:

```text
TypeScript check
Lint
Unit tests
Integration/API tests
Build
Shopify extension validation
Manual storefront test
Manual admin test
Mobile test
```

---

# 33. Claude Code Working Rule

Claude Code must NOT implement the entire feature in one uncontrolled step.

Use the prompts below phase-by-phase.

After every phase:

```text
1. Inspect changes
2. Run verification
3. Report files changed
4. Report files not changed
5. Report tests
6. Stop
```

This prevents accidental changes to unrelated Shopify functionality.

---

# 34. MASTER CLAUDE CODE PROMPT

Use this first:

```text
You are working on an existing Shopify app.

Stack:
- Node.js
- React Router
- TypeScript
- Shopify
- Existing project database/ORM
- Existing Shopify authentication

I need to implement a new feature called:

"Jewellery Savings Scheme"

IMPORTANT:
- This is an existing application.
- Do not rewrite or replace the existing architecture.
- Do not modify unrelated features.
- Do not change existing product, variant, inventory, order, or authentication behaviour.
- Reuse existing project patterns wherever possible.
- Before changing anything, inspect the repository.

Business requirement:

A merchant configures a savings scheme.

Example:
- Duration: 9 contribution months
- Bonus: 1 extra month
- Monthly amount: ₹10,000
- Customer pays: ₹90,000
- Bonus: ₹10,000
- Total benefit: ₹1,00,000
- Optional gift: Free Diamond Pendant worth ₹10,000

Merchant can configure:
- Scheme name
- Duration months
- Minimum monthly amount
- Maximum monthly amount
- Quick-select preset amounts
- Bonus enabled/disabled
- Bonus months
- Optional gift
- Gift name
- Gift value
- Currency symbol
- Primary color
- Products where the scheme is available

Customer can:
- Select monthly amount using slider
- Select quick amount
- See duration but cannot edit it
- See contribution
- See bonus
- See total benefit
- See optional gift
- Click Continue / Enquire Now

V1 does NOT process payment.

Customer enquiry must be stored.

IMPORTANT BUSINESS RULE:
The gift value is displayed separately and must NOT automatically be added to totalBenefit.

IMPORTANT SECURITY RULE:
Never trust calculated values sent by the browser.
Recalculate all financial values on the server using current scheme configuration.

IMPORTANT TENANT RULE:
All scheme/product/enquiry queries must be scoped to the current Shopify shop.

Storefront integration:
Use a Shopify Theme App Extension with an App Block.
Do not directly edit merchant theme code.

First task:
DO NOT IMPLEMENT.

Only analyze the existing repository and produce:

1. Existing architecture summary
2. Existing database/ORM
3. Existing Shopify authentication
4. Existing admin route pattern
5. Existing API route pattern
6. Existing UI component pattern
7. Existing extension structure
8. Existing product lookup approach
9. Existing testing approach
10. Recommended files to create
11. Recommended files to modify
12. Potential conflicts
13. Risks
14. Questions/ambiguities
15. Implementation plan

Do not modify any file.

At the end:
- explicitly state "NO FILES MODIFIED"
- list the commands you used for inspection
- stop.
```

---

# 35. PHASE 1 CLAUDE PROMPT — DATABASE

```text
Implement ONLY the database layer for the Jewellery Savings Scheme feature.

Before coding:
- Re-check the existing architecture.
- Reuse existing ORM/database conventions.
- Do not introduce another ORM.
- Do not modify unrelated tables.

Create the minimum required schema:

1. savings_schemes
2. savings_scheme_products
3. savings_enquiries

Requirements:

savings_schemes:
- shop ownership
- name
- duration_months
- bonus_enabled
- bonus_months
- min_amount
- max_amount
- preset_amounts
- gift_enabled
- gift_name
- gift_value
- currency_symbol
- primary_color
- status
- timestamps

savings_scheme_products:
- scheme_id
- shop ownership
- Shopify product ID
- timestamps
- suitable uniqueness constraint

savings_enquiries:
- shop ownership
- scheme ID
- Shopify product ID
- customer name
- email
- phone
- monthly amount
- duration snapshot
- bonus amount snapshot
- total contribution snapshot
- total benefit snapshot
- gift name snapshot
- gift value snapshot
- source URL
- timestamps

Important:
- Preserve historical enquiry values.
- Add appropriate indexes.
- Add appropriate foreign keys according to existing project conventions.
- Do not modify Shopify's product tables.

After implementation:
1. Run migration/schema verification.
2. Run typecheck.
3. Run lint.
4. Report all created/modified files.
5. Report migration result.
6. Stop.

Do not implement UI or APIs in this phase.
```

---

# 36. PHASE 2 CLAUDE PROMPT — CALCULATION + VALIDATION

```text
Implement ONLY the business calculation and validation layer.

Create a reusable savings scheme calculator.

Input:
- monthlyAmount
- durationMonths
- bonusEnabled
- bonusMonths

Output:
- totalContribution
- bonusAmount
- totalBenefit

Formula:
totalContribution = monthlyAmount * durationMonths

bonusAmount =
  bonusEnabled
    ? monthlyAmount * bonusMonths
    : 0

totalBenefit = totalContribution + bonusAmount

Gift value is NOT included in totalBenefit.

Add validation for:
- amount > 0
- amount within min/max
- duration >= 1
- bonusMonths >= 1 when bonus enabled
- valid presets
- gift configuration

Add unit tests for:
- 3000 / 9 / 1
- 5000 / 9 / 1
- 10000 / 9 / 1
- 19000 / 9 / 1
- bonus disabled
- bonus 2 months
- minimum amount
- maximum amount
- invalid amount
- invalid duration

Do not build UI.
Do not build API routes.

Run:
- tests
- typecheck
- lint

Report exact results and stop.
```

---

# 37. PHASE 3 CLAUDE PROMPT — ADMIN UI

```text
Implement ONLY the Shopify Admin Savings Scheme settings UI.

Requirements:

Create a merchant settings page.

Fields:
- Scheme name
- Duration months
- Bonus enabled
- Bonus months
- Minimum amount
- Maximum amount
- Preset amounts
- Gift enabled
- Gift name
- Gift value
- Currency symbol
- Primary color
- Product assignment

Use the existing project's Shopify Admin UI patterns.

Do not create a new design system.

Implement:
- load existing configuration
- create
- update
- client validation
- server validation
- loading state
- saving state
- success state
- error state

Do not implement storefront widget yet.

Do not modify unrelated admin pages.

After implementation:
- typecheck
- lint
- tests/build if available
- inspect changed files
- report exact files changed
- stop.
```

---

# 38. PHASE 4 CLAUDE PROMPT — STOREFRONT API

```text
Implement ONLY the storefront read API.

Create an endpoint that accepts the current Shopify product identifier.

The endpoint must:
1. Determine the relevant shop safely.
2. Find the product's assigned active savings scheme.
3. Return only the configuration needed by the storefront.
4. Return enabled=false when no active scheme exists.
5. Never expose internal database fields unnecessarily.

Response must contain:
- scheme name
- duration months
- bonus enabled
- bonus months
- min amount
- max amount
- preset amounts
- gift configuration
- currency symbol
- primary color

Validate:
- missing product ID
- invalid product ID
- unknown product
- product without scheme
- inactive scheme
- cross-shop access

Do not implement enquiry submission yet.

Run:
- API tests
- typecheck
- lint

Stop after verification.
```

---

# 39. PHASE 5 CLAUDE PROMPT — THEME APP EXTENSION

```text
Implement ONLY the Shopify Theme App Extension and App Block for the Savings Scheme.

Requirements:
- Create a Theme App Extension.
- Create a Savings Scheme App Block.
- Do not edit merchant theme files directly.
- Keep CSS scoped.
- Keep JavaScript scoped.
- Make the block responsive.
- Pass the current product identifier to the storefront widget.
- Load the required assets only for the widget.

The block should render:
- widget container
- loading state
- calculator mount point

Do not implement the complete calculator yet.

Verify:
- extension structure
- Shopify extension validation
- build
- typecheck if applicable

Report:
- created files
- extension configuration
- verification results

Stop.
```

---

# 40. PHASE 6 CLAUDE PROMPT — STOREFRONT UI

```text
Implement the complete storefront Savings Scheme calculator.

Reference design:
- Monthly contribution display
- Slider
- Quick-select buttons
- Contribution summary
- Bonus summary
- Total benefit
- Optional gift card
- Continue / Enquire Now CTA

Behaviour:
- Load configuration from storefront API.
- Hide widget if enabled=false.
- Use configured min/max.
- Quick buttons update slider.
- Slider updates quick selection when appropriate.
- Recalculate immediately.
- Duration is read-only.
- Bonus is calculated from configuration.
- Gift is displayed separately.
- Currency symbol is configurable.
- Primary color is configurable.

Responsive requirements:
- desktop
- tablet
- mobile
- 320px minimum viewport
- no horizontal overflow

Accessibility:
- slider must have accessible label
- buttons must be keyboard accessible
- form fields must have labels
- visible validation errors
- focus states

Do not implement payment.

After implementation:
- run build
- typecheck
- lint
- test calculator
- inspect mobile layout
- report changed files
- stop.
```

---

# 41. PHASE 7 CLAUDE PROMPT — ENQUIRY

```text
Implement the enquiry flow only.

Storefront:
When customer clicks Continue / Enquire Now:
- show enquiry form
- name
- phone
- email

At least one contact method should be required according to the business rule.

Submit to:
POST /api/storefront/savings-enquiry

IMPORTANT:
Never trust browser-calculated:
- totalContribution
- bonusAmount
- totalBenefit

Server must:
1. Resolve current shop.
2. Resolve product.
3. Resolve active scheme.
4. Validate monthly amount.
5. Read scheme configuration from DB.
6. Recalculate all amounts.
7. Save enquiry snapshot.
8. Return success.

Save:
- customer information
- product
- scheme
- selected monthly amount
- duration snapshot
- bonus snapshot
- contribution snapshot
- benefit snapshot
- gift snapshot
- source URL

Implement:
- loading
- validation
- server errors
- success
- retry

Run API tests and typecheck.

Stop after verification.
```

---

# 42. PHASE 8 CLAUDE PROMPT — ENQUIRY ADMIN

```text
Implement the merchant enquiry list.

Requirements:
- Shopify admin protected route
- current-shop scoped queries
- customer name
- phone
- email
- product
- monthly contribution
- duration
- contribution
- benefit
- created date

Add pagination if existing project conventions support it.

Do not modify enquiry values after creation from the UI.

Verify:
- shop isolation
- empty state
- loading state
- error state
- pagination
- mobile/admin layout

Run tests/typecheck/lint.

Stop.
```

---

# 43. PHASE 9 CLAUDE PROMPT — FULL VERIFICATION

```text
Do a complete verification pass for the Jewellery Savings Scheme feature.

Do not add new functionality.

Verify:

DATABASE
- migrations
- indexes
- relationships
- shop isolation

ADMIN
- create
- update
- validation
- presets
- bonus
- gift
- product assignment
- save error
- save success

STOREFRONT
- widget loading
- widget hidden when no scheme
- slider
- presets
- calculations
- duration read-only
- bonus
- gift
- CTA
- responsive UI

API
- GET scheme
- POST enquiry
- invalid product
- invalid amount
- invalid shop
- missing fields
- inactive scheme
- server-side recalculation

SECURITY
- authentication
- authorization
- tenant isolation
- input validation
- no trusted client-side financial calculations

CALCULATIONS
Verify:
₹3,000 => ₹27,000 + ₹3,000 = ₹30,000
₹5,000 => ₹45,000 + ₹5,000 = ₹50,000
₹10,000 => ₹90,000 + ₹10,000 = ₹1,00,000
₹19,000 => ₹1,71,000 + ₹19,000 = ₹1,90,000

Run all available:
- tests
- typecheck
- lint
- build
- Shopify extension validation

Also inspect git diff and identify unrelated changes.

If unrelated changes exist, DO NOT revert automatically.
Report them separately.

Final output:
1. Verification summary
2. Test results
3. Files changed
4. Files unrelated to feature
5. Remaining issues
6. Recommended manual checks

Stop.
```

---

# 44. Final Manual QA Checklist

## Admin

- [ ] Open app
- [ ] Create scheme
- [ ] Set 9 months
- [ ] Set min ₹2,000
- [ ] Set max ₹19,000
- [ ] Set presets
- [ ] Enable bonus
- [ ] Set bonus 1 month
- [ ] Enable gift
- [ ] Add gift name
- [ ] Add gift value
- [ ] Assign product
- [ ] Save
- [ ] Refresh page
- [ ] Verify values remain

## Storefront

- [ ] Open assigned product
- [ ] Widget appears
- [ ] Widget does not appear on unassigned product
- [ ] Slider works
- [ ] Presets work
- [ ] Amount updates
- [ ] Duration is not editable
- [ ] Bonus updates
- [ ] Total benefit updates
- [ ] Gift appears
- [ ] Continue works

## Enquiry

- [ ] Submit valid enquiry
- [ ] Verify database record
- [ ] Verify server calculated values
- [ ] Submit invalid amount
- [ ] Submit invalid email
- [ ] Submit empty required fields
- [ ] Verify error messages
- [ ] Verify success state
- [ ] Verify admin enquiry page

## Security

- [ ] Shop A cannot read Shop B scheme
- [ ] Shop A cannot submit enquiry for Shop B
- [ ] Invalid product rejected
- [ ] Client-side totals cannot manipulate stored financial values
- [ ] Admin routes require Shopify authentication

---

# 45. Definition of Done

The feature is complete only when:

```text
[ ] Database implemented
[ ] Admin settings implemented
[ ] Product assignment implemented
[ ] Calculation service implemented
[ ] Calculation tests pass
[ ] Storefront API implemented
[ ] Theme App Extension implemented
[ ] Storefront calculator implemented
[ ] Responsive UI verified
[ ] Enquiry API implemented
[ ] Enquiry storage implemented
[ ] Enquiry admin page implemented
[ ] Server-side financial calculation verified
[ ] Shop isolation verified
[ ] TypeScript passes
[ ] Lint passes
[ ] Tests pass
[ ] Build passes
[ ] Shopify extension validation passes
[ ] No unrelated feature changed
[ ] Manual QA passes
```

---

# 46. Recommended Implementation Order

Do not give Claude Code the whole feature in one prompt.

Use:

```text
STEP 0
Repository analysis

        ↓

STEP 1
Database

        ↓

STEP 2
Calculation + validation

        ↓

STEP 3
Admin UI

        ↓

STEP 4
Storefront API

        ↓

STEP 5
Theme App Extension

        ↓

STEP 6
Storefront calculator

        ↓

STEP 7
Enquiry API + form

        ↓

STEP 8
Admin enquiries

        ↓

STEP 9
Full verification

        ↓

STEP 10
Manual QA
```

At every step:

```text
Implement only this step.
Verify it.
Report changed files.
Report tests.
Stop.
```

This is the safest approach for an existing Shopify application because the new savings feature remains isolated from the existing product-management and other shop functionality.
