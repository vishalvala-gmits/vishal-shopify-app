import { describe, expect, it } from "vitest";
import { checkRateLimit, getClientIp } from "./rateLimit.server";

describe("checkRateLimit", () => {
  it("allows requests up to the limit within the window", () => {
    const key = `test-key-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000)).toBe(true);
    }
  });

  it("rejects requests beyond the limit within the window", () => {
    const key = `test-key-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, 5, 60_000);
    }
    expect(checkRateLimit(key, 5, 60_000)).toBe(false);
  });

  it("resets the count once the window has elapsed", () => {
    const key = `test-key-${Math.random()}`;
    expect(checkRateLimit(key, 1, 1)).toBe(true);
    expect(checkRateLimit(key, 1, 1)).toBe(false);
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(checkRateLimit(key, 1, 1)).toBe(true);
        resolve(undefined);
      }, 10);
    });
  });

  it("tracks separate keys independently", () => {
    const keyA = `test-key-a-${Math.random()}`;
    const keyB = `test-key-b-${Math.random()}`;
    expect(checkRateLimit(keyA, 1, 60_000)).toBe(true);
    expect(checkRateLimit(keyA, 1, 60_000)).toBe(false);
    expect(checkRateLimit(keyB, 1, 60_000)).toBe(true);
  });

  it("bypasses limiting when NODE_ENV is development", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const key = `test-key-dev-${Math.random()}`;
      for (let i = 0; i < 10; i++) {
        expect(checkRateLimit(key, 1, 60_000)).toBe(true);
      }
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});

describe("getClientIp", () => {
  it("reads the first entry of x-forwarded-for", () => {
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.5, 70.41.3.18" },
    });
    expect(getClientIp(request)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip", () => {
    const request = new Request("https://example.com", {
      headers: { "x-real-ip": "203.0.113.9" },
    });
    expect(getClientIp(request)).toBe("203.0.113.9");
  });

  it("falls back to unknown when no IP headers are present", () => {
    const request = new Request("https://example.com");
    expect(getClientIp(request)).toBe("unknown");
  });
});
