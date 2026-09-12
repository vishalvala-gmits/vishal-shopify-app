import { useCallback, useEffect, useRef, useState } from "react";
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

  const productIds = Array.from(
    new Set(
      enquiries
        .map((e) => e.shopifyProductId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
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
      product: enquiry.shopifyProductId
        ? (productsById.get(enquiry.shopifyProductId) ?? null)
        : null,
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const goToPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(nextPage));
    navigate(`?${params.toString()}`);
  };

  const runSearch = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams);
      if (value.trim()) {
        params.set("q", value.trim());
      } else {
        params.delete("q");
      }
      params.set("page", "1");
      navigate(`?${params.toString()}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams],
  );

  const handleDelete = (enquiryId: string) => {
    deleteFetcher.submit({ intent: "delete", enquiryId }, { method: "post" });
    setConfirmDeleteId(null);
  };

  // Auto-search as the merchant types, debounced so we don't fire a
  // navigation/loader round-trip on every keystroke - only once typing
  // pauses for 400ms. Skips the initial mount so it doesn't immediately
  // re-navigate to the URL's own current query on page load.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      runSearch(searchValue);
    }, 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runSearch(searchValue);
      }
    },
    [runSearch, searchValue],
  );

  const confirmTarget = enquiries.find((e) => e.id === confirmDeleteId) ?? null;

  return (
    <div className="jss-dash">
      <style>{ENQ_CSS}</style>

      <div className="jss-dash-topbar">
        <h1 className="jss-dash-title">Savings Scheme Enquiries</h1>
      </div>

      <div className="jss-dash-card jss-dash-card-flush">
        <div className="jss-dash-card-head jss-dash-card-head-row">
          <div className="jss-dash-search-wrap">
            <input
              className="jss-dash-search"
              type="text"
              placeholder="Search by name, email, or phone"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </div>
          <button
            type="button"
            className="jss-dash-btn jss-dash-btn-outline"
            onClick={() => runSearch(searchValue)}
          >
            Search
          </button>
        </div>

        {enquiries.length === 0 ? (
          <div className="jss-dash-empty">
            {query ? `No enquiries match "${query}".` : "No enquiries yet."}
          </div>
        ) : (
          <>
            <div className="jss-dash-table-wrap">
              <table className="jss-dash-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Product</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th className="jss-dash-right">Monthly amount / Duration</th>
                    <th className="jss-dash-right">Contribution / Benefit</th>
                    <th>Gift eligibility</th>
                    <th className="jss-dash-right">Received</th>
                    <th className="jss-dash-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {enquiries.map((enquiry) => (
                    <tr key={enquiry.id}>
                      <td className="jss-dash-strong-cell">{enquiry.customerName}</td>
                      <td>
                        {enquiry.shopifyProductId ? (
                          <div className="jss-dash-customer">
                            {enquiry.product?.imageUrl ? (
                              <img
                                className="jss-dash-thumb"
                                src={enquiry.product.imageUrl}
                                alt={enquiry.product?.title ?? "Product"}
                              />
                            ) : (
                              <span className="jss-dash-thumb jss-dash-thumb-empty" />
                            )}
                            <span>{enquiry.product?.title ?? "Unknown product"}</span>
                          </div>
                        ) : (
                          <span className="jss-dash-muted-cell">—</span>
                        )}
                      </td>
                      <td className="jss-dash-muted-cell">{enquiry.customerPhone ?? "—"}</td>
                      <td className="jss-dash-muted-cell">{enquiry.customerEmail ?? "—"}</td>
                      <td className="jss-dash-right jss-dash-mono">
                        <div className="jss-dash-stack-tight jss-dash-stack-right">
                          <span>{formatMoney(enquiry.monthlyAmount, currencySymbol)}</span>
                          <span className="jss-dash-muted-cell">{enquiry.durationMonths} mo</span>
                        </div>
                      </td>
                      <td className="jss-dash-right jss-dash-mono">
                        <div className="jss-dash-stack-tight jss-dash-stack-right">
                          <span>{formatMoney(enquiry.totalContribution, currencySymbol)}</span>
                          <span className="jss-dash-strong-cell">{formatMoney(enquiry.totalBenefit, currencySymbol)}</span>
                        </div>
                      </td>
                      <td>
                        {enquiry.giftName ? (
                          <div className="jss-dash-stack-tight">
                            <span
                              className={`jss-dash-badge ${enquiry.giftEligible ? "jss-dash-badge-success" : "jss-dash-badge-warning"}`}
                            >
                              {enquiry.giftEligible ? "Eligible" : "Not eligible"}
                            </span>
                            <span className="jss-dash-muted-sm">
                              {enquiry.giftName}
                              {enquiry.giftValue
                                ? ` (${formatMoney(enquiry.giftValue, currencySymbol)})`
                                : ""}
                            </span>
                          </div>
                        ) : (
                          <span className="jss-dash-badge jss-dash-badge-neutral">No gift</span>
                        )}
                      </td>
                      <td className="jss-dash-right jss-dash-muted-cell">
                        {new Date(enquiry.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="jss-dash-center">
                        <button
                          type="button"
                          className="jss-dash-icon-btn"
                          aria-label={`Delete enquiry from ${enquiry.customerName}`}
                          onClick={() => setConfirmDeleteId(enquiry.id)}
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="jss-dash-table-footer">
              <span className="jss-dash-muted-sm">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}{" "}
                enquir{total === 1 ? "y" : "ies"}
              </span>
              <div className="jss-dash-pagination">
                <button
                  type="button"
                  className="jss-dash-btn jss-dash-btn-outline"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="jss-dash-btn jss-dash-btn-outline"
                  disabled={!hasNextPage}
                  onClick={() => goToPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {confirmTarget && (
        <div
          className="jss-dash-modal-backdrop"
          role="presentation"
          onClick={(event) => {
            // Only dismiss when the backdrop itself was clicked, not a click
            // that bubbled up from inside the dialog - so the dialog content
            // never needs its own click handler just to stop propagation.
            if (event.target === event.currentTarget) {
              setConfirmDeleteId(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setConfirmDeleteId(null);
            }
          }}
        >
          <div className="jss-dash-modal" role="dialog" aria-modal="true" aria-labelledby="jss-delete-modal-heading">
            <h2 id="jss-delete-modal-heading">Delete enquiry?</h2>
            <p>
              Are you sure you want to delete the enquiry from{" "}
              <strong>{confirmTarget.customerName}</strong>? This action cannot be undone.
            </p>
            <div className="jss-dash-modal-actions">
              <button
                type="button"
                className="jss-dash-btn jss-dash-btn-outline"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="jss-dash-btn jss-dash-btn-danger"
                disabled={
                  deleteFetcher.state !== "idle" &&
                  deleteFetcher.formData?.get("enquiryId") === confirmTarget.id
                }
                onClick={() => handleDelete(confirmTarget.id)}
              >
                {deleteFetcher.state !== "idle" &&
                deleteFetcher.formData?.get("enquiryId") === confirmTarget.id
                  ? "Deleting…"
                  : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const ENQ_CSS = `
.jss-dash {
  --gold: #C5A059;
  --gold-hover: #B28F47;
  --dark: #1C1917;
  --surface: #FFFFFF;
  --canvas: #FBFBF9;
  --border: #EAE6DF;
  --border-muted: #F1EFEA;
  --muted: #78716C;
  --emerald-soft: #ECFDF5;
  --emerald-text: #065F46;
  --emerald-border: #A7F3D0;
  font-family: "Plus Jakarta Sans", Inter, system-ui, -apple-system, sans-serif;
  color: var(--dark);
  background: var(--canvas);
  padding: 32px clamp(16px, 4vw, 48px) 48px;
  max-width: 1280px;
  margin: 0 auto;
}
.jss-dash * { box-sizing: border-box; }
.jss-dash-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.jss-dash-title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
}
.jss-dash-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  text-decoration: none;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}
.jss-dash-btn-outline {
  background: #fff;
  color: var(--dark);
  border-color: var(--border);
  box-shadow: 0 1px 2px 0 rgba(28, 25, 23, 0.03);
}
.jss-dash-btn-outline:hover { background: #FAFAF9; border-color: #A8A29E; }
.jss-dash-btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }
.jss-dash-btn-danger {
  background: #DC2626;
  color: #fff;
  border-color: #DC2626;
}
.jss-dash-btn-danger:hover { background: #B91C1C; }
.jss-dash-btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }

.jss-dash-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 4px 20px -2px rgba(28, 25, 23, 0.04), 0 1px 3px 0 rgba(28, 25, 23, 0.02);
  overflow: hidden;
}
.jss-dash-card-flush .jss-dash-card-head { padding: 16px 24px; }
.jss-dash-card-head {
  border-bottom: 1px solid var(--border-muted);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.jss-dash-card-head-row { align-items: center; }

.jss-dash-search-wrap { display: flex; flex: 1; min-width: 220px; }
.jss-dash-search {
  width: 100%;
  font-size: 13px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #FAFAF9;
  color: #1C1917;
  outline: none;
}
.jss-dash-search:focus { background: #fff; border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }

.jss-dash-empty { padding: 32px 24px; font-size: 13px; color: var(--muted); text-align: center; }

.jss-dash-table-wrap { overflow-x: auto; }
.jss-dash-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; white-space: nowrap; }
.jss-dash-table thead tr {
  background: #FDFDFB;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.jss-dash-table th {
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.jss-dash-table td { padding: 12px 16px; border-bottom: 1px solid var(--border-muted); }
.jss-dash-table tbody tr:hover { background: rgba(251, 251, 249, 0.8); }
.jss-dash-table tbody tr:last-child td { border-bottom: none; }
.jss-dash-right { text-align: right; }
.jss-dash-center { text-align: center; }
.jss-dash-mono { font-family: "JetBrains Mono", Menlo, monospace; }
.jss-dash-strong-cell { font-weight: 600; color: #1C1917; }
.jss-dash-muted-cell { color: #57534E; }
.jss-dash-muted-sm { font-size: 12px; color: var(--muted); }
.jss-dash-stack-tight { display: flex; flex-direction: column; gap: 4px; }
.jss-dash-stack-right { align-items: flex-end; }

.jss-dash-customer { display: flex; align-items: center; gap: 10px; white-space: normal; }
.jss-dash-thumb {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid var(--border);
  flex-shrink: 0;
}
.jss-dash-thumb-empty { background: #F5F5F4; }

.jss-dash-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}
.jss-dash-badge-success { background: var(--emerald-soft); color: var(--emerald-text); border: 1px solid var(--emerald-border); }
.jss-dash-badge-warning { background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; }
.jss-dash-badge-neutral { background: #F5F5F4; color: #57534E; border: 1px solid #E7E5E4; }

.jss-dash-icon-btn {
  border: 1px solid var(--border);
  background: #fff;
  color: #78716C;
  border-radius: 6px;
  width: 30px;
  height: 30px;
  cursor: pointer;
  font-size: 13px;
}
.jss-dash-icon-btn:hover { background: #FEF2F2; border-color: #FCA5A5; color: #DC2626; }

.jss-dash-table-footer {
  padding: 14px 24px;
  background: #FDFDFB;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.jss-dash-pagination { display: flex; gap: 8px; }

.jss-dash-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(28, 25, 23, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.jss-dash-modal {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  max-width: 420px;
  width: 100%;
  box-shadow: 0 20px 45px -10px rgba(28, 25, 23, 0.25);
}
.jss-dash-modal h2 { margin: 0 0 10px; font-size: 16px; font-weight: 600; }
.jss-dash-modal p { margin: 0 0 20px; font-size: 13px; color: #44403C; line-height: 1.5; }
.jss-dash-modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
`;
