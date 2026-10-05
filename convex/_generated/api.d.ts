/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as auth from "../auth.js";
import type * as boards from "../boards.js";
import type * as comments from "../comments.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_customerMessage from "../lib/customerMessage.js";
import type * as lib_deadline from "../lib/deadline.js";
import type * as lib_settings from "../lib/settings.js";
import type * as lib_taskOrder from "../lib/taskOrder.js";
import type * as lib_taskState from "../lib/taskState.js";
import type * as lib_validation from "../lib/validation.js";
import type * as migrations from "../migrations.js";
import type * as notifications_channels from "../notifications/channels.js";
import type * as notifications_channels_sms from "../notifications/channels/sms.js";
import type * as notifications_customer from "../notifications/customer.js";
import type * as notifications_deliveries from "../notifications/deliveries.js";
import type * as notifications_inbox from "../notifications/inbox.js";
import type * as notifications_notify from "../notifications/notify.js";
import type * as notifications_providers_callback from "../notifications/providers/callback.js";
import type * as notifications_providers_index from "../notifications/providers/index.js";
import type * as notifications_providers_log from "../notifications/providers/log.js";
import type * as notifications_providers_twilio from "../notifications/providers/twilio.js";
import type * as notifications_providers_types from "../notifications/providers/types.js";
import type * as notifications_send from "../notifications/send.js";
import type * as notifications_stage from "../notifications/stage.js";
import type * as reminders from "../reminders.js";
import type * as settings from "../settings.js";
import type * as tasks from "../tasks.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  auth: typeof auth;
  boards: typeof boards;
  comments: typeof comments;
  crons: typeof crons;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/activity": typeof lib_activity;
  "lib/customerMessage": typeof lib_customerMessage;
  "lib/deadline": typeof lib_deadline;
  "lib/settings": typeof lib_settings;
  "lib/taskOrder": typeof lib_taskOrder;
  "lib/taskState": typeof lib_taskState;
  "lib/validation": typeof lib_validation;
  migrations: typeof migrations;
  "notifications/channels": typeof notifications_channels;
  "notifications/channels/sms": typeof notifications_channels_sms;
  "notifications/customer": typeof notifications_customer;
  "notifications/deliveries": typeof notifications_deliveries;
  "notifications/inbox": typeof notifications_inbox;
  "notifications/notify": typeof notifications_notify;
  "notifications/providers/callback": typeof notifications_providers_callback;
  "notifications/providers/index": typeof notifications_providers_index;
  "notifications/providers/log": typeof notifications_providers_log;
  "notifications/providers/twilio": typeof notifications_providers_twilio;
  "notifications/providers/types": typeof notifications_providers_types;
  "notifications/send": typeof notifications_send;
  "notifications/stage": typeof notifications_stage;
  reminders: typeof reminders;
  settings: typeof settings;
  tasks: typeof tasks;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
