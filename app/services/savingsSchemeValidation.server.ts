import type { Gift } from "./savingsSchemeCalculator.server";

export const MAX_GIFTS = 2;

export type SchemeValidationInput = {
  name: string;
  durationMonths: number;
  bonusEnabled: boolean;
  bonusMonths: number;
  minAmount: number;
  maxAmount: number;
  presetAmounts: number[];
  gifts: Gift[];
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

  const gifts = input.gifts ?? [];
  if (gifts.length > MAX_GIFTS) {
    addError(errors, "gifts", `A maximum of ${MAX_GIFTS} gifts is supported.`);
  }

  gifts.slice(0, MAX_GIFTS).forEach((gift, index) => {
    if (!gift.enabled) return;

    if (!gift.name || gift.name.trim().length === 0) {
      addError(
        errors,
        `gifts.${index}.name`,
        `Gift ${index + 1} name is required when the gift is enabled.`,
      );
    }
    if (!Number.isFinite(gift.value) || (gift.value ?? 0) <= 0) {
      addError(
        errors,
        `gifts.${index}.value`,
        `Gift ${index + 1} value must be greater than 0 when the gift is enabled.`,
      );
    }
    if (gift.minAmount != null) {
      if (!Number.isFinite(gift.minAmount) || gift.minAmount < 0) {
        addError(
          errors,
          `gifts.${index}.minAmount`,
          `Gift ${index + 1} minimum contribution must be 0 or greater.`,
        );
      } else if (gift.minAmount < input.minAmount || gift.minAmount > input.maxAmount) {
        addError(
          errors,
          `gifts.${index}.minAmount`,
          `Gift ${index + 1} minimum contribution must be between the scheme's minimum and maximum amount.`,
        );
      }
    }

    // Optional: leaving it empty means no upper bound.
    if (gift.maxAmount != null) {
      if (!Number.isFinite(gift.maxAmount) || gift.maxAmount < 0) {
        addError(
          errors,
          `gifts.${index}.maxAmount`,
          `Gift ${index + 1} maximum contribution must be 0 or greater.`,
        );
      } else if (gift.maxAmount < input.minAmount || gift.maxAmount > input.maxAmount) {
        addError(
          errors,
          `gifts.${index}.maxAmount`,
          `Gift ${index + 1} maximum contribution must be between the scheme's minimum and maximum amount.`,
        );
      } else if (gift.minAmount != null && gift.maxAmount < gift.minAmount) {
        addError(
          errors,
          `gifts.${index}.maxAmount`,
          `Gift ${index + 1} maximum contribution must be greater than or equal to its minimum contribution.`,
        );
      }
    }
  });

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
