import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_AMOUNT,
  DEFAULT_MIN_AMOUNT,
  DEFAULT_PRESET_AMOUNTS,
  TERMS_TEXT_PREFIX,
  buildDefaultTermsText,
  parseGifts,
  resolveSchemeDefaults,
  shopNameFromDomain,
  stripTermsTextPrefix,
} from "./savingsScheme.server";
import type { SchemeWithProducts } from "./savingsScheme.server";

describe("resolveSchemeDefaults", () => {
  it("gives a brand-new scheme the default min, max, and presets", () => {
    const result = resolveSchemeDefaults({
      existing: null,
      shopDisplayName: "Lucira Jewelry",
      submitted: {},
    });
    expect(result.minAmount).toBe(DEFAULT_MIN_AMOUNT);
    expect(result.maxAmount).toBe(DEFAULT_MAX_AMOUNT);
    expect(result.presetAmounts).toEqual(DEFAULT_PRESET_AMOUNTS);
  });

  it("gives a brand-new scheme terms text built from the shop name", () => {
    const result = resolveSchemeDefaults({
      existing: null,
      shopDisplayName: "Lucira Jewelry",
      submitted: {},
    });
    expect(result.termsText).toBe("I agree to Terms & Conditions of Lucira Jewelry");
  });

  it("uses the merchant-submitted values over defaults when provided", () => {
    const result = resolveSchemeDefaults({
      existing: null,
      shopDisplayName: "Lucira Jewelry",
      submitted: {
        minAmount: 2000,
        maxAmount: 19000,
        presetAmounts: [3000, 5000],
        termsText: "Custom terms",
      },
    });
    expect(result).toEqual({
      minAmount: 2000,
      maxAmount: 19000,
      presetAmounts: [3000, 5000],
      termsText: "Custom terms",
    });
  });

  it("preserves an existing scheme's values instead of applying defaults", () => {
    const existing = {
      minAmount: 2000,
      maxAmount: 19000,
      presetAmounts: [3000, 5000, 10000, 19000],
      termsText: "Existing custom terms",
    } as SchemeWithProducts;

    const result = resolveSchemeDefaults({
      existing,
      shopDisplayName: "Lucira Jewelry",
      submitted: {},
    });

    expect(result.minAmount).toBe(2000);
    expect(result.maxAmount).toBe(19000);
    expect(result.presetAmounts).toEqual([3000, 5000, 10000, 19000]);
    expect(result.termsText).toBe("Existing custom terms");
  });

  it("only fills the missing nullable field (termsText) without touching other existing values", () => {
    const existing = {
      minAmount: 2000,
      maxAmount: 19000,
      presetAmounts: [3000, 5000, 10000, 19000],
      termsText: null,
    } as SchemeWithProducts;

    const result = resolveSchemeDefaults({
      existing,
      shopDisplayName: "Lucira Jewelry",
      submitted: {},
    });

    expect(result.minAmount).toBe(2000);
    expect(result.maxAmount).toBe(19000);
    expect(result.presetAmounts).toEqual([3000, 5000, 10000, 19000]);
    expect(result.termsText).toBe("I agree to Terms & Conditions of Lucira Jewelry");
  });
});

describe("buildDefaultTermsText", () => {
  it("interpolates the shop name into the hardcoded template", () => {
    expect(buildDefaultTermsText("Lucira Jewelry")).toBe(
      "I agree to Terms & Conditions of Lucira Jewelry",
    );
  });
});

describe("stripTermsTextPrefix", () => {
  it("removes the fixed prefix, leaving only the merchant-editable suffix", () => {
    expect(stripTermsTextPrefix(`${TERMS_TEXT_PREFIX}Lucira Jewelry`)).toBe(
      "Lucira Jewelry",
    );
  });

  it("returns the text unchanged when the prefix is missing", () => {
    expect(stripTermsTextPrefix("Custom text with no fixed prefix")).toBe(
      "Custom text with no fixed prefix",
    );
  });

  it("round-trips with buildDefaultTermsText", () => {
    const full = buildDefaultTermsText("Gold Rate Update");
    expect(stripTermsTextPrefix(full)).toBe("Gold Rate Update");
  });
});

describe("shopNameFromDomain", () => {
  it("derives a readable fallback name from a myshopify domain", () => {
    expect(shopNameFromDomain("lucira-jewelry.myshopify.com")).toBe("Lucira Jewelry");
  });

  it("handles a single-word domain", () => {
    expect(shopNameFromDomain("gold-rate-update.myshopify.com")).toBe("Gold Rate Update");
  });
});

describe("parseGifts", () => {
  it("returns two disabled empty gifts when raw is empty/null", () => {
    const gifts = parseGifts(null);
    expect(gifts).toHaveLength(2);
    expect(gifts[0]).toEqual({ enabled: false, name: null, value: null, imageUrl: null, minAmount: null, maxAmount: null });
    expect(gifts[1]).toEqual({ enabled: false, name: null, value: null, imageUrl: null, minAmount: null, maxAmount: null });
  });

  it("parses one configured gift and pads the second as disabled", () => {
    const gifts = parseGifts([
      { enabled: true, name: "Diamond Ring", value: 50000, imageUrl: "https://example.com/a.jpg", minAmount: 5000, maxAmount: 20000 },
    ]);
    expect(gifts).toHaveLength(2);
    expect(gifts[0]).toEqual({
      enabled: true,
      name: "Diamond Ring",
      value: 50000,
      imageUrl: "https://example.com/a.jpg",
      minAmount: 5000,
      maxAmount: 20000,
    });
    expect(gifts[1].enabled).toBe(false);
  });

  it("parses two configured gifts", () => {
    const gifts = parseGifts([
      { enabled: true, name: "Diamond Ring", value: 50000, imageUrl: null, minAmount: 5000, maxAmount: null },
      { enabled: true, name: "Gold Pendant", value: 20000, imageUrl: null, minAmount: 30000, maxAmount: null },
    ]);
    expect(gifts[0].name).toBe("Diamond Ring");
    expect(gifts[1].name).toBe("Gold Pendant");
  });

  it("ignores a third entry beyond the max of 2", () => {
    const gifts = parseGifts([
      { enabled: true, name: "Gift 1", value: 1, imageUrl: null, minAmount: null, maxAmount: null },
      { enabled: true, name: "Gift 2", value: 2, imageUrl: null, minAmount: null, maxAmount: null },
      { enabled: true, name: "Gift 3", value: 3, imageUrl: null, minAmount: null, maxAmount: null },
    ]);
    expect(gifts).toHaveLength(2);
  });

  it("defaults maxAmount to null when the raw entry omits it", () => {
    const gifts = parseGifts([
      { enabled: true, name: "Diamond Ring", value: 50000, imageUrl: null, minAmount: 5000 },
    ]);
    expect(gifts[0].maxAmount).toBeNull();
  });
});
