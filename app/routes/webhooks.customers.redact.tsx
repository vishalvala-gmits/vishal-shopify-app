import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

type CustomersRedactPayload = {
  shop_id: number;
  shop_domain: string;
  customer: { id: number; email?: string; phone?: string };
  orders_to_redact: number[];
};

// Mandatory Shopify compliance webhook. Must acknowledge with a 200-series
// response and redact matching customer data within 30 days. This app has
// no Shopify customer ID stored anywhere (enquiries are free-text contact
// details), so matching is done on email/phone against SavingsEnquiry rows
// for this shop.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const { customer } = payload as CustomersRedactPayload;
  const email = customer?.email?.trim();
  const phone = customer?.phone?.trim();

  if (email || phone) {
    await db.savingsEnquiry.deleteMany({
      where: {
        shop,
        OR: [
          ...(email ? [{ customerEmail: email }] : []),
          ...(phone ? [{ customerPhone: phone }] : []),
        ],
      },
    });
  }

  return new Response();
};
