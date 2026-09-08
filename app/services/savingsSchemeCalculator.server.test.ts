import { describe, expect, it } from "vitest";
import { calculateSavingsScheme } from "./savingsSchemeCalculator.server";

describe("calculateSavingsScheme", () => {
  const base = { durationMonths: 9, bonusEnabled: true, bonusMonths: 1 };

  it.each([
    [3000, 27000, 3000, 30000],
    [5000, 45000, 5000, 50000],
    [10000, 90000, 10000, 100000],
    [19000, 171000, 19000, 190000],
  ])(
    "monthlyAmount=%i => contribution=%i, bonus=%i, benefit=%i",
    (monthlyAmount, totalContribution, bonusAmount, totalBenefit) => {
      const result = calculateSavingsScheme({ ...base, monthlyAmount });
      expect(result.totalContribution).toBe(totalContribution);
      expect(result.bonusAmount).toBe(bonusAmount);
      expect(result.totalBenefit).toBe(totalBenefit);
    },
  );

  it("returns zero bonus when bonus is disabled", () => {
    const result = calculateSavingsScheme({
      monthlyAmount: 10000,
      durationMonths: 9,
      bonusEnabled: false,
      bonusMonths: 1,
    });
    expect(result.totalContribution).toBe(90000);
    expect(result.bonusAmount).toBe(0);
    expect(result.totalBenefit).toBe(90000);
  });

  it("supports a 2-month bonus", () => {
    const result = calculateSavingsScheme({
      monthlyAmount: 10000,
      durationMonths: 9,
      bonusEnabled: true,
      bonusMonths: 2,
    });
    expect(result.totalContribution).toBe(90000);
    expect(result.bonusAmount).toBe(20000);
    expect(result.totalBenefit).toBe(110000);
  });

  it("supports a custom duration of 6 months", () => {
    const result = calculateSavingsScheme({
      monthlyAmount: 10000,
      durationMonths: 6,
      bonusEnabled: true,
      bonusMonths: 1,
    });
    expect(result.totalContribution).toBe(60000);
    expect(result.bonusAmount).toBe(10000);
    expect(result.totalBenefit).toBe(70000);
  });

  it("handles minimum === maximum single allowed amount", () => {
    const result = calculateSavingsScheme({
      monthlyAmount: 10000,
      durationMonths: 9,
      bonusEnabled: true,
      bonusMonths: 1,
    });
    expect(result.totalBenefit).toBe(100000);
  });

  it("never includes gift value in totalBenefit", () => {
    const result = calculateSavingsScheme({
      monthlyAmount: 10000,
      durationMonths: 9,
      bonusEnabled: true,
      bonusMonths: 1,
    });
    // Gift value (e.g. 10000) must never be folded into totalBenefit.
    expect(result.totalBenefit).toBe(100000);
    expect(result.totalBenefit).not.toBe(110000);
  });
});
