import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function App() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Jewelry Savings Scheme</h1>
        <p className={styles.text}>
          Let customers save toward a future jewelry purchase with a
          merchant-configured savings plan, capturing enquiries right in your
          Shopify admin. Install this app from the Shopify App Store to get
          started.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Savings calculator</strong>. Show customers how their
            contributions grow toward a future purchase.
          </li>
          <li>
            <strong>Enquiry capture</strong>. Collect and review customer
            savings scheme enquiries directly in your Shopify admin.
          </li>
          <li>
            <strong>Theme app block</strong>. Add the widget to your storefront
            without editing any theme code.
          </li>
        </ul>
      </div>
    </div>
  );
}
