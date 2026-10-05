import type { Metadata } from "next";
import { DeliveryLog } from "./delivery-log";

export const metadata: Metadata = { title: "Envíos de SMS" };

export default function DeliveriesPage() {
  return <DeliveryLog />;
}
