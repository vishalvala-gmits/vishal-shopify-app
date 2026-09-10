import type { ActionFunctionArgs } from "react-router";
import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import {
  calculateSavingsScheme,
  getEligibleGifts,
} from "../services/savingsSchemeCalculator.server";
import { parseGifts } from "../services/savingsScheme.server";
import {
  isValidEmail,
  isValidPhone,
  validateMonthlyAmount,
} from "../services/savingsSchemeValidation.server";
import {
  BASE_CORS_HEADERS,
  buildCorsHeadersForOrigin,
  resolveShopFromRequest,
} from "../services/resolveShop.server";
import { checkRateLimit, getClientIp } from "../services/rateLimit.server";

type EnquiryBody = {
  productId?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  monthlyAmount?: unknown;
  sourceUrl?: unknown;
};

const ENQUIRY_RATE_LIMIT = 5;
const ENQUIRY_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function errorResponse(
  message: string,
  status: number,
  headers: Record<string, string>,
  errors?: Record<string, string[]>,
) {
  return Response.json(
    { success: false, message, ...(errors ? { errors } : {}) },
    { status, headers },
  );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    const shopResolution = await resolveShopFromRequest(request);
    const headers = shopResolution.ok
      ? await buildCorsHeadersForOrigin(shopResolution.shop, request)
      : BASE_CORS_HEADERS;
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed.", 405, BASE_CORS_HEADERS);
  }

  const shopResolution = await resolveShopFromRequest(request);
  if (!shopResolution.ok) {
    return errorResponse(shopResolution.error, shopResolution.status, BASE_CORS_HEADERS);
  }

  const corsHeaders = await buildCorsHeadersForOrigin(shopResolution.shop, request);

  const rateLimitKey = `${shopResolution.shop}:${getClientIp(request)}`;
  if (!checkRateLimit(rateLimitKey, ENQUIRY_RATE_LIMIT, ENQUIRY_RATE_LIMIT_WINDOW_MS)) {
    return errorResponse(
      "Too many enquiries submitted. Please try again later.",
      429,
      corsHeaders,
    );
  }

  let body: EnquiryBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid request body.", 400, corsHeaders);
  }

  const productId = typeof body.productId === "string" ? body.productId : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl : null;

  const fieldErrors: Record<string, string[]> = {};

  if (!productId) {
    fieldErrors.productId = ["Product is required."];
  }
  if (!name || name.length > 200) {
    fieldErrors.name = ["Name is required and must be a reasonable length."];
  }
  if (!email && !phone) {
    fieldErrors.contact = ["Provide at least one of email or phone."];
  }
  if (email && !isValidEmail(email)) {
    fieldErrors.email = ["Enter a valid email address."];
  }
  if (phone && !isValidPhone(phone)) {
    fieldErrors.phone = ["Enter a valid phone number."];
  }

  if (Object.keys(fieldErrors).length > 0) {
    return errorResponse("Please correct the highlighted fields.", 400, corsHeaders, fieldErrors);
  }

  const assignment = await prisma.savingsSchemeProduct.findFirst({
    where: { shop: shopResolution.shop, shopifyProductId: productId },
    include: { scheme: true },
  });

  if (!assignment || assignment.scheme.status !== "active") {
    return errorResponse("No active savings scheme for this product.", 404, corsHeaders);
  }

  const { scheme } = assignment;

  const monthlyAmountErrors = validateMonthlyAmount({
    monthlyAmount: body.monthlyAmount,
    minAmount: scheme.minAmount,
    maxAmount: scheme.maxAmount,
  });

  if (monthlyAmountErrors.length > 0) {
    return errorResponse("Invalid monthly contribution amount.", 400, corsHeaders, {
      monthlyAmount: monthlyAmountErrors,
    });
  }

  const monthlyAmount = Number(body.monthlyAmount);

  // Server always recalculates from the scheme's own configuration; any totals
  // the client may have sent alongside monthlyAmount are ignored entirely.
  const { totalContribution, bonusAmount, totalBenefit } = calculateSavingsScheme({
    monthlyAmount,
    durationMonths: scheme.durationMonths,
    bonusEnabled: scheme.bonusEnabled,
    bonusMonths: scheme.bonusMonths,
  });

  // Never trust client-submitted gift/eligibility data: recalculate from the
  // scheme's current configuration and the validated monthly amount.
  const allGifts = parseGifts(scheme.gifts);
  const eligibleGifts = getEligibleGifts(allGifts, monthlyAmount);
  const primaryGift = eligibleGifts[0] ?? null;

  await prisma.savingsEnquiry.create({
    data: {
      shop: shopResolution.shop,
      schemeId: scheme.id,
      shopifyProductId: productId,
      customerName: name,
      customerEmail: email || null,
      customerPhone: phone || null,
      monthlyAmount,
      durationMonths: scheme.durationMonths,
      bonusAmount,
      totalContribution,
      totalBenefit,
      // Legacy single-gift columns mirror the first eligible gift, preserved
      // for backward compatibility with the existing enquiries UI/reports.
      giftName: primaryGift?.name ?? null,
      giftValue: primaryGift?.value ?? null,
      giftEligible: eligibleGifts.length > 0,
      giftsSnapshot:
        eligibleGifts.length > 0
          ? eligibleGifts.map((gift) => ({
              name: gift.name,
              value: gift.value,
              imageUrl: gift.imageUrl,
              minAmount: gift.minAmount,
              maxAmount: gift.maxAmount,
            }))
          : Prisma.JsonNull,
      sourceUrl,
    },
  });

  return Response.json(
    { success: true, message: "Enquiry submitted successfully." },
    { headers: corsHeaders },
  );
};
