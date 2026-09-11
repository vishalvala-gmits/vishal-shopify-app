import { useMemo, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getSchemeForShop, parseGifts } from "../services/savingsScheme.server";
import prisma from "../db.server";

function formatMoney(amount: number, symbol: string): string {
  return `${symbol}${amount.toLocaleString("en-IN")}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
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
    shop: session.shop,
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
          earlyRedemptionMinMonths: scheme.earlyRedemptionMinMonths,
          giftCount: gifts.length,
          giftNames: gifts.map((g) => g.name).filter((n): n is string => Boolean(n)),
        }
      : null,
  };
};

export default function Index() {
  const {
    shop,
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
  const themeEditorUrl = `https://${shop}/admin/themes/current/editor`;
  const editHref = "/app/savings-scheme";
  const enquiriesHref = "/app/savings-scheme/enquiries";

  const [search, setSearch] = useState("");
  const filteredEnquiries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recentEnquiries;
    return recentEnquiries.filter(
      (e) =>
        e.customerName.toLowerCase().includes(q) ||
        (e.contact ?? "").toLowerCase().includes(q),
    );
  }, [recentEnquiries, search]);

  return (
    <div className="jss-dash">
      <style>{DASH_CSS}</style>

      <div className="jss-dash-topbar">
        <h1 className="jss-dash-title">Savings Scheme</h1>
        <a className="jss-dash-btn jss-dash-btn-primary" href={editHref}>
          {schemeConfigured ? "Edit scheme" : "Set up scheme"}
        </a>
      </div>

      {!schemeConfigured ? (
        <div className="jss-dash-card">
          <div className="jss-dash-card-head">
            <h2>Get your savings scheme live</h2>
          </div>
          <div className="jss-dash-card-body jss-dash-stack">
            <div className="jss-dash-banner">
              <strong>No savings scheme configured yet.</strong>
              <p>
                Set up a monthly contribution plan, a bonus month, and an
                optional free gift to show a savings calculator on your
                storefront and start collecting customer enquiries.
              </p>
            </div>
            <div>
              <p className="jss-dash-strong-label">Three steps to launch:</p>
              <ul className="jss-dash-list">
                <li>Choose a monthly contribution range and plan duration</li>
                <li>Optionally configure a free gift to boost conversions</li>
                <li>
                  Add the Savings Scheme block to your product or any theme page
                </li>
              </ul>
            </div>
            <a className="jss-dash-btn jss-dash-btn-primary" href={editHref} style={{ alignSelf: "flex-start" }}>
              Set up scheme
            </a>
          </div>
        </div>
      ) : (
        <div className="jss-dash-grid">
          <section className="jss-dash-main">
            {/* Overview */}
            <div className="jss-dash-card">
              <div className="jss-dash-card-head">
                <div>
                  <h2>Overview</h2>
                  <div className="jss-dash-status-row">
                    <span className={`jss-dash-pill ${schemeActive ? "jss-dash-pill-success" : "jss-dash-pill-warning"}`}>
                      <span className="jss-dash-pill-dot" />
                      {schemeActive ? "Live" : "Inactive"}
                    </span>
                    <p className="jss-dash-muted">
                      {schemeActive
                        ? "Your savings scheme calculator is live on the storefront."
                        : "Your scheme is configured but not active, so it will not appear on the storefront."}
                    </p>
                  </div>
                </div>
              </div>
              <div className="jss-dash-card-body">
                <div className="jss-dash-stats">
                  <div className="jss-dash-stat">
                    <span className="jss-dash-stat-label">Total enquiries</span>
                    <div className="jss-dash-stat-value">{enquiryCount}</div>
                    <p className="jss-dash-stat-sub">All registered interest</p>
                  </div>
                  <div className="jss-dash-stat">
                    <span className="jss-dash-stat-label">
                      This week
                      <span className="jss-dash-dot-badge" />
                    </span>
                    <div className="jss-dash-stat-value">{enquiriesThisWeek}</div>
                    <p className="jss-dash-stat-sub">New leads past 7 days</p>
                  </div>
                  <div className="jss-dash-stat">
                    <span className="jss-dash-stat-label">Avg. monthly amount</span>
                    <div className="jss-dash-stat-value">
                      {avgMonthlyAmount > 0 ? formatMoney(avgMonthlyAmount, currency) : "—"}
                    </div>
                    <p className="jss-dash-stat-sub">Per customer pledge</p>
                  </div>
                  <div className="jss-dash-stat">
                    <span className="jss-dash-stat-label">Pipeline value</span>
                    <div className="jss-dash-stat-value">
                      {pipelineValue > 0 ? formatMoney(pipelineValue, currency) : "—"}
                    </div>
                    <p className="jss-dash-stat-sub">Cumulative contribution value</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Scheme configuration */}
            {scheme && (
              <div className="jss-dash-card jss-dash-card-watermark">
                <div className="jss-dash-card-head">
                  <div>
                    <h2>Scheme configuration</h2>
                    <p className="jss-dash-muted-sm">
                      Core rules active for visitor calculation &amp; enrollment
                    </p>
                  </div>
                  <a className="jss-dash-link-gold" href={editHref}>
                    Edit configuration <span aria-hidden="true">&rsaquo;</span>
                  </a>
                </div>
                <div className="jss-dash-card-body">
                  <div className="jss-dash-config-grid">
                    <div className="jss-dash-config-item">
                      <span className="jss-dash-config-label">Plan name</span>
                      <div className="jss-dash-config-value">{scheme.name}</div>
                    </div>
                    <div className="jss-dash-config-item">
                      <span className="jss-dash-config-label">Monthly contribution range</span>
                      <div className="jss-dash-config-value jss-dash-mono">
                        {formatMoney(scheme.minAmount, currency)} – {formatMoney(scheme.maxAmount, currency)}
                      </div>
                    </div>
                    <div className="jss-dash-config-item">
                      <span className="jss-dash-config-label">Duration</span>
                      <div className="jss-dash-config-value jss-dash-inline">
                        <span className="jss-dash-mini-dot" />
                        {scheme.durationMonths} paid month{scheme.durationMonths === 1 ? "" : "s"}
                        {scheme.bonusEnabled ? ` + ${scheme.bonusMonths} bonus (${scheme.totalMonths} total)` : ""}
                      </div>
                    </div>
                    <div className="jss-dash-config-item">
                      <span className="jss-dash-config-label">Free gifts</span>
                      <div className="jss-dash-config-value">
                        {scheme.giftCount === 0
                          ? "None configured"
                          : scheme.giftNames.length > 0
                            ? scheme.giftNames.join(", ")
                            : `${scheme.giftCount} configured`}
                      </div>
                    </div>
                    <div className="jss-dash-config-item jss-dash-config-item-full">
                      <span className="jss-dash-config-label">Early redemption</span>
                      <div className="jss-dash-config-value jss-dash-inline">
                        <span className={`jss-dash-badge ${scheme.earlyRedemptionEnabled ? "jss-dash-badge-success" : "jss-dash-badge-neutral"}`}>
                          {scheme.earlyRedemptionEnabled ? "Enabled" : "Disabled"}
                        </span>
                        {scheme.earlyRedemptionEnabled && (
                          <span className="jss-dash-muted-sm">
                            Customers may redeem early with no penalty starting after month {scheme.earlyRedemptionMinMonths}.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Recent enquiries */}
            <div className="jss-dash-card jss-dash-card-flush">
              <div className="jss-dash-card-head jss-dash-card-head-row">
                <div>
                  <h2>Recent enquiries</h2>
                  <p className="jss-dash-muted-sm">
                    Prospects who simulated or submitted their savings plan
                  </p>
                </div>
                <div className="jss-dash-search-wrap">
                  <input
                    className="jss-dash-search"
                    type="text"
                    placeholder="Search customer..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              {recentEnquiries.length === 0 ? (
                <div className="jss-dash-empty">
                  No enquiries yet. Once customers submit interest from the
                  storefront calculator, they will appear here.
                </div>
              ) : filteredEnquiries.length === 0 ? (
                <div className="jss-dash-empty">No enquiries match &quot;{search}&quot;.</div>
              ) : (
                <>
                  <div className="jss-dash-table-wrap">
                    <table className="jss-dash-table">
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Contact</th>
                          <th className="jss-dash-right">Monthly amount</th>
                          <th className="jss-dash-center">Gift</th>
                          <th className="jss-dash-right">Received</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEnquiries.map((enquiry) => (
                          <tr key={enquiry.id}>
                            <td>
                              <div className="jss-dash-customer">
                                <span className="jss-dash-avatar">{initials(enquiry.customerName)}</span>
                                <span className="jss-dash-customer-name">{enquiry.customerName}</span>
                              </div>
                            </td>
                            <td className="jss-dash-mono jss-dash-muted-cell">
                              {enquiry.contact ? (
                                <a className="jss-dash-tel" href={`tel:${enquiry.contact}`}>
                                  {enquiry.contact}
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="jss-dash-right jss-dash-mono jss-dash-strong-cell">
                              {formatMoney(enquiry.monthlyAmount, currency)}
                            </td>
                            <td className="jss-dash-center">
                              <span className={`jss-dash-badge ${enquiry.giftEligible ? "jss-dash-badge-success" : "jss-dash-badge-neutral"}`}>
                                {enquiry.giftEligible ? "Eligible" : "No gift"}
                              </span>
                            </td>
                            <td className="jss-dash-right jss-dash-muted-cell">
                              {new Date(enquiry.createdAt).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="jss-dash-table-footer">
                    <a className="jss-dash-btn jss-dash-btn-outline" href={enquiriesHref}>
                      View all {enquiryCount} enquir{enquiryCount === 1 ? "y" : "ies"}
                    </a>
                    <span className="jss-dash-muted-sm">
                      Showing {filteredEnquiries.length} of {enquiryCount} entries
                    </span>
                  </div>
                </>
              )}
            </div>
          </section>

          <aside className="jss-dash-aside">
            <div className="jss-dash-card">
              <div className="jss-dash-card-head">
                <h2>Quick links</h2>
              </div>
              <div className="jss-dash-card-body">
                <ul className="jss-dash-quicklinks">
                  <li>
                    <a href={editHref}>
                      <span className="jss-dash-mini-dot" />
                      Scheme settings
                      <span className="jss-dash-chev" aria-hidden="true">&rsaquo;</span>
                    </a>
                  </li>
                  <li>
                    <a href={enquiriesHref}>
                      <span className="jss-dash-mini-dot" />
                      Customer enquiries
                      <span className="jss-dash-count">{enquiryCount}</span>
                      <span className="jss-dash-chev" aria-hidden="true">&rsaquo;</span>
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            {scheme && (
              <div className="jss-dash-card jss-dash-card-accent">
                <div className="jss-dash-card-head">
                  <h2>Storefront placement</h2>
                  <span className="jss-dash-tag">App Block</span>
                </div>
                <div className="jss-dash-card-body">
                  <p className="jss-dash-muted-sm">
                    Add the <strong>Savings Scheme Widget</strong> block to any
                    page from your theme editor&apos;s App blocks section. It
                    works on any page, not just product pages.
                  </p>
                  <a
                    className="jss-dash-btn jss-dash-btn-outline jss-dash-btn-block"
                    href={themeEditorUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open theme editor
                  </a>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

const DASH_CSS = `
.jss-dash {
  --gold: #C5A059;
  --gold-hover: #B28F47;
  --gold-light: #F7F3EB;
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
  // max-width: 1280px;
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
.jss-dash-btn-primary {
  background: var(--dark);
  color: #fff;
  border-color: rgba(197, 160, 89, 0.3);
}
.jss-dash-btn-primary:hover { background: #2C2724; }
.jss-dash-btn-outline {
  background: #fff;
  color: var(--dark);
  border-color: var(--border);
  box-shadow: 0 1px 2px 0 rgba(28, 25, 23, 0.03);
}
.jss-dash-btn-outline:hover { background: #FAFAF9; border-color: #A8A29E; }
.jss-dash-btn-block { width: 100%; justify-content: center; }

.jss-dash-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 24px;
  align-items: start;
}
@media (max-width: 900px) {
  .jss-dash-grid { grid-template-columns: 1fr; }
}
.jss-dash-main, .jss-dash-aside {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.jss-dash-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 4px 20px -2px rgba(28, 25, 23, 0.04), 0 1px 3px 0 rgba(28, 25, 23, 0.02);
  position: relative;
  overflow: hidden;
}
.jss-dash-card-flush .jss-dash-card-head { padding: 20px 24px 16px; }
.jss-dash-card-head {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-muted);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.jss-dash-card-head h2 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
}
.jss-dash-card-body { padding: 20px 24px; }
.jss-dash-card-watermark::after {
  content: "";
}

.jss-dash-status-row {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.jss-dash-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
}
.jss-dash-pill-success { background: var(--emerald-soft); color: var(--emerald-text); border: 1px solid var(--emerald-border); }
.jss-dash-pill-warning { background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; }
.jss-dash-pill-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.jss-dash-muted { font-size: 13px; color: var(--muted); margin: 0; }
.jss-dash-muted-sm { font-size: 12px; color: var(--muted); margin: 2px 0 0; }

.jss-dash-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
@media (max-width: 640px) {
  .jss-dash-stats { grid-template-columns: repeat(2, 1fr); }
}
.jss-dash-stat {
  padding: 14px;
  border-radius: 8px;
  border: 1px solid var(--border-muted);
  background: rgba(251, 251, 249, 0.7);
  transition: all 0.15s ease;
}
.jss-dash-stat-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: space-between;
}
.jss-dash-dot-badge { width: 8px; height: 8px; border-radius: 50%; background: var(--gold); }
.jss-dash-stat-value {
  margin-top: 8px;
  font-size: 22px;
  font-weight: 700;
  font-family: "JetBrains Mono", Menlo, monospace;
  letter-spacing: -0.02em;
}
.jss-dash-stat-sub { margin: 4px 0 0; font-size: 11px; color: #A8A29E; }

.jss-dash-link-gold {
  font-size: 12px;
  font-weight: 500;
  color: var(--gold);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.jss-dash-link-gold:hover { color: var(--gold-hover); }

.jss-dash-config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px 32px;
  font-size: 14px;
}
@media (max-width: 640px) {
  .jss-dash-config-grid { grid-template-columns: 1fr; }
}
.jss-dash-config-item { display: flex; flex-direction: column; gap: 4px; }
.jss-dash-config-item-full {
  grid-column: 1 / -1;
  padding-top: 12px;
  border-top: 1px solid var(--border-muted);
}
.jss-dash-config-label {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #A8A29E;
}
.jss-dash-config-value { font-size: 14px; font-weight: 600; color: #1C1917; }
.jss-dash-mono { font-family: "JetBrains Mono", Menlo, monospace; }
.jss-dash-inline { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-weight: 500; }
.jss-dash-mini-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--gold); flex-shrink: 0; }

.jss-dash-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 500;
}
.jss-dash-badge-success { background: var(--emerald-soft); color: var(--emerald-text); border: 1px solid var(--emerald-border); }
.jss-dash-badge-neutral { background: #F5F5F4; color: #57534E; border: 1px solid #E7E5E4; }

.jss-dash-card-head-row { align-items: center; }
.jss-dash-search-wrap { display: flex; }
.jss-dash-search {
  width: 200px;
  font-size: 12px;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #FAFAF9;
  color: #1C1917;
  outline: none;
}
.jss-dash-search:focus { background: #fff; border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }

.jss-dash-empty { padding: 32px 24px; font-size: 13px; color: var(--muted); text-align: center; }

.jss-dash-table-wrap { overflow-x: auto; }
.jss-dash-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
.jss-dash-table thead tr {
  background: #FDFDFB;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.jss-dash-table th {
  padding: 10px 20px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.jss-dash-table td { padding: 12px 20px; border-bottom: 1px solid var(--border-muted); }
.jss-dash-table tbody tr:hover { background: rgba(251, 251, 249, 0.8); }
.jss-dash-table tbody tr:last-child td { border-bottom: none; }
.jss-dash-right { text-align: right; }
.jss-dash-center { text-align: center; }
.jss-dash-strong-cell { font-weight: 600; color: #1C1917; }
.jss-dash-muted-cell { color: #57534E; }

.jss-dash-customer { display: flex; align-items: center; gap: 10px; }
.jss-dash-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #F5F5F4;
  color: #44403C;
  border: 1px solid #E7E5E4;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.jss-dash-customer-name { font-weight: 500; color: #1C1917; }
.jss-dash-tel { color: inherit; text-decoration: none; }
.jss-dash-tel:hover { color: var(--gold); text-decoration: underline; }

.jss-dash-table-footer {
  padding: 14px 20px;
  background: #FDFDFB;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.jss-dash-quicklinks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.jss-dash-quicklinks a {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  color: #44403C;
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s ease;
}
.jss-dash-quicklinks a:hover { background: #FAFAF9; border-color: var(--border); color: #0C0A09; }
.jss-dash-count {
  margin-left: auto;
  background: #F5F5F4;
  color: #57534E;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  font-family: "JetBrains Mono", Menlo, monospace;
}
.jss-dash-chev { margin-left: auto; color: #A8A29E; }
.jss-dash-quicklinks a:has(.jss-dash-count) .jss-dash-chev { margin-left: 0; }

.jss-dash-card-accent { background: linear-gradient(to bottom right, #fff, #FDFBF7); }
.jss-dash-card-accent::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(to right, rgba(197,160,89,0.8), #FCD34D, rgba(197,160,89,0.8));
}
.jss-dash-tag {
  font-size: 10px;
  font-family: "JetBrains Mono", Menlo, monospace;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--gold);
  font-weight: 700;
}

.jss-dash-banner {
  background: #EFF6FF;
  border: 1px solid #BFDBFE;
  border-radius: 8px;
  padding: 14px 16px;
  font-size: 13px;
  color: #1E3A8A;
}
.jss-dash-banner p { margin: 6px 0 0; color: #1E40AF; }
.jss-dash-strong-label { font-size: 13px; font-weight: 600; margin: 0 0 8px; }
.jss-dash-list { margin: 0; padding-left: 18px; font-size: 13px; color: #44403C; display: flex; flex-direction: column; gap: 4px; }
.jss-dash-stack { display: flex; flex-direction: column; gap: 16px; }
`;


// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
