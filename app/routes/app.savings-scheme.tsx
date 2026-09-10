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
  TERMS_TEXT_PREFIX,
  getSchemeForShop,
  parseGifts,
  resolveSchemeDefaults,
  shopNameFromDomain,
  stripTermsTextPrefix,
  upsertSchemeForShop,
} from "../services/savingsScheme.server";
import type { Gift } from "../services/savingsSchemeCalculator.server";
import { validateSavingsSchemeInput } from "../services/savingsSchemeValidation.server";
import type { SchemeValidationErrors } from "../services/savingsSchemeValidation.server";

// Duplicated from savingsScheme.server's MAX_GIFTS / TERMS_TEXT_PREFIX rather
// than imported for use in the client-rendered component below, so this
// route module never pulls a `.server.ts` value import into the browser
// bundle (React Router only strips server code reached exclusively through
// loader/action).
const MAX_GIFTS_DISPLAY = 2;
const TERMS_TEXT_PREFIX_DISPLAY = "I agree to Terms & Conditions of ";

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

  let shopCurrencyCode = "INR";
  let defaultCurrencySymbol = "₹";
  let shopDisplayName = shopNameFromDomain(session.shop);

  try {
    const response = await admin.graphql(
      `#graphql
        query GetShopForDefaults {
          shop {
            name
            currencyCode
          }
        }
      `,
    );
    const json = await response.json();
    if (json.data?.shop?.name) {
      shopDisplayName = json.data.shop.name;
    }
    if (json.data?.shop?.currencyCode) {
      shopCurrencyCode = json.data.shop.currencyCode;
      defaultCurrencySymbol = getCurrencySymbol(shopCurrencyCode);
    }
  } catch (error) {
    console.error("Failed to load shop info:", error);
  }

  // Defaults are for DISPLAY only when no scheme exists yet — nothing is
  // written to the database until the merchant saves the form.
  const defaults = resolveSchemeDefaults({
    existing: scheme,
    shopDisplayName,
    submitted: {},
  });

  const gifts = parseGifts(scheme?.gifts);

  // Only the part after the fixed "I agree to Terms & Conditions of " prefix
  // is ever shown/editable in the admin field.
  const termsTextSuffix = stripTermsTextPrefix(
    scheme?.termsText ?? defaults.termsText ?? "",
  );

  return {
    scheme,
    gifts,
    defaults,
    termsTextSuffix,
    defaultCurrencySymbol,
    shopCurrencyCode,
  };
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

function parseGiftFromForm(formData: FormData, index: number): Gift {
  const prefix = `gift${index}`;
  const enabled = formData.get(`${prefix}Enabled`) === "on";
  const name = String(formData.get(`${prefix}Name`) ?? "");
  const value = Number(formData.get(`${prefix}Value`) ?? 0);
  const imageUrl = String(formData.get(`${prefix}ImageUrl`) ?? "");
  const minAmountRaw = formData.get(`${prefix}MinAmount`);
  const minAmount = minAmountRaw ? Number(minAmountRaw) : null;
  const maxAmountRaw = formData.get(`${prefix}MaxAmount`);
  const maxAmount = maxAmountRaw ? Number(maxAmountRaw) : null;

  return {
    enabled,
    name: enabled ? name : null,
    value: enabled ? value : null,
    imageUrl: enabled && imageUrl.trim().length > 0 ? imageUrl.trim() : null,
    minAmount: enabled ? minAmount : null,
    maxAmount: enabled ? maxAmount : null,
  };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const submitted = Object.fromEntries(formData.entries()) as Record<
    string,
    string
  >;

  const existing = await getSchemeForShop(session.shop);

  const name = String(formData.get("name") ?? "");
  const durationMonths = Number(formData.get("durationMonths"));
  // Bonus month is always on — every scheme includes a mandatory bonus
  // month, there is no merchant-facing enable/disable toggle for it.
  const bonusEnabled = true;
  const bonusMonths = Number(formData.get("bonusMonths") ?? 0);

  const minAmountRaw = formData.get("minAmount");
  const maxAmountRaw = formData.get("maxAmount");
  const presetAmountsRaw = String(formData.get("presetAmounts") ?? "").trim();

  const termsTextSuffixRaw = String(formData.get("termsTextSuffix") ?? "").trim();

  let shopDisplayName = shopNameFromDomain(session.shop);
  try {
    const response = await admin.graphql(`#graphql
      query GetShopNameForDefaults {
        shop { name }
      }
    `);
    const json = await response.json();
    if (json.data?.shop?.name) {
      shopDisplayName = json.data.shop.name;
    }
  } catch (error) {
    console.error("Failed to load shop name for terms default:", error);
  }

  const defaults = resolveSchemeDefaults({
    existing,
    shopDisplayName,
    submitted: {
      minAmount: minAmountRaw ? Number(minAmountRaw) : undefined,
      maxAmount: maxAmountRaw ? Number(maxAmountRaw) : undefined,
      presetAmounts:
        presetAmountsRaw.length > 0 ? parseAmounts(presetAmountsRaw) : undefined,
      termsText:
        termsTextSuffixRaw.length > 0
          ? `${TERMS_TEXT_PREFIX}${termsTextSuffixRaw}`
          : null,
    },
  });

  const minAmount = defaults.minAmount;
  const maxAmount = defaults.maxAmount;
  const presetAmounts = defaults.presetAmounts;
  const termsText = defaults.termsText;

  const gifts: Gift[] = [
    parseGiftFromForm(formData, 1),
    parseGiftFromForm(formData, 2),
  ];

  const popularAmount = formData.get("popularAmount")
    ? Number(formData.get("popularAmount"))
    : null;
  const earlyRedemptionEnabled =
    formData.get("earlyRedemptionEnabled") === "on";
  const earlyRedemptionMinMonths = Number(
    formData.get("earlyRedemptionMinMonths") ?? 6,
  );

  const currencySymbol = String(formData.get("currencySymbol") ?? "");
  const primaryColor = String(formData.get("primaryColor") ?? "");
  const schemeId = formData.get("schemeId")
    ? String(formData.get("schemeId"))
    : null;

  const errors = validateSavingsSchemeInput({
    name,
    durationMonths,
    bonusEnabled,
    bonusMonths,
    minAmount,
    maxAmount,
    presetAmounts,
    gifts,
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
    await upsertSchemeForShop(session.shop, schemeId, {
      name,
      durationMonths,
      bonusEnabled,
      bonusMonths,
      minAmount,
      maxAmount,
      presetAmounts,
      gifts,
      popularAmount,
      earlyRedemptionEnabled,
      earlyRedemptionMinMonths,
      termsText,
      currencySymbol,
      primaryColor,
      status: "active",
    });

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

type GiftFieldsProps = {
  index: 1 | 2;
  gift: Gift | undefined;
  errors: SchemeValidationErrors;
};

function GiftFields({ index, gift, errors }: GiftFieldsProps) {
  const prefix = `gift${index}`;
  const [enabled, setEnabled] = useState(gift?.enabled ?? false);
  const [imageUrl, setImageUrl] = useState(gift?.imageUrl ?? "");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | undefined>(undefined);

  type DropZoneEl = HTMLElement & {
    value?: string;
    disabled?: boolean;
    files?: File[];
  };
  const dropZoneRef = useRef<DropZoneEl | null>(null);

  const switchRef = useCallback((node: Element | null) => {
    if (!node) return;
    const handler = (event: Event) => {
      const target = event.currentTarget as unknown as { checked?: boolean };
      setEnabled(Boolean(target.checked));
    };
    node.addEventListener("change", handler);
    return () => node.removeEventListener("change", handler);
  }, []);

  const handleImageChange = useCallback(async (event: Event) => {
    const target = event.currentTarget as unknown as DropZoneEl;
    const file = target.files?.[0];
    if (!file) return;

    setImageError(undefined);
    setImageUploading(true);
    if (dropZoneRef.current) dropZoneRef.current.disabled = true;

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/app/api/upload-gift-image", {
        method: "POST",
        body,
      });
      let result: { success: boolean; message?: string; url?: string };
      try {
        result = await response.json();
      } catch {
        throw new Error("Upload failed. Please try again.");
      }
      if (!result.success) {
        throw new Error(result.message || "Upload failed. Please try again.");
      }
      setImageUrl(result.url!);
    } catch (error) {
      setImageError(
        error instanceof Error
          ? error.message
          : "Upload failed. Please try again.",
      );
    } finally {
      setImageUploading(false);
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
      node.addEventListener("change", handleImageChange);
      return () => node.removeEventListener("change", handleImageChange);
    },
    [handleImageChange],
  );

  const removeImage = () => {
    setImageUrl("");
    setImageError(undefined);
  };

  const nameError = errors[`gifts.${index - 1}.name`]?.[0];
  const valueError = errors[`gifts.${index - 1}.value`]?.[0];
  const minAmountError = errors[`gifts.${index - 1}.minAmount`]?.[0];
  const maxAmountError = errors[`gifts.${index - 1}.maxAmount`]?.[0];

  return (
    <s-stack direction="block" gap="base">
      <s-switch
        ref={switchRef}
        name={`${prefix}Enabled`}
        label={`Gift ${index}`}
        defaultChecked={gift?.enabled ?? false}
        details={
          index === 1
            ? "Offer a free gift to customers who reach the minimum contribution below"
            : "Offer a second free gift with its own unlock threshold"
        }
      />

      {enabled && (
        <>
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <s-text-field
              name={`${prefix}Name`}
              label="Gift name"
              defaultValue={gift?.name ?? ""}
              error={nameError}
              required
            />
            <s-number-field
              name={`${prefix}Value`}
              label="Gift value"
              defaultValue={String(gift?.value ?? "")}
              error={valueError}
              min={1}
              required
            />
          </s-grid>

          <input type="hidden" name={`${prefix}ImageUrl`} value={imageUrl} />

          <s-stack direction="block" gap="small-200">
            <s-text type="strong">Gift image</s-text>
            {imageUrl ? (
              <s-box
                padding="base"
                borderWidth="small"
                borderColor="subdued"
                borderRadius="base"
              >
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-thumbnail src={imageUrl} alt="Gift image" size="base" />
                  <s-button
                    type="button"
                    variant="tertiary"
                    tone="critical"
                    onClick={removeImage}
                  >
                    Remove image
                  </s-button>
                </s-stack>
              </s-box>
            ) : (
              <>
                <s-drop-zone
                  ref={bindDropZone}
                  label="Gift image"
                  labelAccessibilityVisibility="exclusive"
                  accessibilityLabel={`Upload gift ${index} image`}
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  disabled={imageUploading}
                  error={imageError}
                />
                <s-paragraph color="subdued">
                  {imageUploading
                    ? "Uploading…"
                    : "Shown in the gift card on the storefront. JPEG, PNG, GIF, or WEBP, up to 5MB."}
                </s-paragraph>
              </>
            )}
          </s-stack>

          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <s-number-field
              name={`${prefix}MinAmount`}
              label="Minimum contribution to unlock gift"
              defaultValue={String(gift?.minAmount ?? "")}
              error={minAmountError}
              details="Leave empty to give this gift for all eligible plans"
            />
            <s-number-field
              name={`${prefix}MaxAmount`}
              label="Maximum contribution to unlock gift"
              defaultValue={String(gift?.maxAmount ?? "")}
              error={maxAmountError}
              details="Optional — leave empty for no upper limit"
            />
          </s-grid>
        </>
      )}
    </s-stack>
  );
}

export default function SavingsSchemeSettings() {
  const {
    scheme,
    gifts,
    defaults,
    termsTextSuffix,
    defaultCurrencySymbol,
    shopCurrencyCode,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();
  const shopify = useAppBridge();
  const formRef = useRef<HTMLFormElement>(null);

  const [earlyRedemptionEnabled, setEarlyRedemptionEnabled] = useState(
    scheme?.earlyRedemptionEnabled ?? true,
  );

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

  const earlyRedemptionSwitchRef = useCallback(
    (node: Element | null) =>
      attachSwitchListener(node, setEarlyRedemptionEnabled),
    [],
  );

  const isSaving = fetcher.state !== "idle";
  const result = fetcher.data;
  const errors = result && !result.success ? result.errors : {};

  useEffect(() => {
    if (result?.success) {
      shopify.toast.show("Scheme saved successfully");
    }
  }, [result, shopify]);

  const presetAmountsDefault = (
    Array.isArray(scheme?.presetAmounts) && scheme.presetAmounts.length > 0
      ? (scheme.presetAmounts as number[])
      : defaults.presetAmounts
  ).join(", ");

  return (
    <s-page heading="Savings Scheme" inlineSize="large">
      <fetcher.Form method="post" id="savings-scheme-form" ref={formRef}>
        <input type="hidden" name="schemeId" value={scheme?.id ?? ""} />

        <s-stack direction="block" gap="large">
          {errors.form && (
            <s-banner tone="critical" heading="Couldn't save scheme">
              <s-paragraph>{errors.form[0]}</s-paragraph>
            </s-banner>
          )}

          <s-section heading="Scheme details">
            <s-stack direction="block" gap="base">
              <s-paragraph color="subdued">
                Name the plan and set how many months customers contribute
                for. The plan always includes one bonus month, fully covered
                by you, at the end of the contribution period.
              </s-paragraph>
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
                  min={1}
                  required
                />
              </s-grid>
              <s-box maxInlineSize="50%">
                <s-number-field
                  name="bonusMonths"
                  label="Bonus months"
                  defaultValue={String(scheme?.bonusMonths ?? 1)}
                  error={errors.bonusMonths?.[0]}
                  details="Number of extra months covered as a bonus at the end of the plan"
                  min={1}
                  required
                />
              </s-box>
            </s-stack>
          </s-section>

          <s-section heading="Contribution range">
            <s-stack direction="block" gap="base">
              <s-paragraph color="subdued">
                Set the allowed monthly contribution range and the quick-select
                amounts shown on the storefront calculator.
              </s-paragraph>
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-number-field
                  name="minAmount"
                  label="Minimum monthly contribution"
                  defaultValue={String(scheme?.minAmount ?? defaults.minAmount)}
                  error={errors.minAmount?.[0]}
                  min={1}
                  required
                />
                <s-number-field
                  name="maxAmount"
                  label="Maximum monthly contribution"
                  defaultValue={String(scheme?.maxAmount ?? defaults.maxAmount)}
                  error={errors.maxAmount?.[0]}
                  min={1}
                  required
                />
              </s-grid>
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-text-field
                  name="presetAmounts"
                  label="Quick select amounts"
                  defaultValue={presetAmountsDefault}
                  error={errors.presetAmounts?.[0]}
                  details="Comma separated, e.g. 10000, 30000, 50000, 80000"
                />
                <s-number-field
                  name="popularAmount"
                  label="Featured / Popular preset amount"
                  defaultValue={String(scheme?.popularAmount ?? "")}
                  error={errors.popularAmount?.[0]}
                  details="Displays the 'POPULAR' badge on this preset amount button"
                />
              </s-grid>
            </s-stack>
          </s-section>

          <s-section heading="Free gift">
            <s-stack direction="block" gap="large">
              <s-paragraph color="subdued">
                Configure up to {MAX_GIFTS_DISPLAY} gifts, each with its own unlock
                threshold.
              </s-paragraph>
              <GiftFields index={1} gift={gifts[0]} errors={errors} />
              <s-divider />
              <GiftFields index={2} gift={gifts[1]} errors={errors} />
            </s-stack>
          </s-section>

          <s-section heading="Early redemption flexibility">
            <s-stack direction="block" gap="base">
              <s-paragraph color="subdued">
                Show customers early redemption estimated values (e.g. 7th,
                8th, 9th, 10th month) if they redeem early.
              </s-paragraph>
              <s-switch
                ref={earlyRedemptionSwitchRef}
                name="earlyRedemptionEnabled"
                label="Enable early redemption schedule"
                defaultChecked={scheme?.earlyRedemptionEnabled ?? true}
              />
              {earlyRedemptionEnabled && (
                <s-box maxInlineSize="50%">
                  <s-number-field
                    name="earlyRedemptionMinMonths"
                    label="Eligible after (months)"
                    defaultValue={String(
                      scheme?.earlyRedemptionMinMonths ?? 6,
                    )}
                    error={errors.earlyRedemptionMinMonths?.[0]}
                    min={1}
                    details="e.g. 6 means early redemption options are calculated starting from Month 7"
                    required
                  />
                </s-box>
              )}
            </s-stack>
          </s-section>

          <s-section heading="Style & terms">
            <s-stack direction="block" gap="base">
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
              <s-stack direction="block" gap="small-200">
                <s-text type="strong">Terms & conditions agreement text</s-text>
                <s-box
                  padding="small-300"
                  borderWidth="small"
                  borderColor="subdued"
                  borderRadius="base"
                >
                  <s-stack direction="inline" gap="small-200" alignItems="center">
                    <s-text color="subdued">{TERMS_TEXT_PREFIX_DISPLAY}</s-text>
                    <s-box minInlineSize="40%">
                      <s-text-field
                        name="termsTextSuffix"
                        label="Shop name shown in the terms text"
                        labelAccessibilityVisibility="exclusive"
                        defaultValue={termsTextSuffix}
                        error={errors.termsText?.[0]}
                        required
                      />
                    </s-box>
                  </s-stack>
                </s-box>
                <s-paragraph color="subdued">
                  The &quot;{TERMS_TEXT_PREFIX_DISPLAY.trim()}&quot; text is
                  fixed; only the name shown at the end can be edited. Shown
                  beside the mandatory agreement checkbox on the storefront.
                </s-paragraph>
              </s-stack>
            </s-stack>
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
