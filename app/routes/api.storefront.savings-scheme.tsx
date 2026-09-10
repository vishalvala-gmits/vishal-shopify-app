import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import {
  BASE_CORS_HEADERS,
  buildCorsHeadersForOrigin,
  resolveShopFromRequest,
} from "../services/resolveShop.server";
import { parseGifts } from "../services/savingsScheme.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopResolution = await resolveShopFromRequest(request);
  if (!shopResolution.ok) {
    return Response.json(
      { success: false, error: shopResolution.error },
      { status: shopResolution.status, headers: BASE_CORS_HEADERS },
    );
  }

  const corsHeaders = await buildCorsHeadersForOrigin(shopResolution.shop, request);

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  if (!productId) {
    return Response.json(
      { success: false, error: "Missing productId parameter." },
      { status: 400, headers: corsHeaders },
    );
  }

  const assignment = await prisma.savingsSchemeProduct.findFirst({
    where: { shop: shopResolution.shop, shopifyProductId: productId },
    include: { scheme: true },
  });

  if (!assignment || assignment.scheme.status !== "active") {
    return Response.json({ enabled: false }, { headers: corsHeaders });
  }

  const { scheme } = assignment;
  const gifts = parseGifts(scheme.gifts).filter((gift) => gift.enabled);

  return Response.json(
    {
      enabled: true,
      scheme: {
        name: scheme.name,
        durationMonths: scheme.durationMonths,
        bonusEnabled: scheme.bonusEnabled,
        bonusMonths: scheme.bonusMonths,
        minAmount: scheme.minAmount,
        maxAmount: scheme.maxAmount,
        presetAmounts: scheme.presetAmounts,
        popularAmount: scheme.popularAmount,
        gifts: gifts.map((gift) => ({
          enabled: gift.enabled,
          name: gift.name,
          value: gift.value,
          image: gift.imageUrl,
          minimumContributionToUnlock: gift.minAmount,
          maximumContributionToUnlock: gift.maxAmount,
        })),
        earlyRedemption: {
          enabled: scheme.earlyRedemptionEnabled,
          minMonths: scheme.earlyRedemptionMinMonths,
        },
        termsText: scheme.termsText,
        currencySymbol: scheme.currencySymbol,
        primaryColor: scheme.primaryColor,
      },
    },
    { headers: corsHeaders },
  );
};

export const action = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    const shopResolution = await resolveShopFromRequest(request);
    const headers = shopResolution.ok
      ? await buildCorsHeadersForOrigin(shopResolution.shop, request)
      : BASE_CORS_HEADERS;
    return new Response(null, { status: 204, headers });
  }
  return Response.json({ success: false, error: "Method not allowed." }, { status: 405 });
};
