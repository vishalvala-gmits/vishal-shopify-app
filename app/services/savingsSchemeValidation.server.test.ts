import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  isValidPhone,
  validateMonthlyAmount,
  validateSavingsSchemeInput,
  type SchemeValidationInput,
} from "./savingsSchemeValidation.server";

const validScheme: SchemeValidationInput = {
  name: "Gold Savings Scheme",
  durationMonths: 9,
  bonusEnabled: true,
  bonusMonths: 1,
  minAmount: 2000,
  maxAmount: 19000,
  presetAmounts: [3000, 5000, 10000, 19000],
  giftEnabled: true,
  giftName: "Free Diamond Pendant",
  giftValue: 10000,
  currencySymbol: "₹",
  primaryColor: "#5C4642",
};

describe("validateSavingsSchemeInput", () => {
  it("accepts a fully valid scheme", () => {
    expect(validateSavingsSchemeInput(validScheme)).toEqual({});
  });

  it("requires a name", () => {
    const errors = validateSavingsSchemeInput({ ...validScheme, name: "  " });
    expect(errors.name).toBeDefined();
  });

  it("rejects non-integer or zero duration", () => {
    expect(validateSavingsSchemeInput({ ...validScheme, durationMonths: 0 }).durationMonths).toBeDefined();
    expect(validateSavingsSchemeInput({ ...validScheme, durationMonths: 9.5 }).durationMonths).toBeDefined();
  });

  it("rejects max amount lower than min amount", () => {
    const errors = validateSavingsSchemeInput({ ...validScheme, minAmount: 20000, maxAmount: 19000 });
    expect(errors.maxAmount).toBeDefined();
  });

  it("allows minAmount === maxAmount", () => {
    const errors = validateSavingsSchemeInput({
      ...validScheme,
      minAmount: 10000,
      maxAmount: 10000,
      presetAmounts: [10000],
    });
    expect(errors.maxAmount).toBeUndefined();
  });

  it("rejects duplicate preset amounts", () => {
    const errors = validateSavingsSchemeInput({
      ...validScheme,
      presetAmounts: [5000, 5000, 10000],
    });
    expect(errors.presetAmounts).toBeDefined();
  });

  it("rejects presets outside min/max range", () => {
    const errors = validateSavingsSchemeInput({
      ...validScheme,
      presetAmounts: [1000, 10000],
    });
    expect(errors.presetAmounts).toBeDefined();
  });

  it("requires bonusMonths >= 1 when bonus is enabled", () => {
    const errors = validateSavingsSchemeInput({ ...validScheme, bonusEnabled: true, bonusMonths: 0 });
    expect(errors.bonusMonths).toBeDefined();
  });

  it("does not require bonusMonths when bonus is disabled", () => {
    const errors = validateSavingsSchemeInput({ ...validScheme, bonusEnabled: false, bonusMonths: 0 });
    expect(errors.bonusMonths).toBeUndefined();
  });

  it("requires gift name and value when gift is enabled", () => {
    const errors = validateSavingsSchemeInput({
      ...validScheme,
      giftEnabled: true,
      giftName: "",
      giftValue: 0,
    });
    expect(errors.giftName).toBeDefined();
    expect(errors.giftValue).toBeDefined();
  });

  it("rejects an invalid hex color", () => {
    const errors = validateSavingsSchemeInput({ ...validScheme, primaryColor: "blue" });
    expect(errors.primaryColor).toBeDefined();
  });

  it("validates popular amount bounds when provided", () => {
    const tooLow = validateSavingsSchemeInput({ ...validScheme, popularAmount: 1000 });
    expect(tooLow.popularAmount).toBeDefined();

    const tooHigh = validateSavingsSchemeInput({ ...validScheme, popularAmount: 25000 });
    expect(tooHigh.popularAmount).toBeDefined();

    const valid = validateSavingsSchemeInput({ ...validScheme, popularAmount: 10000 });
    expect(valid.popularAmount).toBeUndefined();
  });

  it("validates early redemption minimum months bounds", () => {
    const zero = validateSavingsSchemeInput({
      ...validScheme,
      earlyRedemptionEnabled: true,
      earlyRedemptionMinMonths: 0,
    });
    expect(zero.earlyRedemptionMinMonths).toBeDefined();

    const tooHigh = validateSavingsSchemeInput({
      ...validScheme,
      earlyRedemptionEnabled: true,
      durationMonths: 9,
      earlyRedemptionMinMonths: 10,
    });
    expect(tooHigh.earlyRedemptionMinMonths).toBeDefined();

    const valid = validateSavingsSchemeInput({
      ...validScheme,
      earlyRedemptionEnabled: true,
      durationMonths: 9,
      earlyRedemptionMinMonths: 6,
    });
    expect(valid.earlyRedemptionMinMonths).toBeUndefined();
  });
});

describe("validateMonthlyAmount", () => {
  const bounds = { minAmount: 2000, maxAmount: 19000 };

  it.each([0, -100, NaN, Infinity, "abc"])("rejects invalid amount %s", (value) => {
    const errors = validateMonthlyAmount({ monthlyAmount: value, ...bounds });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects amounts below the minimum", () => {
    const errors = validateMonthlyAmount({ monthlyAmount: 1000, ...bounds });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects amounts above the maximum", () => {
    const errors = validateMonthlyAmount({ monthlyAmount: 20000, ...bounds });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts amounts within bounds, including non-preset slider values", () => {
    expect(validateMonthlyAmount({ monthlyAmount: 12345, ...bounds })).toEqual([]);
  });

  it("accepts the boundary values themselves", () => {
    expect(validateMonthlyAmount({ monthlyAmount: 2000, ...bounds })).toEqual([]);
    expect(validateMonthlyAmount({ monthlyAmount: 19000, ...bounds })).toEqual([]);
  });
});

describe("isValidEmail", () => {
  it("accepts a well-formed email", () => {
    expect(isValidEmail("rahul@example.com")).toBe(true);
  });

  it("rejects malformed email", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
  });
});

describe("isValidPhone", () => {
  it("accepts a plain 10-digit number", () => {
    expect(isValidPhone("9876543210")).toBe(true);
  });

  it("accepts a number with a leading +", () => {
    expect(isValidPhone("+919876543210")).toBe(true);
  });

  it("rejects too-short input", () => {
    expect(isValidPhone("123")).toBe(false);
  });
});
