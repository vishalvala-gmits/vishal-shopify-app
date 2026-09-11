import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getSchemeForShop, parseGifts } from "../services/savingsScheme.server";
import prisma from "../db.server";

function formatMoney(amount: number, symbol: string): string {
  return `${symbol}${amount.toLocaleString("en-IN")}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [scheme, enquiryCount, enquiriesThisWeek, recentEnquiries, amountAgg] =
    await Promise.all([
      getSchemeForShop(session.shop),
      prisma.savingsEnquiry.count({ where: { shop: session.shop } }),
      prisma.savingsEnquiry.count({
        where: { shop: session.shop, createdAt: { gte: weekAgo } },
      }),
      prisma.savingsEnquiry.findMany({
        where: { shop: session.shop },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          customerName: true,
          customerPhone: true,
          customerEmail: true,
          monthlyAmount: true,
          totalContribution: true,
          giftEligible: true,
          createdAt: true,
        },
      }),
      prisma.savingsEnquiry.aggregate({
        where: { shop: session.shop },
        _sum: { totalContribution: true },
        _avg: { monthlyAmount: true },
      }),
    ]);

  const gifts = scheme ? parseGifts(scheme.gifts).filter((g) => g.enabled) : [];
  const totalMonths = scheme
    ? scheme.durationMonths + (scheme.bonusEnabled ? scheme.bonusMonths : 0)
    : 0;

  return {
    schemeConfigured: Boolean(scheme),
    schemeActive: scheme?.status === "active",
    enquiryCount,
    enquiriesThisWeek,
    pipelineValue: amountAgg._sum.totalContribution ?? 0,
    avgMonthlyAmount: Math.round(amountAgg._avg.monthlyAmount ?? 0),
    recentEnquiries: recentEnquiries.map((e) => ({
      id: e.id,
      customerName: e.customerName,
      contact: e.customerPhone || e.customerEmail || null,
      monthlyAmount: e.monthlyAmount,
      totalContribution: e.totalContribution,
      giftEligible: e.giftEligible,
      createdAt: e.createdAt.toISOString(),
    })),
    scheme: scheme
      ? {
          name: scheme.name,
          currencySymbol: scheme.currencySymbol,
          minAmount: scheme.minAmount,
          maxAmount: scheme.maxAmount,
          durationMonths: scheme.durationMonths,
          bonusEnabled: scheme.bonusEnabled,
          bonusMonths: scheme.bonusMonths,
          totalMonths,
          earlyRedemptionEnabled: scheme.earlyRedemptionEnabled,
          giftCount: gifts.length,
          giftNames: gifts.map((g) => g.name).filter((n): n is string => Boolean(n)),
        }
      : null,
  };
};

export default function Index() {
  const {
    schemeConfigured,
    schemeActive,
    enquiryCount,
    enquiriesThisWeek,
    pipelineValue,
    avgMonthlyAmount,
    recentEnquiries,
    scheme,
  } = useLoaderData<typeof loader>();

  const currency = scheme?.currencySymbol ?? "₹";

  return (
    <s-page heading="Savings Scheme">
      <s-button slot="primary-action" href="/app/savings-scheme">
        {schemeConfigured ? "Edit scheme" : "Set up scheme"}
      </s-button>

      {!schemeConfigured ? (
        <s-section heading="Get your savings scheme live">
          <s-stack direction="block" gap="large">
            <s-banner tone="info" heading="No savings scheme configured yet">
              <s-paragraph>
                Set up a monthly contribution plan, a bonus month, and an
                optional free gift to show a savings calculator on your
                storefront and start collecting customer enquiries.
              </s-paragraph>
            </s-banner>
            <s-stack direction="block" gap="small-200">
              <s-text type="strong">Three steps to launch:</s-text>
              <s-unordered-list>
                <s-list-item>
                  Choose a monthly contribution range and plan duration
                </s-list-item>
                <s-list-item>
                  Optionally configure a free gift to boost conversions
                </s-list-item>
                <s-list-item>
                  Add the Savings Scheme block to your product or any theme
                  page
                </s-list-item>
              </s-unordered-list>
            </s-stack>
            <s-button href="/app/savings-scheme">Set up scheme</s-button>
          </s-stack>
        </s-section>
      ) : (
        <>
          <s-section heading="Overview">
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-badge tone={schemeActive ? "success" : "warning"}>
                  {schemeActive ? "Live" : "Inactive"}
                </s-badge>
                <s-text color="subdued">
                  {schemeActive
                    ? "Your savings scheme calculator is live on the storefront."
                    : "Your scheme is configured but not active, so it will not appear on the storefront."}
                </s-text>
              </s-stack>

              <s-grid
                gridTemplateColumns="repeat(4, 1fr)"
                gap="base"
              >
                <s-box
                  padding="base"
                  borderWidth="small"
                  borderColor="subdued"
                  borderRadius="base"
                >
                  <s-stack direction="block" gap="small-200">
                    <s-text color="subdued">Total enquiries</s-text>
                    <s-text type="strong">{enquiryCount}</s-text>
                  </s-stack>
                </s-box>
                <s-box
                  padding="base"
                  borderWidth="small"
                  borderColor="subdued"
                  borderRadius="base"
                >
                  <s-stack direction="block" gap="small-200">
                    <s-text color="subdued">This week</s-text>
                    <s-text type="strong">{enquiriesThisWeek}</s-text>
                  </s-stack>
                </s-box>
                <s-box
                  padding="base"
                  borderWidth="small"
                  borderColor="subdued"
                  borderRadius="base"
                >
                  <s-stack direction="block" gap="small-200">
                    <s-text color="subdued">Avg. monthly amount</s-text>
                    <s-text type="strong">
                      {avgMonthlyAmount > 0
                        ? formatMoney(avgMonthlyAmount, currency)
                        : "—"}
                    </s-text>
                  </s-stack>
                </s-box>
                <s-box
                  padding="base"
                  borderWidth="small"
                  borderColor="subdued"
                  borderRadius="base"
                >
                  <s-stack direction="block" gap="small-200">
                    <s-text color="subdued">Pipeline value</s-text>
                    <s-text type="strong">
                      {pipelineValue > 0
                        ? formatMoney(pipelineValue, currency)
                        : "—"}
                    </s-text>
                  </s-stack>
                </s-box>
              </s-grid>
            </s-stack>
          </s-section>

          {scheme && (
            <s-section heading="Scheme configuration">
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-stack direction="block" gap="small-200">
                  <s-text color="subdued">Plan name</s-text>
                  <s-text type="strong">{scheme.name}</s-text>
                </s-stack>
                <s-stack direction="block" gap="small-200">
                  <s-text color="subdued">Monthly contribution range</s-text>
                  <s-text type="strong">
                    {formatMoney(scheme.minAmount, currency)} –{" "}
                    {formatMoney(scheme.maxAmount, currency)}
                  </s-text>
                </s-stack>
                <s-stack direction="block" gap="small-200">
                  <s-text color="subdued">Duration</s-text>
                  <s-text type="strong">
                    {scheme.durationMonths} paid month
                    {scheme.durationMonths === 1 ? "" : "s"}
                    {scheme.bonusEnabled
                      ? ` + ${scheme.bonusMonths} bonus (${scheme.totalMonths} total)`
                      : ""}
                  </s-text>
                </s-stack>
                <s-stack direction="block" gap="small-200">
                  <s-text color="subdued">Free gifts</s-text>
                  <s-text type="strong">
                    {scheme.giftCount === 0
                      ? "None configured"
                      : scheme.giftNames.length > 0
                        ? scheme.giftNames.join(", ")
                        : `${scheme.giftCount} configured`}
                  </s-text>
                </s-stack>
                <s-stack direction="block" gap="small-200">
                  <s-text color="subdued">Early redemption</s-text>
                  <s-text type="strong">
                    {scheme.earlyRedemptionEnabled ? "Enabled" : "Disabled"}
                  </s-text>
                </s-stack>
              </s-grid>
            </s-section>
          )}

          <s-section heading="Recent enquiries" padding="none">
            {recentEnquiries.length === 0 ? (
              <s-box padding="large">
                <s-paragraph color="subdued">
                  No enquiries yet. Once customers submit interest from the
                  storefront calculator, they will appear here.
                </s-paragraph>
              </s-box>
            ) : (
              <>
                <s-box padding="base">
                  <s-table>
                    <s-table-header-row>
                      <s-table-header listSlot="primary">Customer</s-table-header>
                      <s-table-header listSlot="secondary">Contact</s-table-header>
                      <s-table-header format="currency" listSlot="labeled">
                        Monthly amount
                      </s-table-header>
                      <s-table-header listSlot="labeled">Gift</s-table-header>
                      <s-table-header listSlot="labeled">Received</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                      {recentEnquiries.map((enquiry) => (
                        <s-table-row key={enquiry.id}>
                          <s-table-cell>
                            <s-text type="strong">{enquiry.customerName}</s-text>
                          </s-table-cell>
                          <s-table-cell>{enquiry.contact ?? "—"}</s-table-cell>
                          <s-table-cell>
                            {formatMoney(enquiry.monthlyAmount, currency)}
                          </s-table-cell>
                          <s-table-cell>
                            <s-badge tone={enquiry.giftEligible ? "success" : "neutral"}>
                              {enquiry.giftEligible ? "Eligible" : "No gift"}
                            </s-badge>
                          </s-table-cell>
                          <s-table-cell>
                            <s-text color="subdued">
                              {new Date(enquiry.createdAt).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                              })}
                            </s-text>
                          </s-table-cell>
                        </s-table-row>
                      ))}
                    </s-table-body>
                  </s-table>
                </s-box>
                <s-box padding="base" borderWidth="small" borderColor="subdued">
                  <s-button href="/app/savings-scheme/enquiries" variant="secondary">
                    View all {enquiryCount} enquir{enquiryCount === 1 ? "y" : "ies"}
                  </s-button>
                </s-box>
              </>
            )}
          </s-section>
        </>
      )}

      <s-section slot="aside" heading="Quick links">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app/savings-scheme">Scheme settings</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/savings-scheme/enquiries">
              Customer enquiries
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>

      {scheme && (
        <s-section slot="aside" heading="Storefront placement">
          <s-paragraph color="subdued">
            Add the Savings Scheme Widget block to any page from your theme
            editor's App blocks section. It works on any page, not just
            product pages.
          </s-paragraph>
        </s-section>
      )}
    </s-page>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
