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
