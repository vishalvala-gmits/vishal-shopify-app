import type { Config } from "@react-router/dev/config";

// Embedded Shopify admin apps are rendered inside an iframe on admin.shopify.com
// (and, for merchants on the older admin UI, the shop's own /admin host). Form
// submissions from inside that iframe carry an `Origin` header of the embedding
// page, not this app's own origin — which otherwise trips React Router's
// built-in CSRF origin check (`throwIfPotentialCSRFAttack`) and surfaces as a
// bare "Bad Request" from `singleFetchAction`, even though the request is
// entirely legitimate. The app's own host (dev tunnel or production
// application_url) also needs to be allowed since some Shopify embedding paths
// forward the request through a different effective origin than the server's
// own view of `request.url`.
const appHost = process.env.SHOPIFY_APP_URL
  ? new URL(process.env.SHOPIFY_APP_URL).host
  : undefined;

export default {
  allowedActionOrigins: [
    "admin.shopify.com",
    "*.myshopify.com",
    ...(appHost ? [appHost] : []),
  ],
} satisfies Config;
