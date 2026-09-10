import { describe, expect, it } from "vitest";
import {
  amountToUnlockGift,
  calculateEarlyRedemptionSchedule,
  getEligibleGifts,
  isGiftEligible,
  type Gift,
} from "./savingsSchemeCalculator.server";

const giftWithThreshold = (
  minAmount: number | null,
  maxAmount: number | null = null,
): Gift => ({
  enabled: true,
  name: "Diamond Ring",
  value: 50000,
  imageUrl: null,
  minAmount,
  maxAmount,
});

describe("isGiftEligible", () => {
  it("is not eligible when disabled, regardless of amount", () => {
    const gift = { ...giftWithThreshold(5000), enabled: false };
    expect(isGiftEligible(gift, 10000)).toBe(false);
  });

  it("monthly 4000 vs threshold 5000 -> not eligible", () => {
    expect(isGiftEligible(giftWithThreshold(5000), 4000)).toBe(false);
  });

  it("monthly 5000 vs threshold 5000 -> eligible (inclusive)", () => {
    expect(isGiftEligible(giftWithThreshold(5000), 5000)).toBe(true);
  });

  it("monthly 6000 vs threshold 5000 -> eligible", () => {
    expect(isGiftEligible(giftWithThreshold(5000), 6000)).toBe(true);
  });

  it("no minimum means eligible for every plan", () => {
    expect(isGiftEligible(giftWithThreshold(null), 1)).toBe(true);
  });

  it("uses monthly amount, not total contribution", () => {
    // A monthly amount of 3254 must be judged on its own, never on
    // monthlyAmount * durationMonths.
    expect(isGiftEligible(giftWithThreshold(5000), 3254)).toBe(false);
  });

  it("is eligible within an explicit min/max range", () => {
    const gift = giftWithThreshold(5000, 20000);
    expect(isGiftEligible(gift, 5000)).toBe(true);
    expect(isGiftEligible(gift, 12000)).toBe(true);
    expect(isGiftEligible(gift, 20000)).toBe(true);
  });

  it("is not eligible above a configured maximum", () => {
    const gift = giftWithThreshold(5000, 20000);
    expect(isGiftEligible(gift, 20001)).toBe(false);
    expect(isGiftEligible(gift, 50000)).toBe(false);
  });

  it("has no upper bound when maxAmount is left empty", () => {
    const gift = giftWithThreshold(5000, null);
    expect(isGiftEligible(gift, 999999)).toBe(true);
  });

  it("supports a maximum with no minimum", () => {
    const gift = giftWithThreshold(null, 20000);
    expect(isGiftEligible(gift, 1)).toBe(true);
    expect(isGiftEligible(gift, 20000)).toBe(true);
    expect(isGiftEligible(gift, 20001)).toBe(false);
  });
});

describe("getEligibleGifts", () => {
  const gift1 = giftWithThreshold(5000);
  const gift2 = { ...giftWithThreshold(30000), name: "Gold Pendant", value: 20000 };

  it("zero gifts", () => {
    expect(getEligibleGifts([], 10000)).toEqual([]);
  });

  it("one eligible gift out of two configured", () => {
    expect(getEligibleGifts([gift1, gift2], 10000)).toEqual([gift1]);
  });

  it("two eligible gifts", () => {
    expect(getEligibleGifts([gift1, gift2], 50000)).toEqual([gift1, gift2]);
  });

  it("no eligible gifts below every threshold", () => {
    expect(getEligibleGifts([gift1, gift2], 3254)).toEqual([]);
  });
});

describe("amountToUnlockGift", () => {
  it("4000 / 5000 threshold -> 1000 remaining", () => {
    expect(amountToUnlockGift(giftWithThreshold(5000), 4000)).toBe(1000);
  });

  it("3254 / 5000 threshold -> 1746 remaining", () => {
    expect(amountToUnlockGift(giftWithThreshold(5000), 3254)).toBe(1746);
  });

  it("5000 / 5000 threshold -> 0 remaining (already unlocked)", () => {
    expect(amountToUnlockGift(giftWithThreshold(5000), 5000)).toBe(0);
  });

  it("10000 / 5000 threshold -> 0 remaining", () => {
    expect(amountToUnlockGift(giftWithThreshold(5000), 10000)).toBe(0);
  });

  it("never returns a negative amount", () => {
    expect(amountToUnlockGift(giftWithThreshold(5000), 999999)).toBe(0);
  });
});

describe("calculateEarlyRedemptionSchedule", () => {
  const base = {
    monthlyAmount: 2000,
    durationMonths: 9,
    bonusEnabled: true,
    bonusMonths: 1,
    earlyRedemptionMinMonths: 6,
  };

  it("produces months 7 through 10 for duration 9 + bonus 1, eligible after 6", () => {
    const schedule = calculateEarlyRedemptionSchedule(base);
    expect(schedule.map((m) => m.month)).toEqual([7, 8, 9, 10]);
  });

  it("matches the reference example for the 10th month", () => {
    const schedule = calculateEarlyRedemptionSchedule(base);
    const tenth = schedule.find((m) => m.month === 10)!;
    expect(tenth.totalPayment).toBe(18000);
    expect(tenth.bonusBenefit).toBe(2000);
    expect(tenth.jewelleryWorth).toBe(20000);
  });

  it("caps total payment at durationMonths * monthlyAmount", () => {
    const schedule = calculateEarlyRedemptionSchedule(base);
    const ninth = schedule.find((m) => m.month === 9)!;
    const tenth = schedule.find((m) => m.month === 10)!;
    expect(ninth.totalPayment).toBe(18000);
    expect(tenth.totalPayment).toBe(18000);
  });

  it("adapts to a different duration/bonus configuration", () => {
    const schedule = calculateEarlyRedemptionSchedule({
      monthlyAmount: 5000,
      durationMonths: 10,
      bonusEnabled: true,
      bonusMonths: 1,
      earlyRedemptionMinMonths: 6,
    });
    expect(schedule.map((m) => m.month)).toEqual([7, 8, 9, 10, 11]);
  });

  it("returns an empty schedule when there are no months left after the eligibility point", () => {
    const schedule = calculateEarlyRedemptionSchedule({
      ...base,
      earlyRedemptionMinMonths: 10,
    });
    expect(schedule).toEqual([]);
  });
});
