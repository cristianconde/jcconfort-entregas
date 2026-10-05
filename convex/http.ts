import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { statusCallbackPath } from "./notifications/providers/callback";
import { PROVIDERS } from "./notifications/providers";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

// Delivery-status webhook per SMS provider, e.g. POST /sms/twilio/status.
for (const provider of Object.values(PROVIDERS)) {
  http.route({
    path: statusCallbackPath(provider.id),
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const update = await provider.parseStatusCallback(req);
      if (update === "invalid") return new Response("Invalid signature", { status: 403 });
      await ctx.runMutation(internal.notifications.send.applyStatus, update);
      return new Response(null, { status: 200 });
    }),
  });
}

export default http;
