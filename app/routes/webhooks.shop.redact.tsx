import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Mandatory Shopify compliance webhook, sent 48 hours after uninstall. Must
// acknowledge with a 200-series response and erase all data for this shop
// within 30 days. Sessions are already cleared by the app/uninstalled
// webhook, so this removes the shop's remaining scheme/enquiry data.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  await db.$transaction([
    db.savingsEnquiry.deleteMany({ where: { shop } }),
    db.savingsSchemeProduct.deleteMany({ where: { shop } }),
    db.savingsScheme.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);

  return new Response();
};
