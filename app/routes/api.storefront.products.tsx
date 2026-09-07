import { storefrontRequest } from "../services/storefront.server";

type StorefrontVariantNode = {
  id: string;
  title: string;
  price: { amount: string };
  sku: string | null;
};

type StorefrontProductNode = {
  id: string;
  title: string;
  handle: string;
  description: string;
  vendor: string;
  productType: string;
  variants: { nodes: StorefrontVariantNode[] };
};

type StorefrontProductsResponse = {
  products: {
    nodes: StorefrontProductNode[];
  };
};

const STOREFRONT_PRODUCTS_QUERY = `#graphql
  query StorefrontProductList($first: Int!) {
    products(first: $first) {
      nodes {
        id
        title
        handle
        description
        vendor
        productType
        variants(first: 10) {
          nodes {
            id
            title
            price {
              amount
            }
            sku
          }
        }
      }
    }
  }
`;

export const loader = async () => {
  try {
    const data = await storefrontRequest<StorefrontProductsResponse>(
      STOREFRONT_PRODUCTS_QUERY,
      { first: 10 },
    );

    const products = data.products.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      handle: node.handle,
      description: node.description,
      vendor: node.vendor,
      productType: node.productType,
      variants: node.variants.nodes.map((variant) => ({
        id: variant.id,
        title: variant.title,
        price: variant.price.amount,
        sku: variant.sku,
      })),
    }));

    return Response.json({ success: true, products });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch products",
      },
      { status: 502 },
    );
  }
};
