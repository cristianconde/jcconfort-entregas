import type { Metadata } from "next";
import { Inbox } from "./inbox";

export const metadata: Metadata = { title: "Notificaciones" };

export default function NotificationsPage() {
  return <Inbox />;
}
