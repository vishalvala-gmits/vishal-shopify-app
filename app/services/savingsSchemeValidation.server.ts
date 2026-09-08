export type SchemeValidationInput = {
  name: string;
  durationMonths: number;
  bonusEnabled: boolean;
  bonusMonths: number;
  minAmount: number;
  maxAmount: number;
  presetAmounts: number[];
  giftEnabled: boolean;
  giftName?: string | null;
  giftValue?: number | null;
  giftImageUrl?: string | null;
  giftMinAmount?: number | null;
  popularAmount?: number | null;
  earlyRedemptionEnabled?: boolean;
  earlyRedemptionMinMonths?: number;
  termsText?: string | null;
  currencySymbol: string;
  primaryColor: string;
};

export type SchemeValidationErrors = Record<string, string[]>;

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function addError(
  errors: SchemeValidationErrors,
  field: string,
  message: string,
) {
  if (!errors[field]) {
    errors[field] = [];
  }
  errors[field].push(message);
}

export function validateSavingsSchemeInput(
  input: SchemeValidationInput,
): SchemeValidationErrors {
  const errors: SchemeValidationErrors = {};

  if (!input.name || input.name.trim().length === 0) {
    addError(errors, "name", "Scheme name is required.");
  }

  if (!Number.isInteger(input.durationMonths) || input.durationMonths < 1) {
    addError(errors, "durationMonths", "Duration must be an integer of at least 1.");
  }

  if (!Number.isFinite(input.minAmount) || input.minAmount <= 0) {
    addError(errors, "minAmount", "Minimum amount must be greater than 0.");
  }

  if (!Number.isFinite(input.maxAmount) || input.maxAmount < input.minAmount) {
    addError(errors, "maxAmount", "Maximum amount must be greater than or equal to minimum amount.");
  }

  const presetAmounts = input.presetAmounts ?? [];
  const seenPresets = new Set<number>();
  for (const preset of presetAmounts) {
    if (seenPresets.has(preset)) {
      addError(errors, "presetAmounts", "Preset amounts must not contain duplicates.");
      break;
    }
    seenPresets.add(preset);
  }
  for (const preset of presetAmounts) {
    if (preset < input.minAmount || preset > input.maxAmount) {
      addError(
        errors,
        "presetAmounts",
        "Preset amounts must be between the minimum and maximum amount.",
      );
      break;
    }
  }

  if (input.bonusEnabled && (!Number.isInteger(input.bonusMonths) || input.bonusMonths < 1)) {
    addError(errors, "bonusMonths", "Bonus months must be at least 1 when bonus is enabled.");
  }

  if (input.giftEnabled) {
    if (!input.giftName || input.giftName.trim().length === 0) {
      addError(errors, "giftName", "Gift name is required when the gift is enabled.");
    }
    if (!Number.isFinite(input.giftValue) || (input.giftValue ?? 0) <= 0) {
      addError(errors, "giftValue", "Gift value must be greater than 0 when the gift is enabled.");
    }
  }

  if (input.popularAmount != null && Number.isFinite(input.popularAmount)) {
    if (input.popularAmount < input.minAmount || input.popularAmount > input.maxAmount) {
      addError(
        errors,
        "popularAmount",
        "Popular amount must be between the minimum and maximum amount.",
      );
    }
  }

  if (input.earlyRedemptionEnabled && input.earlyRedemptionMinMonths != null) {
    if (
      !Number.isInteger(input.earlyRedemptionMinMonths) ||
      input.earlyRedemptionMinMonths < 1 ||
      input.earlyRedemptionMinMonths > input.durationMonths
    ) {
      addError(
        errors,
        "earlyRedemptionMinMonths",
        "Early redemption eligibility month must be between 1 and duration months.",
      );
    }
  }

  if (!input.currencySymbol || input.currencySymbol.trim().length === 0) {
    addError(errors, "currencySymbol", "Currency symbol is required.");
  }

  if (!input.primaryColor || !HEX_COLOR_PATTERN.test(input.primaryColor)) {
    addError(errors, "primaryColor", "Primary color must be a valid hex color (e.g. #5C4642).");
  }

  return errors;
}

export type MonthlyAmountValidationInput = {
  monthlyAmount: unknown;
  minAmount: number;
  maxAmount: number;
};

export function validateMonthlyAmount(input: MonthlyAmountValidationInput): string[] {
  const errors: string[] = [];
  const { monthlyAmount, minAmount, maxAmount } = input;

  const amount = typeof monthlyAmount === "number" ? monthlyAmount : Number(monthlyAmount);

  if (typeof monthlyAmount !== "number" && typeof monthlyAmount !== "string") {
    errors.push("Amount must be numeric.");
    return errors;
  }

  if (!Number.isFinite(amount)) {
    errors.push("Amount must be a valid number.");
    return errors;
  }

  if (amount <= 0) {
    errors.push("Amount must be greater than 0.");
    return errors;
  }

  if (amount < minAmount || amount > maxAmount) {
    errors.push(`Amount must be between ${minAmount} and ${maxAmount}.`);
  }

  return errors;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9]{7,15}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

export function isValidPhone(value: string): boolean {
  return PHONE_PATTERN.test(value);
}
