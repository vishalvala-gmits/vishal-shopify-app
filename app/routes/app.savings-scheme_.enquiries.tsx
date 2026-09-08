import { useCallback, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigate, useRouteError, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const PAGE_SIZE = 20;

type ProductInfo = {
  title: string;
  imageUrl?: string;
};

function formatMoney(amount: number, symbol: string): string {
  return `${symbol}${amount.toLocaleString("en-IN")}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const query = (url.searchParams.get("q") ?? "").trim();

  const where = {
    shop: session.shop,
    ...(query
      ? {
          OR: [
            { customerName: { contains: query } },
            { customerEmail: { contains: query } },
            { customerPhone: { contains: query } },
          ],
        }
      : {}),
  };

  const [enquiries, total, scheme] = await Promise.all([
    prisma.savingsEnquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.savingsEnquiry.count({ where }),
    prisma.savingsScheme.findFirst({
      where: { shop: session.shop },
      orderBy: { createdAt: "asc" },
      select: { currencySymbol: true },
    }),
  ]);

  const currencySymbol = scheme?.currencySymbol || "₹";

  const productIds = Array.from(new Set(enquiries.map((e) => e.shopifyProductId)));
  const productsById = new Map<string, ProductInfo>();

  if (productIds.length > 0) {
    try {
      const response = await admin.graphql(
        `#graphql
          query GetEnquiryProducts($ids: [ID!]!) {
            nodes(ids: $ids) {
              ... on Product {
                id
                title
                featuredImage {
                  url
                }
              }
            }
          }
        `,
        { variables: { ids: productIds } },
      );
      const json = await response.json();
      for (const node of json.data?.nodes ?? []) {
        if (node?.id) {
          productsById.set(node.id, {
            title: node.title,
            imageUrl: node.featuredImage?.url ?? undefined,
          });
        }
      }
    } catch (error) {
      console.error("Failed to load product info for enquiries:", error);
    }
  }

  return {
    enquiries: enquiries.map((enquiry) => ({
      ...enquiry,
      product: productsById.get(enquiry.shopifyProductId) ?? null,
    })),
    page,
    hasNextPage: page * PAGE_SIZE < total,
    total,
    currencySymbol,
    query,
  };
};

type ActionResult = { success: true } | { success: false; message: string };

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    const enquiryId = String(formData.get("enquiryId") ?? "");
    if (!enquiryId) {
      return { success: false, message: "Missing enquiry id." } satisfies ActionResult;
    }

    const result = await prisma.savingsEnquiry.deleteMany({
      where: { id: enquiryId, shop: session.shop },
    });

    if (result.count === 0) {
      return { success: false, message: "Enquiry not found." } satisfies ActionResult;
    }

    return { success: true } satisfies ActionResult;
  }

  return { success: false, message: "Unknown action." } satisfies ActionResult;
};

export default function SavingsSchemeEnquiries() {
  const { enquiries, page, hasNextPage, total, currencySymbol, query } =
    useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const deleteFetcher = useFetcher<ActionResult>();
  const [searchValue, setSearchValue] = useState(query);

  const goToPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(nextPage));
    navigate(`?${params.toString()}`);
  };

  const runSearch = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value.trim()) {
      params.set("q", value.trim());
    } else {
      params.delete("q");
    }
    params.set("page", "1");
    navigate(`?${params.toString()}`);
  };

  const handleDelete = (enquiryId: string) => {
    deleteFetcher.submit({ intent: "delete", enquiryId }, { method: "post" });
  };

  const searchFieldRef = useCallback(
    (node: Element | null) => {
      if (!node) return;
      const handler = (event: Event) => {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key === "Enter") {
          keyboardEvent.preventDefault();
          runSearch((node as HTMLInputElement).value ?? searchValue);
        }
      };
      node.addEventListener("keydown", handler);
      return () => node.removeEventListener("keydown", handler);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchValue],
  );

  return (
    <s-page heading="Savings Scheme Enquiries" inlineSize="large">
      <s-section padding="none">
        <s-box slot="filters" padding="small-200">
          <s-grid gridTemplateColumns="1fr auto" gap="small-200">
            <s-text-field
              ref={searchFieldRef}
              label="Search enquiries"
              labelAccessibilityVisibility="exclusive"
              icon="search"
              placeholder="Search by name, email, or phone"
              value={searchValue}
              onInput={(event: Event) => {
                const target = event.currentTarget as HTMLInputElement;
                setSearchValue(target.value);
              }}
            />
            <s-button variant="secondary" onClick={() => runSearch(searchValue)}>
              Search
            </s-button>
          </s-grid>
        </s-box>

        {enquiries.length === 0 ? (
          <s-box padding="large">
            <s-paragraph color="subdued">
              {query ? `No enquiries match "${query}".` : "No enquiries yet."}
            </s-paragraph>
          </s-box>
        ) : (
          <>
            <s-table
              hasPreviousPage={page > 1}
              hasNextPage={hasNextPage}
              onPreviousPage={() => goToPage(page - 1)}
              onNextPage={() => goToPage(page + 1)}
              paginate
            >
              <s-table-header-row>
                <s-table-header listSlot="primary">Customer</s-table-header>
                <s-table-header listSlot="secondary">Product</s-table-header>
                <s-table-header listSlot="labeled">Phone</s-table-header>
                <s-table-header listSlot="labeled">Email</s-table-header>
                <s-table-header format="currency" listSlot="labeled">
                  Monthly amount
                </s-table-header>
                <s-table-header format="numeric" listSlot="labeled">
                  Duration
                </s-table-header>
                <s-table-header format="currency" listSlot="labeled">
                  Contribution
                </s-table-header>
                <s-table-header format="currency" listSlot="labeled">
                  Benefit
                </s-table-header>
                <s-table-header listSlot="labeled">Gift eligibility</s-table-header>
                <s-table-header listSlot="labeled">Received</s-table-header>
                <s-table-header listSlot="labeled">Actions</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {enquiries.map((enquiry) => (
                  <s-table-row key={enquiry.id}>
                    <s-table-cell>
                      <s-text type="strong">{enquiry.customerName}</s-text>
                    </s-table-cell>
                    <s-table-cell>
                      <s-stack direction="inline" gap="small-200" alignItems="center">
                        <s-thumbnail
                          src={enquiry.product?.imageUrl}
                          alt={enquiry.product?.title ?? "Product"}
                          size="small-200"
                        />
                        <s-text>{enquiry.product?.title ?? "Unknown product"}</s-text>
                      </s-stack>
                    </s-table-cell>
                    <s-table-cell>{enquiry.customerPhone ?? "—"}</s-table-cell>
                    <s-table-cell>{enquiry.customerEmail ?? "—"}</s-table-cell>
                    <s-table-cell>{formatMoney(enquiry.monthlyAmount, currencySymbol)}</s-table-cell>
                    <s-table-cell>{enquiry.durationMonths} mo</s-table-cell>
                    <s-table-cell>{formatMoney(enquiry.totalContribution, currencySymbol)}</s-table-cell>
                    <s-table-cell>
                      <s-text type="strong">{formatMoney(enquiry.totalBenefit, currencySymbol)}</s-text>
                    </s-table-cell>
                    <s-table-cell>
                      {enquiry.giftName ? (
                        <s-stack direction="block" gap="small-200">
                          <s-badge tone={enquiry.giftEligible ? "success" : "warning"}>
                            {enquiry.giftEligible ? "Eligible" : "Not eligible"}
                          </s-badge>
                          <s-text color="subdued">
                            {enquiry.giftName}
                            {enquiry.giftValue ? ` (${formatMoney(enquiry.giftValue, currencySymbol)})` : ""}
                          </s-text>
                        </s-stack>
                      ) : (
                        <s-badge tone="neutral">No gift</s-badge>
                      )}
                    </s-table-cell>
                    <s-table-cell>
                      <s-text color="subdued">
                        {new Date(enquiry.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </s-text>
                    </s-table-cell>
                    <s-table-cell>
                      <s-button
                        variant="tertiary"
                        tone="critical"
                        icon="delete"
                        accessibilityLabel={`Delete enquiry from ${enquiry.customerName}`}
                        commandFor={`delete-modal-${enquiry.id}`}
                        command="--show"
                      />
                      <s-modal id={`delete-modal-${enquiry.id}`} heading="Delete enquiry?">
                        <s-stack direction="block" gap="base">
                          <s-text>
                            Are you sure you want to delete the enquiry from{" "}
                            <s-text type="strong">{enquiry.customerName}</s-text>? This action cannot be
                            undone.
                          </s-text>
                        </s-stack>
                        <s-button
                          slot="primary-action"
                          variant="primary"
                          tone="critical"
                          loading={
                            deleteFetcher.state !== "idle" &&
                            deleteFetcher.formData?.get("enquiryId") === enquiry.id
                          }
                          onClick={() => handleDelete(enquiry.id)}
                        >
                          Delete
                        </s-button>
                        <s-button
                          slot="secondary-actions"
                          commandFor={`delete-modal-${enquiry.id}`}
                          command="--hide"
                        >
                          Cancel
                        </s-button>
                      </s-modal>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
            <s-box padding="base" borderWidth="small" borderColor="subdued">
              <s-paragraph color="subdued">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} enquir
                {total === 1 ? "y" : "ies"}
              </s-paragraph>
            </s-box>
          </>
        )}
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
