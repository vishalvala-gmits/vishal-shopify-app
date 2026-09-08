import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Mandatory Shopify compliance webhook. Shopify requires a 200-series
// response acknowledging receipt within 30 days; this app has no persisted
// direct link to Shopify customer records (enquiries store name/email/phone
// as free text, not a Shopify customer ID), so there is no automated export
// step to perform here beyond acknowledging the request. See
// docs/SECURITY.md for the manual data-lookup procedure if a merchant needs
// the underlying SavingsEnquiry rows for this customer.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  return new Response();
};
