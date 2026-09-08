import { storefrontPublicRequest } from "../services/storefront.server";

// STEP 1 of the mobile Home API.
// Only "Featured Products" and "Categories" (Shopify collections) are implemented.
// Hero banner, FAQ, Instagram feed, advisor booking, and other sections are handled later.

type Money = { amount: string; currencyCode: string };
type Image = { url: string; altText: string | null };

type ProductNode = {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  featuredImage: Image | null;
  priceRange: { minVariantPrice: Money };
  availableForSale: boolean;
};

type CollectionNode = {
  id: string;
  title: string;
  handle: string;
  image: Image | null;
};

type HomeResponse = {
  products: { nodes: ProductNode[] };
  collections: { nodes: CollectionNode[] };
};

// Temporary rule: "Featured Products" = the first 10 products returned by Shopify.
// No metafield, tag, or dedicated collection currently marks products as "featured" -
// this needs a real selection rule once the Home Page design defines one.
const HOME_QUERY = `#graphql
  query MobileHome($productsFirst: Int!, $collectionsFirst: Int!) {
    products(first: $productsFirst) {
      nodes {
        id
        title
        handle
        vendor
        productType
        featuredImage {
          url
          altText
        }
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        availableForSale
      }
    }
    collections(first: $collectionsFirst) {
      nodes {
        id
        title
        handle
        image {
          url
          altText
        }
      }
    }
  }
`;

export const loader = async () => {

  let data: HomeResponse;
  try {
    data = await storefrontPublicRequest<HomeResponse>(HOME_QUERY, {
      productsFirst: 10,
      collectionsFirst: 10,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load home data",
      },
      { status: 502 },
    );
  }

  const featuredProducts = data.products.nodes.map((node) => ({
    id: node.id,
    title: node.title,
    handle: node.handle,
    vendor: node.vendor,
    productType: node.productType,
    image: node.featuredImage
      ? { url: node.featuredImage.url, altText: node.featuredImage.altText }
      : null,
    price: {
      amount: node.priceRange.minVariantPrice.amount,
      currencyCode: node.priceRange.minVariantPrice.currencyCode,
    },
    availableForSale: node.availableForSale,
  }));

  // NOTE: these are raw Shopify collections, not a curated Home Page category list.
  // The final mapping between Shopify collections and Home Page categories is TBD.
  const categories = data.collections.nodes.map((node) => ({
    id: node.id,
    title: node.title,
    handle: node.handle,
    image: node.image ? { url: node.image.url, altText: node.image.altText } : null,
  }));

  return Response.json({
    success: true,
    featuredProducts,
    categories,
  });
};
      