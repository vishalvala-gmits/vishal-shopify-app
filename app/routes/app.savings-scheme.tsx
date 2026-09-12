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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    setImageError(undefined);
    setImageUploading(true);

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
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  const removeImage = () => {
    setImageUrl("");
    setImageError(undefined);
  };

  const nameError = errors[`gifts.${index - 1}.name`]?.[0];
  const valueError = errors[`gifts.${index - 1}.value`]?.[0];
  const minAmountError = errors[`gifts.${index - 1}.minAmount`]?.[0];
  const maxAmountError = errors[`gifts.${index - 1}.maxAmount`]?.[0];

  return (
    <div className="jss-form-stack">
      <label className="jss-switch-row" htmlFor={`${prefix}Enabled`} aria-label={`Gift ${index}`}>
        <input
          type="checkbox"
          id={`${prefix}Enabled`}
          name={`${prefix}Enabled`}
          defaultChecked={gift?.enabled ?? false}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span className="jss-switch-track" />
        <span className="jss-switch-label">
          <strong>Gift {index}</strong>
          <span className="jss-field-hint">
            {index === 1
              ? "Offer a free gift to customers who reach the minimum contribution below"
              : "Offer a second free gift with its own unlock threshold"}
          </span>
        </span>
      </label>

      {enabled && (
        <>
          <div className="jss-field-grid-2">
            <div className="jss-field">
              <label htmlFor={`${prefix}Name`}>Gift name *</label>
              <input type="text" id={`${prefix}Name`} name={`${prefix}Name`} defaultValue={gift?.name ?? ""} required />
              {nameError && <span className="jss-field-error">{nameError}</span>}
            </div>
            <div className="jss-field">
              <label htmlFor={`${prefix}Value`}>Gift value *</label>
              <input type="number" id={`${prefix}Value`} name={`${prefix}Value`} defaultValue={gift?.value ?? ""} min={1} required />
              {valueError && <span className="jss-field-error">{valueError}</span>}
            </div>
          </div>

          <input type="hidden" name={`${prefix}ImageUrl`} value={imageUrl} />

          <div className="jss-field">
            <span className="jss-field-label-text">Gift image</span>
            {imageUrl ? (
              <div className="jss-image-preview">
                <img src={imageUrl} alt="Gift" />
                <button type="button" className="jss-btn jss-btn-danger-text" onClick={removeImage}>
                  Remove image
                </button>
              </div>
            ) : (
              <>
                <label className="jss-dropzone" htmlFor={`${prefix}Image`}>
                  <input
                    ref={fileInputRef}
                    id={`${prefix}Image`}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    disabled={imageUploading}
                    onChange={handleImageChange}
                  />
                  <span>{imageUploading ? "Uploading…" : "Click or drop an image here"}</span>
                </label>
                <span className="jss-field-hint">
                  Shown in the gift card on the storefront. JPEG, PNG, GIF, or WEBP, up to 5MB.
                </span>
                {imageError && <span className="jss-field-error">{imageError}</span>}
              </>
            )}
          </div>

          <div className="jss-field-grid-2">
            <div className="jss-field">
              <label htmlFor={`${prefix}MinAmount`}>Minimum contribution to unlock gift</label>
              <input type="number" id={`${prefix}MinAmount`} name={`${prefix}MinAmount`} defaultValue={gift?.minAmount ?? ""} />
              <span className="jss-field-hint">Leave empty to give this gift for all eligible plans</span>
              {minAmountError && <span className="jss-field-error">{minAmountError}</span>}
            </div>
            <div className="jss-field">
              <label htmlFor={`${prefix}MaxAmount`}>Maximum contribution to unlock gift</label>
              <input type="number" id={`${prefix}MaxAmount`} name={`${prefix}MaxAmount`} defaultValue={gift?.maxAmount ?? ""} />
              <span className="jss-field-hint">Optional — leave empty for no upper limit</span>
              {maxAmountError && <span className="jss-field-error">{maxAmountError}</span>}
            </div>
          </div>
        </>
      )}
    </div>
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
    <div className="jss-dash">
      <style>{SETTINGS_CSS}</style>

      <div className="jss-dash-topbar">
        <h1 className="jss-dash-title">Savings Scheme</h1>
        <button
          type="button"
          className="jss-btn jss-btn-primary"
          disabled={isSaving}
          onClick={() => {
            if (formRef.current) {
              fetcher.submit(formRef.current);
            }
          }}
        >
          {isSaving ? "Saving…" : "Save scheme"}
        </button>
      </div>

      <fetcher.Form method="post" id="savings-scheme-form" ref={formRef}>
        <input type="hidden" name="schemeId" value={scheme?.id ?? ""} />

        <div className="jss-form-page">
          {errors.form && (
            <div className="jss-dash-banner jss-dash-banner-error">
              <strong>Couldn&apos;t save scheme</strong>
              <p>{errors.form[0]}</p>
            </div>
          )}

          <div className="jss-dash-card">
            <div className="jss-dash-card-head">
              <h2>Scheme details</h2>
            </div>
            <div className="jss-dash-card-body jss-form-stack">
              <p className="jss-muted-p">
                Name the plan and set how many months customers contribute
                for. The plan always includes one bonus month, fully covered
                by you, at the end of the contribution period.
              </p>
              <div className="jss-field-grid-2">
                <div className="jss-field">
                  <label htmlFor="name">Scheme name *</label>
                  <input type="text" id="name" name="name" defaultValue={scheme?.name ?? ""} required />
                  {errors.name?.[0] && <span className="jss-field-error">{errors.name[0]}</span>}
                </div>
                <div className="jss-field">
                  <label htmlFor="durationMonths">Contribution months *</label>
                  <input
                    type="number"
                    id="durationMonths"
                    name="durationMonths"
                    defaultValue={scheme?.durationMonths ?? 9}
                    min={1}
                    required
                  />
                  {errors.durationMonths?.[0] && (
                    <span className="jss-field-error">{errors.durationMonths[0]}</span>
                  )}
                </div>
              </div>
              <div className="jss-field jss-field-half">
                <label htmlFor="bonusMonths">Bonus months *</label>
                <input
                  type="number"
                  id="bonusMonths"
                  name="bonusMonths"
                  defaultValue={scheme?.bonusMonths ?? 1}
                  min={1}
                  required
                />
                <span className="jss-field-hint">
                  Number of extra months covered as a bonus at the end of the plan
                </span>
                {errors.bonusMonths?.[0] && (
                  <span className="jss-field-error">{errors.bonusMonths[0]}</span>
                )}
              </div>
            </div>
          </div>

          <div className="jss-dash-card">
            <div className="jss-dash-card-head">
              <h2>Contribution range</h2>
            </div>
            <div className="jss-dash-card-body jss-form-stack">
              <p className="jss-muted-p">
                Set the allowed monthly contribution range and the quick-select
                amounts shown on the storefront calculator.
              </p>
              <div className="jss-field-grid-2">
                <div className="jss-field">
                  <label htmlFor="minAmount">Minimum monthly contribution *</label>
                  <input
                    type="number"
                    id="minAmount"
                    name="minAmount"
                    defaultValue={scheme?.minAmount ?? defaults.minAmount}
                    min={1}
                    required
                  />
                  {errors.minAmount?.[0] && (
                    <span className="jss-field-error">{errors.minAmount[0]}</span>
                  )}
                </div>
                <div className="jss-field">
                  <label htmlFor="maxAmount">Maximum monthly contribution *</label>
                  <input
                    type="number"
                    id="maxAmount"
                    name="maxAmount"
                    defaultValue={scheme?.maxAmount ?? defaults.maxAmount}
                    min={1}
                    required
                  />
                  {errors.maxAmount?.[0] && (
                    <span className="jss-field-error">{errors.maxAmount[0]}</span>
                  )}
                </div>
              </div>
              <div className="jss-field-grid-2">
                <div className="jss-field">
                  <label htmlFor="presetAmounts">Quick select amounts</label>
                  <input type="text" id="presetAmounts" name="presetAmounts" defaultValue={presetAmountsDefault} />
                  <span className="jss-field-hint">
                    Comma separated, up to 4 amounts, e.g. 10000, 30000, 50000, 80000
                  </span>
                  {errors.presetAmounts?.[0] && (
                    <span className="jss-field-error">{errors.presetAmounts[0]}</span>
                  )}
                </div>
                <div className="jss-field">
                  <label htmlFor="popularAmount">Featured / Popular preset amount</label>
                  <input type="number" id="popularAmount" name="popularAmount" defaultValue={scheme?.popularAmount ?? ""} />
                  <span className="jss-field-hint">
                    Displays the &apos;POPULAR&apos; badge on this preset amount button
                  </span>
                  {errors.popularAmount?.[0] && (
                    <span className="jss-field-error">{errors.popularAmount[0]}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="jss-dash-card">
            <div className="jss-dash-card-head">
              <h2>Free gift</h2>
            </div>
            <div className="jss-dash-card-body jss-form-stack-lg">
              <p className="jss-muted-p">
                Configure up to {MAX_GIFTS_DISPLAY} gifts, each with its own unlock threshold.
              </p>
              <GiftFields index={1} gift={gifts[0]} errors={errors} />
              <hr className="jss-divider" />
              <GiftFields index={2} gift={gifts[1]} errors={errors} />
            </div>
          </div>

          <div className="jss-dash-card">
            <div className="jss-dash-card-head">
              <h2>Early redemption flexibility</h2>
            </div>
            <div className="jss-dash-card-body jss-form-stack">
              <p className="jss-muted-p">
                Show customers early redemption estimated values (e.g. 7th,
                8th, 9th, 10th month) if they redeem early.
              </p>
              <label
                className="jss-switch-row"
                htmlFor="earlyRedemptionEnabled"
                aria-label="Enable early redemption schedule"
              >
                <input
                  type="checkbox"
                  id="earlyRedemptionEnabled"
                  name="earlyRedemptionEnabled"
                  defaultChecked={scheme?.earlyRedemptionEnabled ?? true}
                  onChange={(e) => setEarlyRedemptionEnabled(e.target.checked)}
                />
                <span className="jss-switch-track" />
                <span className="jss-switch-label">
                  <strong>Enable early redemption schedule</strong>
                </span>
              </label>
              {earlyRedemptionEnabled && (
                <div className="jss-field jss-field-half">
                  <label htmlFor="earlyRedemptionMinMonths">Eligible after (months) *</label>
                  <input
                    type="number"
                    id="earlyRedemptionMinMonths"
                    name="earlyRedemptionMinMonths"
                    defaultValue={scheme?.earlyRedemptionMinMonths ?? 8}
                    min={1}
                    required
                  />
                  <span className="jss-field-hint">
                    e.g. 6 means early redemption options are calculated starting from Month 7
                  </span>
                  {errors.earlyRedemptionMinMonths?.[0] && (
                    <span className="jss-field-error">{errors.earlyRedemptionMinMonths[0]}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="jss-dash-card">
            <div className="jss-dash-card-head">
              <h2>Style &amp; terms</h2>
            </div>
            <div className="jss-dash-card-body jss-form-stack">
              <div className="jss-field-grid-2">
                <div className="jss-field">
                  <label htmlFor="currencySymbol">Currency symbol *</label>
                  <input
                    type="text"
                    id="currencySymbol"
                    name="currencySymbol"
                    defaultValue={scheme?.currencySymbol || defaultCurrencySymbol}
                    required
                  />
                  <span className="jss-field-hint">
                    Store currency: {shopCurrencyCode} ({defaultCurrencySymbol})
                  </span>
                  {errors.currencySymbol?.[0] && (
                    <span className="jss-field-error">{errors.currencySymbol[0]}</span>
                  )}
                </div>
                <div className="jss-field">
                  <label htmlFor="primaryColor">Primary color *</label>
                  <div className="jss-color-field">
                    <input
                      type="color"
                      id="primaryColor"
                      name="primaryColor"
                      defaultValue={scheme?.primaryColor ?? "#5C4642"}
                    />
                  </div>
                  <span className="jss-field-hint">
                    Used for the slider, buttons, and highlights on the storefront calculator
                  </span>
                  {errors.primaryColor?.[0] && (
                    <span className="jss-field-error">{errors.primaryColor[0]}</span>
                  )}
                </div>
              </div>
              <div className="jss-field">
                <span className="jss-field-label-text">Terms &amp; conditions agreement text</span>
                <div className="jss-terms-box">
                  <span className="jss-muted-cell">{TERMS_TEXT_PREFIX_DISPLAY}</span>
                  <input
                    type="text"
                    name="termsTextSuffix"
                    defaultValue={termsTextSuffix}
                    required
                    aria-label="Shop name shown in the terms text"
                  />
                </div>
                <span className="jss-field-hint">
                  The &quot;{TERMS_TEXT_PREFIX_DISPLAY.trim()}&quot; text is
                  fixed; only the name shown at the end can be edited. Shown
                  beside the mandatory agreement checkbox on the storefront.
                </span>
                {errors.termsText?.[0] && (
                  <span className="jss-field-error">{errors.termsText[0]}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </fetcher.Form>
    </div>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

const SETTINGS_CSS = `
.jss-dash {
  --gold: #C5A059;
  --gold-hover: #B28F47;
  --dark: #1C1917;
  --surface: #FFFFFF;
  --canvas: #FBFBF9;
  --border: #EAE6DF;
  --border-muted: #F1EFEA;
  --muted: #78716C;
  font-family: "Plus Jakarta Sans", Inter, system-ui, -apple-system, sans-serif;
  color: var(--dark);
  background: var(--canvas);
  padding: 32px clamp(16px, 4vw, 48px) 48px;
  max-width: 1280px;
  margin: 0 auto;
}
.jss-dash * { box-sizing: border-box; }
.jss-dash-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: -32px calc(-1 * clamp(16px, 4vw, 48px)) 20px;
  padding: 20px clamp(16px, 4vw, 48px);
  background: rgba(251, 251, 249, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
}
.jss-dash-title { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }

.jss-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}
.jss-btn-primary { background: var(--dark); color: #fff; border-color: rgba(197, 160, 89, 0.3); }
.jss-btn-primary:hover { background: #2C2724; }
.jss-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.jss-btn-danger-text { background: none; border: none; color: #DC2626; font-weight: 500; padding: 0; }
.jss-btn-danger-text:hover { text-decoration: underline; }

.jss-form-page { display: flex; flex-direction: column; gap: 20px; }

.jss-dash-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 4px 20px -2px rgba(28, 25, 23, 0.04), 0 1px 3px 0 rgba(28, 25, 23, 0.02);
}
.jss-dash-card-head { padding: 20px 24px; border-bottom: 1px solid var(--border-muted); }
.jss-dash-card-head h2 { font-size: 15px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
.jss-dash-card-body { padding: 20px 24px; }

.jss-muted-p { font-size: 13px; color: var(--muted); margin: 0; line-height: 1.5; }
.jss-muted-cell { font-size: 13px; color: #57534E; white-space: nowrap; }

.jss-form-stack { display: flex; flex-direction: column; gap: 16px; }
.jss-form-stack-lg { display: flex; flex-direction: column; gap: 24px; }

.jss-field-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 600px) { .jss-field-grid-2 { grid-template-columns: 1fr; } }
.jss-field { display: flex; flex-direction: column; gap: 4px; }
.jss-field-half { max-width: 50%; }
@media (max-width: 600px) { .jss-field-half { max-width: 100%; } }
.jss-field label,
.jss-field-label-text { font-size: 13px; font-weight: 500; color: #292524; }
.jss-field input[type="text"],
.jss-field input[type="number"] {
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fff;
  color: var(--dark);
  outline: none;
}
.jss-field input:focus { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
.jss-field-hint { font-size: 11px; color: #A8A29E; }
.jss-field-error { font-size: 12px; color: #DC2626; }

.jss-switch-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  position: relative;
  padding-left: 44px;
}
.jss-switch-row input[type="checkbox"] {
  position: absolute;
  left: 0;
  top: 2px;
  width: 34px;
  height: 20px;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.jss-switch-track {
  position: absolute;
  left: 0;
  top: 2px;
  width: 34px;
  height: 20px;
  border-radius: 9999px;
  background: #E7E5E4;
  transition: background 0.15s ease;
}
.jss-switch-track::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
  transition: transform 0.15s ease;
}
.jss-switch-row input:checked + .jss-switch-track { background: var(--gold); }
.jss-switch-row input:checked + .jss-switch-track::after { transform: translateX(14px); }
.jss-switch-label { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
.jss-switch-label strong { font-weight: 600; color: #1C1917; }

.jss-image-preview { display: flex; align-items: center; gap: 12px; }
.jss-image-preview img { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); }

.jss-dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  border: 1.5px dashed var(--border);
  border-radius: 8px;
  background: #FAFAF9;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
  text-align: center;
}
.jss-dropzone:hover { border-color: var(--gold); background: #FCFAF6; }
.jss-dropzone input[type="file"] { display: none; }

.jss-divider { border: none; border-top: 1px solid var(--border-muted); margin: 0; }

.jss-color-field input[type="color"] {
  width: 100%;
  height: 38px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}

.jss-terms-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #FAFAF9;
}
.jss-terms-box input {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  outline: none;
  background: #fff;
}
.jss-terms-box input:focus { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }

.jss-dash-banner {
  border-radius: 8px;
  padding: 14px 16px;
  font-size: 13px;
}
.jss-dash-banner-error { background: #FEF2F2; border: 1px solid #FECACA; color: #991B1B; }
.jss-dash-banner-error p { margin: 6px 0 0; }
`;
