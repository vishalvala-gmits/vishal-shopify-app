import prisma from "../db.server";
import type { SavingsScheme, SavingsSchemeProduct } from "@prisma/client";
import type { Gift } from "./savingsSchemeCalculator.server";

export type SchemeWithProducts = SavingsScheme & {
  products: SavingsSchemeProduct[];
};

export const MAX_GIFTS = 2;

export const DEFAULT_MIN_AMOUNT = 5000;
export const DEFAULT_MAX_AMOUNT = 120000;
export const DEFAULT_PRESET_AMOUNTS = [10000, 30000, 50000, 80000];

const EMPTY_GIFT: Gift = {
  enabled: false,
  name: null,
  value: null,
  imageUrl: null,
  minAmount: null,
  maxAmount: null,
};

/** Parses the scheme's raw `gifts` JSON column into a fixed-length [Gift, Gift] tuple. */
export function parseGifts(raw: unknown): Gift[] {
  const list = Array.isArray(raw) ? raw : [];
  const gifts: Gift[] = [];
  for (let i = 0; i < MAX_GIFTS; i++) {
    const entry = list[i];
    if (entry && typeof entry === "object") {
      const g = entry as Record<string, unknown>;
      gifts.push({
        enabled: Boolean(g.enabled),
        name: typeof g.name === "string" ? g.name : null,
        value: typeof g.value === "number" ? g.value : null,
        imageUrl: typeof g.imageUrl === "string" ? g.imageUrl : null,
        minAmount: typeof g.minAmount === "number" ? g.minAmount : null,
        maxAmount: typeof g.maxAmount === "number" ? g.maxAmount : null,
      });
    } else {
      gifts.push({ ...EMPTY_GIFT });
    }
  }
  return gifts;
}

// Fixed, non-editable prefix for the storefront terms checkbox label. The
// merchant can only customize the part after "of" (defaults to the shop
// name) — see GiftFields-adjacent TermsTextField in app.savings-scheme.tsx.
export const TERMS_TEXT_PREFIX = "I agree to Terms & Conditions of ";

export function buildDefaultTermsText(shopName: string): string {
  return `${TERMS_TEXT_PREFIX}${shopName}`;
}

/** Strips the fixed prefix so only the merchant-editable suffix remains. */
export function stripTermsTextPrefix(termsText: string): string {
  return termsText.startsWith(TERMS_TEXT_PREFIX)
    ? termsText.slice(TERMS_TEXT_PREFIX.length)
    : termsText;
}

/** Derives a human-readable fallback shop name from a *.myshopify.com domain. */
export function shopNameFromDomain(shopDomain: string): string {
  const base = shopDomain.replace(/\.myshopify\.com$/i, "");
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function getSchemeForShop(shop: string): Promise<SchemeWithProducts | null> {
  return prisma.savingsScheme.findFirst({
    where: { shop },
    include: { products: true },
    orderBy: { createdAt: "asc" },
  });
}

export type SchemeUpsertInput = {
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
  status: string;
};

/**
 * Creates or updates a shop's scheme. On update, only the fields explicitly
 * present in `input` are written — existing merchant values are never
 * clobbered by defaults. On create, callers are expected to have already
 * filled in defaults (see resolveSchemeDefaults) for any field the merchant
 * did not set, since there is no prior row to preserve.
 */
export async function upsertSchemeForShop(
  shop: string,
  schemeId: string | null,
  input: SchemeUpsertInput,
): Promise<SavingsScheme> {
  const data = {
    ...input,
    gifts: input.gifts.slice(0, MAX_GIFTS),
  };

  if (schemeId) {
    return prisma.savingsScheme.update({
      where: { id: schemeId },
      data,
    });
  }

  return prisma.savingsScheme.create({
    data: { ...data, shop },
  });
}

/**
 * Fills in initialization defaults for a brand-new scheme (no existing row),
 * or for a nullable field on an existing scheme that has never been set.
 * Never overwrites a value the merchant already configured.
 */
export function resolveSchemeDefaults(params: {
  existing: SchemeWithProducts | null;
  shopDisplayName: string;
  submitted: {
    minAmount?: number;
    maxAmount?: number;
    presetAmounts?: number[];
    termsText?: string | null;
  };
}): { minAmount: number; maxAmount: number; presetAmounts: number[]; termsText: string | null } {
  const { existing, shopDisplayName, submitted } = params;

  const minAmount =
    submitted.minAmount ?? existing?.minAmount ?? DEFAULT_MIN_AMOUNT;
  const maxAmount =
    submitted.maxAmount ?? existing?.maxAmount ?? DEFAULT_MAX_AMOUNT;

  const presetAmounts =
    submitted.presetAmounts && submitted.presetAmounts.length > 0
      ? submitted.presetAmounts
      : Array.isArray(existing?.presetAmounts) &&
          (existing!.presetAmounts as unknown[]).length > 0
        ? (existing!.presetAmounts as number[])
        : DEFAULT_PRESET_AMOUNTS;

  const termsText =
    submitted.termsText != null && submitted.termsText.trim().length > 0
      ? submitted.termsText
      : (existing?.termsText ?? buildDefaultTermsText(shopDisplayName));

  return { minAmount, maxAmount, presetAmounts, termsText };
}

export async function replaceSchemeProducts(
  shop: string,
  schemeId: string,
  shopifyProductIds: string[],
): Promise<void> {
  await prisma.$transaction([
    prisma.savingsSchemeProduct.deleteMany({ where: { shop, schemeId } }),
    ...shopifyProductIds.map((shopifyProductId) =>
      prisma.savingsSchemeProduct.create({
        data: { shop, schemeId, shopifyProductId },
      }),
    ),
  ]);
}
