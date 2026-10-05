import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const roleValidator = v.union(v.literal("admin"), v.literal("member"));

export const priorityValidator = v.union(
  v.literal("baja"),
  v.literal("media"),
  v.literal("alta"),
  v.literal("urgente"),
);

// External channels an admin can enable.
export const channelIdValidator = v.literal("sms");

// Deliveries also keep historical WhatsApp rows (shown as "WhatsApp (antiguo)").
export const deliveryChannelValidator = v.union(v.literal("whatsapp_link"), v.literal("sms"));

export const providerIdValidator = v.union(v.literal("twilio"), v.literal("log"));

export const notificationKindValidator = v.union(
  v.literal("assigned"),
  v.literal("status_changed"),
  v.literal("stage_reached"),
  v.literal("commented"),
  v.literal("deadline_soon"),
  v.literal("overdue"),
);

export const deliveryStateValidator = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("failed"),
  v.literal("dismissed"),
);

export const activityKindValidator = v.union(
  v.literal("created"),
  v.literal("title"),
  v.literal("description"),
  v.literal("status"),
  v.literal("assignee"),
  v.literal("priority"),
  v.literal("deadline"),
  v.literal("customer"),
  v.literal("customer_notice"),
  v.literal("comment_deleted"),
);

export default defineSchema({
  settings: defineTable({
    appName: v.string(),
    timezone: v.string(),
    reminderLeadHours: v.number(),
    enabledChannels: v.array(channelIdValidator),
  }),

  // App-owned profile, linked to the Better Auth user (see design §2).
  users: defineTable({
    authUserId: v.string(),
    email: v.string(), // lowercased
    name: v.string(),
    role: roleValidator,
    isActive: v.boolean(),
    phone: v.optional(v.string()), // E.164; contact data only, never sent SMS
  })
    .index("by_authUserId", ["authUserId"])
    .index("by_email", ["email"])
    .index("by_role_and_isActive", ["role", "isActive"]),

  // Written right before an account is created server-side; consumed by the
  // Better Auth user.onCreate trigger (see design §9).
  pendingAccounts: defineTable({
    email: v.string(),
    name: v.string(),
    role: roleValidator,
    phone: v.optional(v.string()),
    isBootstrap: v.boolean(),
  }).index("by_email", ["email"]),

  boards: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    isArchived: v.boolean(),
  }).index("by_isArchived", ["isArchived"]),

  boardMembers: defineTable({
    boardId: v.id("boards"),
    userId: v.id("users"),
  })
    .index("by_boardId_and_userId", ["boardId", "userId"])
    .index("by_userId", ["userId"]),

  boardStatuses: defineTable({
    boardId: v.id("boards"),
    name: v.string(),
    order: v.number(),
    isDone: v.boolean(),
  }).index("by_boardId_and_order", ["boardId", "order"]),
  // Stage notification rule: at most one per status (see design §5).
  statusRules: defineTable({
    boardId: v.id("boards"),
    statusId: v.id("boardStatuses"),
    notifyAssignee: v.boolean(),
    notifyCreator: v.boolean(),
    userIds: v.array(v.id("users")), // at most 20
    // "Avisar al cliente": entering the status offers a customer SMS (absent = false).
    notifyCustomer: v.optional(v.boolean()),
    customerTemplate: v.optional(v.string()),
  }).index("by_statusId", ["statusId"]),

  tasks: defineTable({
    boardId: v.id("boards"),
    statusId: v.id("boardStatuses"),
    title: v.string(),
    description: v.optional(v.string()),
    assigneeId: v.optional(v.id("users")),
    creatorId: v.id("users"),
    priority: priorityValidator,
    order: v.number(),
    deadlineAt: v.optional(v.number()),
    deadlineHasTime: v.boolean(),
    completedAt: v.optional(v.number()),
    isOpen: v.boolean(),
    reminderSentFor: v.optional(v.number()),
    overdueSentFor: v.optional(v.number()),
    customerName: v.optional(v.string()),
    customerPhone: v.optional(v.string()), // E.164
    // Estimated arrival window from the last customer notice, as local strings
    // in the app timezone: "YYYY-MM-DD", "HH:mm" and an optional end "HH:mm".
    etaDate: v.optional(v.string()),
    etaFrom: v.optional(v.string()),
    etaTo: v.optional(v.string()),
  })
    .index("by_boardId_and_statusId_and_order", ["boardId", "statusId", "order"])
    .index("by_boardId_and_isOpen_and_deadlineAt", ["boardId", "isOpen", "deadlineAt"])
    .index("by_boardId_and_assigneeId", ["boardId", "assigneeId"])
    .index("by_assigneeId_and_isOpen_and_deadlineAt", ["assigneeId", "isOpen", "deadlineAt"])
    .index("by_isOpen_and_deadlineAt", ["isOpen", "deadlineAt"])
    .searchIndex("search_title", { searchField: "title", filterFields: ["boardId"] }),

  comments: defineTable({
    taskId: v.id("tasks"),
    authorId: v.id("users"),
    body: v.string(),
    editedAt: v.optional(v.number()),
  }).index("by_taskId", ["taskId"]),

  activity: defineTable({
    taskId: v.id("tasks"),
    actorId: v.id("users"),
    kind: activityKindValidator,
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  }).index("by_taskId", ["taskId"]),

  notifications: defineTable({
    userId: v.id("users"),
    kind: notificationKindValidator,
    taskId: v.id("tasks"),
    actorId: v.optional(v.id("users")),
    text: v.string(),
    readAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_readAt", ["userId", "readAt"])
    .index("by_taskId", ["taskId"]),

  // One external message. Customer notices carry `taskId` and no notification
  // or user; rows without `recipient` are legacy sends to team members.
  deliveries: defineTable({
    notificationId: v.optional(v.id("notifications")),
    userId: v.optional(v.id("users")),
    taskId: v.optional(v.id("tasks")),
    recipient: v.optional(v.union(v.literal("user"), v.literal("customer"))),
    recipientName: v.optional(v.string()), // customer name when the message was created
    channel: deliveryChannelValidator,
    state: deliveryStateValidator,
    provider: v.optional(providerIdValidator),
    to: v.optional(v.string()), // E.164 number the message is sent to
    message: v.string(),
    error: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
    attempts: v.optional(v.number()),
    // Set while a send is in flight; a pending row with claimedAt is not re-sent.
    claimedAt: v.optional(v.number()),
  })
    .index("by_notificationId", ["notificationId"])
    .index("by_taskId", ["taskId"])
    .index("by_providerMessageId", ["providerMessageId"]),
});
