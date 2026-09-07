import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

type ProductCreateInput = {
  title?: string;
  description?: string;
  vendor?: string;
};

type UserError = { field: string[] | null; message: string };

type ProductCreateResponse = {
  data?: {
    productCreate: {
      product: { id: string; title: string; status: string } | null;
      userErrors: UserError[];
    };
  };
  errors?: unknown;
};

const PRODUCT_CREATE_MUTATION = `#graphql
  mutation ProductCreate($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product {
        id
        title
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  const { admin } = await authenticate.admin(request);

  const body = (await request.json()) as ProductCreateInput;

  if (!body.title) {
    return Response.json(
      { success: false, error: "title is required" },
      { status: 400 },
    );
  }

  const response = await admin.graphql(PRODUCT_CREATE_MUTATION, {
    variables: {
      product: {
        title: body.title,
        descriptionHtml: body.description ?? "",
        vendor: body.vendor ?? "",
        status: "ACTIVE",
      },
    },
  });

  const { data, errors } = (await response.json()) as ProductCreateResponse;

  if (errors || !data) {
    return Response.json({ success: false, errors }, { status: 502 });
  }

  const { product, userErrors } = data.productCreate;

  if (userErrors.length > 0) {
    return Response.json({ success: false, userErrors }, { status: 422 });
  }

  if (!product) {
    return Response.json(
      { success: false, error: "Product was not created" },
      { status: 502 },
    );
  }

  return Response.json({
    success: true,
    product: {
      id: product.id,
      title: product.title,
      status: product.status,
    },
  });
};

type ProductVariantNode = {
  id: string;
  title: string;
  price: string;
  sku: string | null;
  barcode: string | null;
};

type ProductListNode = {
  id: string;
  title: string;
  handle: string;
  status: string;
  vendor: string;
  productType: string;
  createdAt: string;
  updatedAt: string;
  variants: { nodes: ProductVariantNode[] };
};

type ProductsListResponse = {
  data?: {
    products: { nodes: ProductListNode[] };
  };
  errors?: unknown;
};

const PRODUCTS_LIST_QUERY = `#graphql
  query ProductsList {
    products(first: 10) {
      nodes {
        id
        title
        handle
        status
        vendor
        productType
        createdAt
        updatedAt
        variants(first: 10) {
          nodes {
            id
            title
            price
            sku
            barcode
          }
        }
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(PRODUCTS_LIST_QUERY);

  const { data, errors } = (await response.json()) as ProductsListResponse;

  if (errors || !data) {
    return Response.json({ success: false, errors }, { status: 502 });
  }

  const products = data.products.nodes.map((node) => ({
    id: node.id,
    title: node.title,
    handle: node.handle,
    status: node.status,
    vendor: node.vendor,
    productType: node.productType,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    variants: node.variants.nodes.map((variant) => ({
      id: variant.id,
      title: variant.title,
      price: variant.price,
      sku: variant.sku,
      barcode: variant.barcode,
    })),
  }));

  return Response.json({ success: true, products });
};
