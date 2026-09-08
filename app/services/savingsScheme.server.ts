import prisma from "../db.server";
import type { SavingsScheme, SavingsSchemeProduct } from "@prisma/client";

export type SchemeWithProducts = SavingsScheme & {
  products: SavingsSchemeProduct[];
};

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
  giftEnabled: boolean;
  giftName: string | null;
  giftValue: number | null;
  giftImageUrl?: string | null;
  giftMinAmount?: number | null;
  popularAmount?: number | null;
  earlyRedemptionEnabled?: boolean;
  earlyRedemptionMinMonths?: number;
  termsText?: string | null;
  currencySymbol: string;
  primaryColor: string;
  status: string;
};

export async function upsertSchemeForShop(
  shop: string,
  schemeId: string | null,
  input: SchemeUpsertInput,
): Promise<SavingsScheme> {
  if (schemeId) {
    return prisma.savingsScheme.update({
      where: { id: schemeId },
      data: input,
    });
  }

  return prisma.savingsScheme.create({
    data: { ...input, shop },
  });
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
