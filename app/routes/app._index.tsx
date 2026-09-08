import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getSchemeForShop } from "../services/savingsScheme.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [scheme, enquiryCount] = await Promise.all([
    getSchemeForShop(session.shop),
    prisma.savingsEnquiry.count({ where: { shop: session.shop } }),
  ]);

  return {
    schemeConfigured: Boolean(scheme),
    schemeActive: scheme?.status === "active",
    assignedProductCount: scheme?.products.length ?? 0,
    enquiryCount,
  };
};

export default function Index() {
  const { schemeConfigured, schemeActive, assignedProductCount, enquiryCount } =
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
        ) : assignedProductCount === 0 ? (
          <s-banner tone="warning" heading="No products assigned">
            <s-paragraph>
              Your scheme is active, but no products are assigned. The
              storefront widget will not appear until at least one product is
              selected.
            </s-paragraph>
          </s-banner>
        ) : (
          <s-banner tone="success" heading="Savings scheme is live">
            <s-paragraph>
              Assigned to {assignedProductCount} product
              {assignedProductCount === 1 ? "" : "s"}.
            </s-paragraph>
          </s-banner>
        )}
      </s-section>

      <s-section heading="Customer enquiries">
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-paragraph>
            <s-text type="strong">{enquiryCount}</s-text> enquir
            {enquiryCount === 1 ? "y" : "ies"} received so far.
          </s-paragraph>
          <s-button href="/app/savings-scheme/enquiries" variant="secondary">
            View enquiries
          </s-button>
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
