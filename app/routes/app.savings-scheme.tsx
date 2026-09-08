import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getSchemeForShop,
  replaceSchemeProducts,
  upsertSchemeForShop,
} from "../services/savingsScheme.server";
import { validateSavingsSchemeInput } from "../services/savingsSchemeValidation.server";
import type { SchemeValidationErrors } from "../services/savingsSchemeValidation.server";

export type ProductSummary = {
  id: string;
  title: string;
  imageUrl?: string;
};

export function getCurrencySymbol(currencyCode: string): string {
  try {
    const formatter = new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
    });
    const parts = formatter.formatToParts(0);
    const symbolPart = parts.find((part) => part.type === "currency");
    return symbolPart?.value || currencyCode;
  } catch {
    return currencyCode;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const scheme = await getSchemeForShop(session.shop);

  const productIds = scheme?.products.map((p) => p.shopifyProductId) ?? [];
  let initialProducts: ProductSummary[] = [];
  let shopCurrencyCode = "INR";
  let defaultCurrencySymbol = "₹";

  try {
    const response = await admin.graphql(
      `#graphql
        query GetShopAndAssignedProducts($ids: [ID!]!) {
          shop {
            currencyCode
          }
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              featuredImage {
                url
              }
            }
          }
        }
      `,
      { variables: { ids: productIds } },
    );
    const json = await response.json();
    if (json.data?.shop?.currencyCode) {
      shopCurrencyCode = json.data.shop.currencyCode;
      defaultCurrencySymbol = getCurrencySymbol(shopCurrencyCode);
    }
    if (json.data?.nodes) {
      initialProducts = (
        json.data.nodes as Array<{
          id: string;
          title: string;
          featuredImage?: { url: string } | null;
        }>
      )
        .filter(Boolean)
        .map((node) => ({
          id: node.id,
          title: node.title,
          imageUrl: node.featuredImage?.url ?? undefined,
        }));
    }
  } catch (error) {
    console.error("Failed to load shop info or assigned products:", error);
  }

  return { scheme, initialProducts, defaultCurrencySymbol, shopCurrencyCode };
};

type ActionResult =
  | { success: true }
  | {
      success: false;
      errors: SchemeValidationErrors;
      submitted: Record<string, string>;
    };

function parseAmounts(raw: string): number[] {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => Number(value));
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const submitted = Object.fromEntries(formData.entries()) as Record<
    string,
    string
  >;

  const name = String(formData.get("name") ?? "");
  const durationMonths = Number(formData.get("durationMonths"));
  const bonusEnabled = formData.get("bonusEnabled") === "on";
  const bonusMonths = Number(formData.get("bonusMonths") ?? 0);
  const minAmount = Number(formData.get("minAmount"));
  const maxAmount = Number(formData.get("maxAmount"));
  const presetAmounts = parseAmounts(
    String(formData.get("presetAmounts") ?? ""),
  );
  const giftEnabled = formData.get("giftEnabled") === "on";
  const giftName = String(formData.get("giftName") ?? "");
  const giftValue = Number(formData.get("giftValue") ?? 0);
  const giftImageUrl = String(formData.get("giftImageUrl") ?? "");
  const giftMinAmount = formData.get("giftMinAmount")
    ? Number(formData.get("giftMinAmount"))
    : null;
  const popularAmount = formData.get("popularAmount")
    ? Number(formData.get("popularAmount"))
    : null;
  const earlyRedemptionEnabled =
    formData.get("earlyRedemptionEnabled") === "on";
  const earlyRedemptionMinMonths = Number(
    formData.get("earlyRedemptionMinMonths") ?? 6,
  );
  const termsText = String(formData.get("termsText") ?? "");

  const currencySymbol = String(formData.get("currencySymbol") ?? "");
  const primaryColor = String(formData.get("primaryColor") ?? "");
  const schemeId = formData.get("schemeId")
    ? String(formData.get("schemeId"))
    : null;
  const productIdsRaw = String(formData.get("productIds") ?? "");
  const productIds = productIdsRaw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  const errors = validateSavingsSchemeInput({
    name,
    durationMonths,
    bonusEnabled,
    bonusMonths,
    minAmount,
    maxAmount,
    presetAmounts,
    giftEnabled,
    giftName,
    giftValue,
    giftImageUrl,
    giftMinAmount,
    popularAmount,
    earlyRedemptionEnabled,
    earlyRedemptionMinMonths,
    termsText,
    currencySymbol,
    primaryColor,
  });

  if (Object.keys(errors).length > 0) {
    return { success: false, errors, submitted } satisfies ActionResult;
  }

  try {
    if (productIds.length > 0) {
      const response = await admin.graphql(
        `#graphql
          query ValidateSavingsSchemeProducts($ids: [ID!]!) {
            nodes(ids: $ids) {
              id
            }
          }
        `,
        { variables: { ids: productIds } },
      );
      const json = await response.json();
      const validIds = new Set(
        (json.data?.nodes ?? [])
          .filter(Boolean)
          .map((node: { id: string }) => node.id),
      );
      const invalidIds = productIds.filter((id) => !validIds.has(id));
      if (invalidIds.length > 0) {
        return {
          success: false,
          errors: {
            productIds: [
              "One or more selected products could not be found for this shop.",
            ],
          },
          submitted,
        } satisfies ActionResult;
      }
    }

    const scheme = await upsertSchemeForShop(session.shop, schemeId, {
      name,
      durationMonths,
      bonusEnabled,
      bonusMonths,
      minAmount,
      maxAmount,
      presetAmounts,
      giftEnabled,
      giftName: giftEnabled ? giftName : null,
      giftValue: giftEnabled ? giftValue : null,
      giftImageUrl:
        giftEnabled && giftImageUrl.trim().length > 0
          ? giftImageUrl.trim()
          : null,
      giftMinAmount: giftEnabled && giftMinAmount ? giftMinAmount : null,
      popularAmount,
      earlyRedemptionEnabled,
      earlyRedemptionMinMonths,
      termsText: termsText.trim().length > 0 ? termsText.trim() : null,
      currencySymbol,
      primaryColor,
      status: "active",
    });

    await replaceSchemeProducts(session.shop, scheme.id, productIds);

    return { success: true } satisfies ActionResult;
  } catch (error) {
    if (error instanceof Response) {
      // Let Shopify auth/redirect responses (e.g. from an expired session
      // surfacing mid-request) propagate normally instead of being swallowed.
      throw error;
    }
    return {
      success: false,
      errors: {
        form: [
          error instanceof Error
            ? error.message
            : "Failed to save the scheme. Please try again.",
        ],
      },
      submitted,
    } satisfies ActionResult;
  }
};

export default function SavingsSchemeSettings() {
  const { scheme, initialProducts, defaultCurrencySymbol, shopCurrencyCode } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();
  const shopify = useAppBridge();
  const formRef = useRef<HTMLFormElement>(null);

  const [selectedProducts, setSelectedProducts] =
    useState<ProductSummary[]>(initialProducts);

  useEffect(() => {
    setSelectedProducts(initialProducts);
  }, [initialProducts]);

  const [bonusEnabled, setBonusEnabled] = useState(
    scheme?.bonusEnabled ?? false,
  );
  const [giftEnabled, setGiftEnabled] = useState(scheme?.giftEnabled ?? false);
  const [earlyRedemptionEnabled, setEarlyRedemptionEnabled] = useState(
    scheme?.earlyRedemptionEnabled ?? true,
  );

  const [giftImageUrl, setGiftImageUrl] = useState(scheme?.giftImageUrl ?? "");
  const [giftImageUploading, setGiftImageUploading] = useState(false);
  const [giftImageError, setGiftImageError] = useState<string | undefined>(
    undefined,
  );
  type DropZoneEl = HTMLElement & {
    value?: string;
    disabled?: boolean;
    files?: File[];
  };
  const dropZoneRef = useRef<DropZoneEl | null>(null);

  const attachSwitchListener = (
    node: Element | null,
    setter: (value: boolean) => void,
  ) => {
    if (!node) return;
    const handler = (event: Event) => {
      const target = event.currentTarget as unknown as { checked?: boolean };
      setter(Boolean(target.checked));
    };
    node.addEventListener("change", handler);
    return () => node.removeEventListener("change", handler);
  };

  const bonusSwitchRef = useCallback(
    (node: Element | null) => attachSwitchListener(node, setBonusEnabled),
    [],
  );
  const giftSwitchRef = useCallback(
    (node: Element | null) => attachSwitchListener(node, setGiftEnabled),
    [],
  );
  const earlyRedemptionSwitchRef = useCallback(
    (node: Element | null) =>
      attachSwitchListener(node, setEarlyRedemptionEnabled),
    [],
  );

  const handleGiftImageChange = useCallback(async (event: Event) => {
    const target = event.currentTarget as unknown as DropZoneEl;
    const file = target.files?.[0];
    if (!file) return;

    setGiftImageError(undefined);
    setGiftImageUploading(true);
    if (dropZoneRef.current) dropZoneRef.current.disabled = true;

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/app/api/upload-gift-image", {
        method: "POST",
        body,
      });
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || "Upload failed. Please try again.");
      }
      setGiftImageUrl(result.url);
    } catch (error) {
      setGiftImageError(
        error instanceof Error
          ? error.message
          : "Upload failed. Please try again.",
      );
    } finally {
      setGiftImageUploading(false);
      if (dropZoneRef.current) {
        dropZoneRef.current.disabled = false;
        dropZoneRef.current.value = "";
      }
    }
  }, []);

  const bindDropZone = useCallback(
    (node: Element | null) => {
      dropZoneRef.current = node as DropZoneEl | null;
      if (!node) return;
      node.addEventListener("change", handleGiftImageChange);
      return () => node.removeEventListener("change", handleGiftImageChange);
    },
    [handleGiftImageChange],
  );

  const removeGiftImage = () => {
    setGiftImageUrl("");
    setGiftImageError(undefined);
  };

  const isSaving = fetcher.state !== "idle";
  const result = fetcher.data;
  const errors = result && !result.success ? result.errors : {};

  useEffect(() => {
    if (result?.success) {
      shopify.toast.show("Scheme saved successfully");
    }
  }, [result, shopify]);

  const presetAmountsDefault = Array.isArray(scheme?.presetAmounts)
    ? (scheme?.presetAmounts as number[]).join(", ")
    : "";

  const pickProducts = async () => {
    const selection = await shopify.resourcePicker?.({
      type: "product",
      multiple: true,
      selectionIds: selectedProducts.map((item) => ({ id: item.id })),
    });

    if (selection) {
      type ResourcePickerItem = {
        id: string;
        title: string;
        images?: Array<{ originalSrc?: string; url?: string }>;
        featuredImage?: { url?: string };
      };

      setSelectedProducts(
        (selection as ResourcePickerItem[]).map((item) => ({
          id: item.id,
          title: item.title,
          imageUrl:
            item.images?.[0]?.originalSrc ||
            item.images?.[0]?.url ||
            item.featuredImage?.url ||
            undefined,
        })),
      );
    }
  };

  const removeProduct = (idToRemove: string) => {
    setSelectedProducts((prev) =>
      prev.filter((product) => product.id !== idToRemove),
    );
  };

  return (
    <s-page heading="Savings Scheme">
      <fetcher.Form method="post" id="savings-scheme-form" ref={formRef}>
        <input type="hidden" name="schemeId" value={scheme?.id ?? ""} />
        <input
          type="hidden"
          name="productIds"
          value={selectedProducts.map((product) => product.id).join(",")}
        />

        <s-stack direction="block" gap="base">
          {errors.form && (
            <s-section>
              <s-paragraph>{errors.form[0]}</s-paragraph>
            </s-section>
          )}

          <s-section heading="Scheme details">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-text-field
                name="name"
                label="Scheme name"
                defaultValue={scheme?.name ?? ""}
                error={errors.name?.[0]}
                required
              />
              <s-number-field
                name="durationMonths"
                label="Contribution months"
                defaultValue={String(scheme?.durationMonths ?? 9)}
                error={errors.durationMonths?.[0]}
                required
              />
            </s-grid>
          </s-section>

          <s-section heading="Bonus">
            <s-switch
              ref={bonusSwitchRef}
              name="bonusEnabled"
              label="Bonus month"
              defaultChecked={scheme?.bonusEnabled ?? false}
              details="Covers one extra month's contribution as a bonus at the end of the plan"
            />
            {bonusEnabled && (
              <s-number-field
                name="bonusMonths"
                label="Bonus months"
                defaultValue={String(scheme?.bonusMonths ?? 1)}
                error={errors.bonusMonths?.[0]}
                min={1}
                required
              />
            )}
          </s-section>

          <s-section heading="Contribution range">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-number-field
                name="minAmount"
                label="Minimum monthly contribution"
                defaultValue={String(scheme?.minAmount ?? 2000)}
                error={errors.minAmount?.[0]}
                required
              />
              <s-number-field
                name="maxAmount"
                label="Maximum monthly contribution"
                defaultValue={String(scheme?.maxAmount ?? 19000)}
                error={errors.maxAmount?.[0]}
                required
              />
              <s-text-field
                name="presetAmounts"
                label="Quick select amounts (comma separated)"
                defaultValue={presetAmountsDefault}
                error={errors.presetAmounts?.[0]}
                details="Example: 3000, 5000, 10000, 19000"
              />
              <s-number-field
                name="popularAmount"
                label="Featured / Popular preset amount"
                defaultValue={String(scheme?.popularAmount ?? 10000)}
                error={errors.popularAmount?.[0]}
                details="Displays the 'POPULAR' badge on this preset amount button"
              />
            </s-grid>
          </s-section>

          <s-section heading="Free gift">
            <s-switch
              ref={giftSwitchRef}
              name="giftEnabled"
              label="Free gift"
              defaultChecked={scheme?.giftEnabled ?? false}
              details="Offer a free gift to customers who reach the minimum contribution below"
            />

            {giftEnabled && (
              <>
                <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                  <s-text-field
                    name="giftName"
                    label="Gift name"
                    defaultValue={scheme?.giftName ?? "Free Diamond Pendant"}
                    error={errors.giftName?.[0]}
                    required
                  />
                  <s-number-field
                    name="giftValue"
                    label="Gift value"
                    defaultValue={String(scheme?.giftValue ?? 10000)}
                    error={errors.giftValue?.[0]}
                    min={1}
                    required
                  />
                </s-grid>

                <input type="hidden" name="giftImageUrl" value={giftImageUrl} />

                {giftImageUrl ? (
                  <s-stack direction="inline" gap="base" alignItems="center">
                    <s-thumbnail
                      src={giftImageUrl}
                      alt="Gift image"
                      size="base"
                    />
                    <s-button
                      type="button"
                      variant="tertiary"
                      tone="critical"
                      onClick={removeGiftImage}
                    >
                      Remove image
                    </s-button>
                  </s-stack>
                ) : (
                  <>
                    <s-drop-zone
                      ref={bindDropZone}
                      label="Gift image"
                      accessibilityLabel="Upload a gift image"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      disabled={giftImageUploading}
                      error={giftImageError || errors.giftImageUrl?.[0]}
                    />
                    <s-paragraph color="subdued">
                      {giftImageUploading
                        ? "Uploading…"
                        : "Shown in the gift card on the storefront. JPEG, PNG, GIF, or WEBP, up to 5MB."}
                    </s-paragraph>
                  </>
                )}

                <s-number-field
                  name="giftMinAmount"
                  label="Minimum contribution to unlock gift"
                  defaultValue={String(scheme?.giftMinAmount ?? "")}
                  error={errors.giftMinAmount?.[0]}
                  details="Leave empty to give this gift for all eligible plans"
                />
              </>
            )}
          </s-section>

          <s-section heading="Early redemption flexibility">
            <s-paragraph>
              Show customers early redemption estimated values (e.g. 7th, 8th,
              9th, 10th Month) if they redeem early.
            </s-paragraph>
            <s-switch
              ref={earlyRedemptionSwitchRef}
              name="earlyRedemptionEnabled"
              label="Enable early redemption schedule"
              defaultChecked={scheme?.earlyRedemptionEnabled ?? true}
            />
            {earlyRedemptionEnabled && (
              <s-number-field
                name="earlyRedemptionMinMonths"
                label="Eligible after (months)"
                defaultValue={String(scheme?.earlyRedemptionMinMonths ?? 6)}
                error={errors.earlyRedemptionMinMonths?.[0]}
                min={1}
                details="e.g. 6 means early redemption options are calculated starting from Month 7"
                required
              />
            )}
          </s-section>

          <s-section heading="Style & Terms">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-text-field
                name="currencySymbol"
                label="Currency symbol"
                defaultValue={scheme?.currencySymbol || defaultCurrencySymbol}
                details={`Store currency: ${shopCurrencyCode} (${defaultCurrencySymbol})`}
                error={errors.currencySymbol?.[0]}
                required
              />
              <s-color-field
                name="primaryColor"
                label="Primary color"
                defaultValue={scheme?.primaryColor ?? "#5C4642"}
                error={errors.primaryColor?.[0]}
                details="Used for the slider, buttons, and highlights on the storefront calculator"
                required
              />
            </s-grid>
            <s-text-field
              name="termsText"
              label="Terms & Conditions agreement text"
              defaultValue={
                scheme?.termsText ??
                "I agree to Terms & Conditions of Lucira Jewelry."
              }
              error={errors.termsText?.[0]}
              details="Shown beside the mandatory agreement checkbox on the storefront"
            />
          </s-section>

          <s-section heading="Assigned products">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <s-paragraph>
                Select the products where this savings scheme calculator should
                appear on the storefront.
              </s-paragraph>
              <s-button type="button" onClick={pickProducts}>
                {selectedProducts.length > 0
                  ? "Edit selection"
                  : "Select products"}
              </s-button>
            </div>

            {errors.productIds && (
              <div
                style={{
                  marginBottom: "12px",
                  color: "#d72c0d",
                  fontSize: "14px",
                }}
              >
                {errors.productIds[0]}
              </div>
            )}

            {selectedProducts.length === 0 ? (
              <s-paragraph color="subdued">
                No products assigned yet. The savings scheme widget will not
                appear on the storefront until at least one product is assigned.
              </s-paragraph>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <s-paragraph>
                  <strong>{selectedProducts.length}</strong> product
                  {selectedProducts.length === 1 ? "" : "s"} selected
                </s-paragraph>
                <div
                  style={{
                    border: "1px solid #e1e3e5",
                    borderRadius: "8px",
                    overflow: "hidden",
                    backgroundColor: "#ffffff",
                  }}
                >
                  {selectedProducts.map((product, index) => (
                    <div
                      key={product.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderTop: index > 0 ? "1px solid #f1f2f3" : "none",
                        gap: "12px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          minWidth: 0,
                        }}
                      >
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.title}
                            style={{
                              width: "40px",
                              height: "40px",
                              objectFit: "cover",
                              borderRadius: "6px",
                              border: "1px solid #e1e3e5",
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "40px",
                              height: "40px",
                              borderRadius: "6px",
                              backgroundColor: "#f4f6f8",
                              border: "1px solid #e1e3e5",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "18px",
                              flexShrink: 0,
                            }}
                          >
                            📦
                          </div>
                        )}
                        <span
                          style={{
                            fontSize: "14px",
                            fontWeight: 500,
                            color: "#202223",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {product.title}
                        </span>
                      </div>

                      <s-button
                        type="button"
                        variant="tertiary"
                        tone="critical"
                        onClick={() => removeProduct(product.id)}
                      >
                        Remove
                      </s-button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </s-section>
        </s-stack>
      </fetcher.Form>

      <s-button
        slot="primary-action"
        onClick={() => {
          if (formRef.current) {
            fetcher.submit(formRef.current);
          }
        }}
        {...(isSaving ? { loading: true } : {})}
      >
        Save Scheme
      </s-button>
    </s-page>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
