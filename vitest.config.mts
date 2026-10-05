import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/**/*.test.ts", "lib/**/*.test.ts"],
    env: {
      SITE_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
      CONVEX_SITE_URL: "https://test.convex.site",
      SMS_PROVIDER: "log",
      TWILIO_ACCOUNT_SID: "ACtest",
      TWILIO_AUTH_TOKEN: "test-auth-token",
      TWILIO_FROM: "+15005550006",
    },
  },
});
