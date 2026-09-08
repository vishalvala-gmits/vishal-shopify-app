import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";

export type ShopResolutionResult =
  | { ok: true; shop: string }
  | { ok: false; status: number; error: string };

const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export async function resolveShopFromRequest(request: Request): Promise<ShopResolutionResult> {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return { ok: false, status: 400, error: "Missing shop parameter." };
  }

  if (!SHOP_DOMAIN_PATTERN.test(shop)) {
    return { ok: false, status: 400, error: "Invalid shop parameter." };
  }

  const session = await prisma.session.findFirst({ where: { shop } });
  if (!session) {
    return { ok: false, status: 403, error: "Shop is not installed." };
  }

  return { ok: true, shop };
}

// No Access-Control-Allow-Origin here: used only before a shop/origin has been
// validated, so browsers reading the response cross-origin are denied by
// default (the request itself still succeeds server-side).
export const BASE_CORS_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
};

const SHOP_DOMAINS_QUERY = `#graphql
  query ShopDomainsForCors {
    shop {
      myshopifyDomain
      domains {
        host
      }
    }
  }
`;

type ShopDomainsResponse = {
  shop: {
    myshopifyDomain: string;
    domains: { host: string }[];
  };
};

type DomainsCacheEntry = {
  hosts: Set<string>;
  expiresAt: number;
};

const domainsCache = new Map<string, DomainsCacheEntry>();
const DOMAINS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Test-only escape hatch to avoid stale cache entries across unit tests. */
export function __clearDomainsCacheForTests(): void {
  domainsCache.clear();
}

async function getAllowedHostsForShop(shop: string): Promise<Set<string>> {
  const cached = domainsCache.get(shop);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.hosts;
  }

  const hosts = new Set<string>([shop]);

  try {
    const { admin } = await unauthenticated.admin(shop);
    const response = await admin.graphql(SHOP_DOMAINS_QUERY);
    const json = (await response.json()) as { data?: ShopDomainsResponse };

    const shopData = json.data?.shop;
    if (shopData) {
      hosts.add(shopData.myshopifyDomain);
      for (const domain of shopData.domains) {
        hosts.add(domain.host);
      }
    }
  } catch {
    // If the Admin API lookup fails, fall back to just the resolved shop's
    // own myshopify.com domain (already in `hosts`) rather than failing the
    // whole request — this only narrows the CORS allowlist, it never widens it.
  }

  domainsCache.set(shop, { hosts, expiresAt: Date.now() + DOMAINS_CACHE_TTL_MS });
  return hosts;
}

/**
 * Validates the request's actual browser `Origin` header against the shop's
 * real storefront domains (myshopify.com domain + any connected custom
 * domains), and returns CORS headers that reflect that exact origin back —
 * never a synthesized `https://<shop>` value, since a shop's live storefront
 * is very often served from a custom domain, not its myshopify.com domain.
 */
export async function buildCorsHeadersForOrigin(
  shop: string,
  request: Request,
): Promise<Record<string, string>> {
  const origin = request.headers.get("Origin");
  if (!origin) {
    return BASE_CORS_HEADERS;
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return BASE_CORS_HEADERS;
  }

  const allowedHosts = await getAllowedHostsForShop(shop);
  if (!allowedHosts.has(originHost)) {
    return BASE_CORS_HEADERS;
  }

  return {
    ...BASE_CORS_HEADERS,
    "Access-Control-Allow-Origin": origin,
  };
}
