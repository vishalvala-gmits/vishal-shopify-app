# Savings Scheme — Business Logic

A Shopify app that lets merchants run a **jewelry-style monthly savings scheme**: customers commit to a fixed monthly contribution for N months, the merchant covers one bonus month for free, and customers can unlock free gifts or redeem early at a pro-rated bonus.

## Core concept

1. Merchant configures **one active scheme per store** (name, monthly amount range, duration, bonus month, free gifts, early redemption rules).
2. A **storefront widget** (theme app block, works on any page — not tied to a specific product) shows a calculator where the customer picks a monthly amount and sees their projected payout.
3. The customer submits an **enquiry** (name + phone/email) to register interest — no payment is collected in-app.
4. The merchant follows up manually and tracks enquiries from the admin dashboard.

## Calculations

```
totalContribution = monthlyAmount × durationMonths
bonusAmount        = monthlyAmount × bonusMonths        (merchant-covered, free to the customer)
totalBenefit       = totalContribution + bonusAmount
```

**Gift eligibility** — a configured gift (max 2 per scheme) applies when
`gift.minAmount ≤ monthlyAmount ≤ gift.maxAmount` (bounds optional).

**Early redemption** — if a customer wants to redeem before the plan completes (after `earlyRedemptionMinMonths`), the bonus is pro-rated on a super-linear curve so staying longer is rewarded disproportionately:

```
bonusPool      = totalBenefit − totalContribution
paidMonths     = min(month, durationMonths)
totalPayment   = paidMonths × monthlyAmount
step           = (month − earlyRedemptionMinMonths) / (totalMonths − earlyRedemptionMinMonths)
bonusBenefit   = round(bonusPool × step^1.45)
payoutValue    = totalPayment + bonusBenefit
```

All totals are **recalculated server-side** on every enquiry submission — the storefront never sends trusted totals.

## What a merchant configures

- Scheme name, contribution range (min/max), up to 4 quick-select preset amounts, one "popular" preset
- Duration (paid months) + bonus months
- Up to 2 free gifts, each with its own unlock range
- Early redemption toggle + eligible-after month
- Currency symbol, brand color, terms & conditions text

## Data

- **SavingsScheme** — one config row per shop.
- **SavingsEnquiry** — one row per customer submission; snapshots the calculated totals and gift eligibility at submission time (not linked to a Shopify customer record — contact info is free text).

## Admin dashboard

- KPIs: total enquiries, enquiries this week, average monthly amount, pipeline value (sum of contributions).
- Scheme configuration summary with a quick edit link.
- Searchable, paginated enquiries list.

## Compliance

Standard mandatory GDPR webhooks are implemented: `customers/data_request` (acknowledge-only, no linked customer records to export), `customers/redact` (deletes matching enquiries by email/phone), `shop/redact` (deletes all scheme + enquiry data 48h after uninstall).

## Not implemented

- No payment processing — enquiries are leads, not transactions.
- No product-level restriction — the widget and scheme apply store-wide.
- No CSV export, analytics reports, or automated messaging.
