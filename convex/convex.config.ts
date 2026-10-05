import { defineApp } from "convex/server";
import { v } from "convex/values";
import betterAuth from "@convex-dev/better-auth/convex.config";

const app = defineApp({
  env: {
    // Public URL of the Next.js app (e.g. http://localhost:3000). Used as the
    // Better Auth trusted origin and to build links in notifications.
    SITE_URL: v.string(),
    BETTER_AUTH_SECRET: v.string(),
    // SMS provider: "twilio" (default) or "log" (dev/tests, nothing is sent).
    SMS_PROVIDER: v.optional(v.string()),
    TWILIO_ACCOUNT_SID: v.optional(v.string()),
    TWILIO_AUTH_TOKEN: v.optional(v.string()),
    // Sender phone number (E.164) or Messaging Service SID ("MG…").
    TWILIO_FROM: v.optional(v.string()),
  },
});
app.use(betterAuth);

export default app;
