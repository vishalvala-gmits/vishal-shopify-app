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

  const [scheme, enquiryCount, recentEnquiries] = await Promise.all([
    getSchemeForShop(session.shop),
    prisma.savingsEnquiry.count({ where: { shop: session.shop } }),
    prisma.savingsEnquiry.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        customerName: true,
        monthlyAmount: true,
        createdAt: true,
      },
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
    recentEnquiries: recentEnquiries.map((e) => ({
      id: e.id,
      customerName: e.customerName,
      monthlyAmount: e.monthlyAmount,
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
          giftCount: gifts.length,
          giftNames: gifts.map((g) => g.name).filter((n): n is string => Boolean(n)),
        }
      : null,
  };
};

export default function Index() {
  const { schemeConfigured, schemeActive, enquiryCount, recentEnquiries, scheme } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Savings Scheme">
      <s-button slot="primary-action" href="/app/savings-scheme">
        {schemeConfigured ? "Edit scheme" : "Set up scheme"}
      </s-button>

      <s-section heading="Overview">
        {!schemeConfigured ? (
          <s-banner tone="info" heading="No savings scheme configured yet">
            <s-paragraph>
              Set up a monthly premium plan, gift, and eligible products to show
              the savings calculator on your storefront.
            </s-paragraph>
          </s-banner>
        ) : !schemeActive ? (
          <s-banner tone="warning" heading="Scheme is not active">
            <s-paragraph>
              Your savings scheme is configured but not active, so it will not
              appear on the storefront.
            </s-paragraph>
          </s-banner>
        ) : (
          <s-banner tone="success" heading="Savings scheme is live">
            <s-paragraph>
              Your savings scheme calculator is live on the storefront.
            </s-paragraph>
          </s-banner>
        )}
      </s-section>

      {scheme && (
        <s-section heading="Scheme details">
          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-stack direction="block" gap="small-200">
                <s-text color="subdued">Plan name</s-text>
                <s-text type="strong">{scheme.name}</s-text>
              </s-stack>
              <s-stack direction="block" gap="small-200">
                <s-text color="subdued">Monthly contribution range</s-text>
                <s-text type="strong">
                  {formatMoney(scheme.minAmount, scheme.currencySymbol)} – {formatMoney(scheme.maxAmount, scheme.currencySymbol)}
                </s-text>
              </s-stack>
              <s-stack direction="block" gap="small-200">
                <s-text color="subdued">Duration</s-text>
                <s-text type="strong">
                  {scheme.durationMonths} paid month{scheme.durationMonths === 1 ? "" : "s"}
                  {scheme.bonusEnabled
                    ? ` + ${scheme.bonusMonths} bonus (${scheme.totalMonths} total)`
                    : ""}
                </s-text>
              </s-stack>
              <s-stack direction="block" gap="small-200">
                <s-text color="subdued">Gifts</s-text>
                <s-text type="strong">
                  {scheme.giftCount === 0
                    ? "None configured"
                    : scheme.giftNames.length > 0
                      ? scheme.giftNames.join(", ")
                      : `${scheme.giftCount} configured`}
                </s-text>
              </s-stack>
            </s-grid>
          </s-stack>
        </s-section>
      )}

      <s-section heading="Customer enquiries">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-paragraph>
              <s-text type="strong">{enquiryCount}</s-text> enquir
              {enquiryCount === 1 ? "y" : "ies"} received so far.
            </s-paragraph>
            <s-button href="/app/savings-scheme/enquiries" variant="secondary">
              View enquiries
            </s-button>
          </s-stack>

          {recentEnquiries.length > 0 && (
            <s-stack direction="block" gap="small-200">
              <s-text type="strong">Most recent</s-text>
              <s-stack direction="block" gap="none">
                {recentEnquiries.map((enquiry, index) => (
                  <s-stack direction="block" gap="none" key={enquiry.id}>
                    {index > 0 && <s-divider />}
                    <s-box padding="small-300">
                      <s-stack direction="inline" gap="base" alignItems="center">
                        <s-text>{enquiry.customerName}</s-text>
                        <s-text color="subdued">
                          {formatMoney(enquiry.monthlyAmount, scheme?.currencySymbol ?? "₹")}/mo
                        </s-text>
                        <s-text color="subdued">
                          {new Date(enquiry.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                          })}
                        </s-text>
                      </s-stack>
                    </s-box>
                  </s-stack>
                ))}
              </s-stack>
            </s-stack>
          )}
        </s-stack>
      </s-section>

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
