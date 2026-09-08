import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db.server", () => ({
  default: {
    session: {
      findFirst: vi.fn(),
    },
  },
}));

const unauthenticatedAdminMock = vi.fn();

vi.mock("../shopify.server", () => ({
  unauthenticated: {
    admin: (...args: unknown[]) => unauthenticatedAdminMock(...args),
  },
}));

import prisma from "../db.server";
import {
  __clearDomainsCacheForTests,
  buildCorsHeadersForOrigin,
  resolveShopFromRequest,
} from "./resolveShop.server";

const findFirstMock = prisma.session.findFirst as unknown as ReturnType<typeof vi.fn>;

describe("resolveShopFromRequest", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
  });

  it("rejects when the shop parameter is missing", async () => {
    const request = new Request("https://app.example.com/api/storefront/savings-scheme");
    const result = await resolveShopFromRequest(request);
    expect(result).toEqual({ ok: false, status: 400, error: "Missing shop parameter." });
  });

  it("rejects a malformed shop domain", async () => {
    const request = new Request("https://app.example.com/api?shop=not-a-shop");
    const result = await resolveShopFromRequest(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });

  it("rejects a well-formed shop with no installed session", async () => {
    findFirstMock.mockResolvedValue(null);
    const request = new Request("https://app.example.com/api?shop=my-store.myshopify.com");
    const result = await resolveShopFromRequest(request);
    expect(result).toEqual({ ok: false, status: 403, error: "Shop is not installed." });
  });

  it("accepts a well-formed shop with an installed session", async () => {
    findFirstMock.mockResolvedValue({ id: "session1", shop: "my-store.myshopify.com" });
    const request = new Request("https://app.example.com/api?shop=my-store.myshopify.com");
    const result = await resolveShopFromRequest(request);
    expect(result).toEqual({ ok: true, shop: "my-store.myshopify.com" });
  });
});

describe("buildCorsHeadersForOrigin", () => {
  beforeEach(() => {
    unauthenticatedAdminMock.mockReset();
    __clearDomainsCacheForTests();
  });

  function mockShopDomains(myshopifyDomain: string, domainHosts: string[]) {
    unauthenticatedAdminMock.mockResolvedValue({
      admin: {
        graphql: vi.fn().mockResolvedValue({
          json: async () => ({
            data: {
              shop: {
                myshopifyDomain,
                domains: domainHosts.map((host) => ({ host })),
              },
            },
          }),
        }),
      },
    });
  }

  it("returns no Access-Control-Allow-Origin when the request has no Origin header", async () => {
    const request = new Request("https://app.example.com/api?shop=my-store.myshopify.com");
    const headers = await buildCorsHeadersForOrigin("my-store.myshopify.com", request);
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("allows the shop's own myshopify.com origin", async () => {
    mockShopDomains("my-store.myshopify.com", []);
    const request = new Request("https://app.example.com/api?shop=my-store.myshopify.com", {
      headers: { Origin: "https://my-store.myshopify.com" },
    });
    const headers = await buildCorsHeadersForOrigin("my-store.myshopify.com", request);
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://my-store.myshopify.com");
  });

  it("allows a connected custom storefront domain", async () => {
    mockShopDomains("my-store.myshopify.com", ["www.example.com", "my-store.myshopify.com"]);
    const request = new Request("https://app.example.com/api?shop=my-store.myshopify.com", {
      headers: { Origin: "https://www.example.com" },
    });
    const headers = await buildCorsHeadersForOrigin("my-store.myshopify.com", request);
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://www.example.com");
  });

  it("rejects an origin that does not belong to the resolved shop", async () => {
    mockShopDomains("my-store.myshopify.com", ["www.example.com"]);
    const request = new Request("https://app.example.com/api?shop=my-store.myshopify.com", {
      headers: { Origin: "https://attacker.example.com" },
    });
    const headers = await buildCorsHeadersForOrigin("my-store.myshopify.com", request);
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("falls back to the shop's myshopify.com domain if the Admin API lookup fails", async () => {
    unauthenticatedAdminMock.mockRejectedValue(new Error("network error"));
    const request = new Request("https://app.example.com/api?shop=my-store.myshopify.com", {
      headers: { Origin: "https://my-store.myshopify.com" },
    });
    const headers = await buildCorsHeadersForOrigin("my-store.myshopify.com", request);
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://my-store.myshopify.com");
  });
});
