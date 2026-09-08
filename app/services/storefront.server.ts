const STOREFRONT_API_VERSION = "2026-07";

type StorefrontGraphQLResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

export async function storefrontPublicRequest<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_STOREFRONT_PUBLIC_TOKEN;

  if (!storeDomain || !accessToken) {
    throw new Error(
      "Storefront API is not configured: missing SHOPIFY_STORE_DOMAIN or SHOPIFY_STOREFRONT_PUBLIC_TOKEN environment variable.",
    );
  }

  const response = await fetch(
    `https://${storeDomain}/api/${STOREFRONT_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  if (!response.ok) {
    throw new Error(`Storefront API request failed with status ${response.status}`);
  }

  const { data, errors } = (await response.json()) as StorefrontGraphQLResponse<T>;

  if (errors && errors.length > 0) {
    throw new Error(`Storefront API returned errors: ${errors.map((e) => e.message).join(", ")}`);
  }

  if (!data) {
    throw new Error("Storefront API returned no data.");
  }

  return data;
}
