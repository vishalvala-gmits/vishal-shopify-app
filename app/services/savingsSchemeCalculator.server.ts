export type SavingsSchemeCalculationInput = {
  monthlyAmount: number;
  durationMonths: number;
  bonusEnabled: boolean;
  bonusMonths: number;
};

export type SavingsSchemeCalculationResult = {
  monthlyAmount: number;
  durationMonths: number;
  totalContribution: number;
  bonusAmount: number;
  totalBenefit: number;
};

export function calculateSavingsScheme(
  input: SavingsSchemeCalculationInput,
): SavingsSchemeCalculationResult {
  const { monthlyAmount, durationMonths, bonusEnabled, bonusMonths } = input;

  const totalContribution = monthlyAmount * durationMonths;
  const bonusAmount = bonusEnabled ? monthlyAmount * bonusMonths : 0;
  const totalBenefit = totalContribution + bonusAmount;

  return {
    monthlyAmount,
    durationMonths,
    totalContribution,
    bonusAmount,
    totalBenefit,
  };
}

export type Gift = {
  enabled: boolean;
  name: string | null;
  value: number | null;
  imageUrl: string | null;
  minAmount: number | null;
  /**
   * Optional upper bound: the gift is eligible only while the monthly
   * amount is <= maxAmount. Leaving it unset (null) means there is no
   * upper bound — the gift stays eligible for every amount at or above
   * minAmount.
   */
  maxAmount: number | null;
};

/**
 * A gift with no configured minimum applies to every eligible plan (matches
 * the pre-existing single-gift behavior in api.storefront.savings-enquiry.tsx).
 * A configured maximum caps eligibility from above; leaving it empty means
 * no upper bound.
 */
export function isGiftEligible(gift: Gift, monthlyAmount: number): boolean {
  if (!gift.enabled) return false;
  if (gift.minAmount != null && monthlyAmount < gift.minAmount) return false;
  if (gift.maxAmount != null && monthlyAmount > gift.maxAmount) return false;
  return true;
}

export function getEligibleGifts(gifts: Gift[], monthlyAmount: number): Gift[] {
  return gifts.filter((gift) => isGiftEligible(gift, monthlyAmount));
}

/**
 * Amount still needed to reach a gift's unlock threshold, or 0 if already
 * eligible (or the gift has no threshold). Never negative.
 */
export function amountToUnlockGift(gift: Gift, monthlyAmount: number): number {
  if (isGiftEligible(gift, monthlyAmount)) return 0;
  if (gift.minAmount == null) return 0;
  return Math.max(0, gift.minAmount - monthlyAmount);
}

export type EarlyRedemptionMonth = {
  month: number;
  totalPayment: number;
  bonusBenefit: number;
  jewelleryWorth: number;
};

export type EarlyRedemptionInput = {
  monthlyAmount: number;
  durationMonths: number;
  bonusEnabled: boolean;
  bonusMonths: number;
  earlyRedemptionMinMonths: number;
};

/**
 * Early redemption schedule for the months after `earlyRedemptionMinMonths`
 * up to the plan's total months (duration + bonus months). Preserves the
 * original storefront-only formula previously inlined in
 * extensions/savings-scheme/assets/savings-scheme.js: a pro-rated share of
 * the bonus/benefit pool, weighted more heavily as the redemption month
 * approaches the end of the plan.
 */
export function calculateEarlyRedemptionSchedule(
  input: EarlyRedemptionInput,
): EarlyRedemptionMonth[] {
  const {
    monthlyAmount,
    durationMonths,
    bonusEnabled,
    bonusMonths,
    earlyRedemptionMinMonths,
  } = input;

  const { totalContribution, totalBenefit } = calculateSavingsScheme({
    monthlyAmount,
    durationMonths,
    bonusEnabled,
    bonusMonths,
  });

  const totalMonths = durationMonths + (bonusEnabled ? bonusMonths : 0);
  const bonusPool = totalBenefit - totalContribution;

  const schedule: EarlyRedemptionMonth[] = [];
  for (let month = earlyRedemptionMinMonths + 1; month <= totalMonths; month++) {
    const paidMonths = Math.min(month, durationMonths);
    const totalPayment = paidMonths * monthlyAmount;
    const step =
      (month - earlyRedemptionMinMonths) /
      Math.max(1, totalMonths - earlyRedemptionMinMonths);
    const bonusBenefit = Math.round(bonusPool * Math.pow(step, 1.45));
    const jewelleryWorth = totalPayment + bonusBenefit;

    schedule.push({ month, totalPayment, bonusBenefit, jewelleryWorth });
  }

  return schedule;
}
