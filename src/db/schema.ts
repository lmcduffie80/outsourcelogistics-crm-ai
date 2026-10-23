import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { InquiryExtraction } from "@/lib/ai/schemas";

export const roleEnum = pgEnum("role", ["rep", "manager", "admin"]);

export const inquiryStatusEnum = pgEnum("inquiry_status", [
  "new",
  "draft_ready",
  "needs_reply",
  "responded",
  "converted",
  "closed",
]);

export const serviceTypeEnum = pgEnum("service_type", [
  "warehousing",
  "transportation",
  "port_services",
  "transloading",
  "value_added",
  "other",
]);

export const priorityEnum = pgEnum("priority", ["low", "normal", "high", "urgent"]);

export const directionEnum = pgEnum("message_direction", ["inbound", "outbound"]);

export const sentByEnum = pgEnum("sent_by", ["customer", "system", "ai", "rep"]);

export const draftStatusEnum = pgEnum("draft_status", ["pending", "sent", "discarded"]);

export const orderStatusEnum = pgEnum("order_status", [
  "booked",
  "in_progress",
  "completed",
  "cancelled",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull().default("rep"),
  entraOid: text("entra_oid").unique(),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...timestamps,
});

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  company: text("company"),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export const inquiries = pgTable(
  "inquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: serial("number").notNull().unique(),
    subject: text("subject").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    assignedRepId: uuid("assigned_rep_id").references(() => users.id, { onDelete: "set null" }),
    status: inquiryStatusEnum("status").notNull().default("new"),
    serviceType: serviceTypeEnum("service_type").notNull().default("other"),
    priority: priorityEnum("priority").notNull().default("normal"),
    summary: text("summary"),
    extracted: jsonb("extracted").$type<InquiryExtraction>(),
    conversationId: text("conversation_id"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    ackSentAt: timestamp("ack_sent_at", { withTimezone: true }),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    lastOutboundAt: timestamp("last_outbound_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("inquiries_conversation_idx").on(t.conversationId),
    index("inquiries_rep_status_idx").on(t.assignedRepId, t.status),
    index("inquiries_received_idx").on(t.receivedAt),
  ],
);

export const aiDrafts = pgTable(
  "ai_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inquiryId: uuid("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    generatedText: text("generated_text").notNull(),
    finalText: text("final_text"),
    editDistance: integer("edit_distance"),
    editRatio: real("edit_ratio"),
    status: draftStatusEnum("status").notNull().default("pending"),
    requestedById: uuid("requested_by_id").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("ai_drafts_inquiry_idx").on(t.inquiryId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inquiryId: uuid("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    direction: directionEnum("direction").notNull(),
    sentBy: sentByEnum("sent_by").notNull(),
    senderUserId: uuid("sender_user_id").references(() => users.id, { onDelete: "set null" }),
    aiDraftId: uuid("ai_draft_id").references(() => aiDrafts.id, { onDelete: "set null" }),
    fromAddress: text("from_address").notNull(),
    fromName: text("from_name"),
    toAddresses: text("to_addresses")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    bodyHtml: text("body_html"),
    graphMessageId: text("graph_message_id"),
    internetMessageId: text("internet_message_id").unique(),
    conversationId: text("conversation_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_inquiry_sent_idx").on(t.inquiryId, t.sentAt)],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: serial("number").notNull().unique(),
    externalRef: text("external_ref").unique(),
    inquiryId: uuid("inquiry_id").references(() => inquiries.id, { onDelete: "set null" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    repId: uuid("rep_id").references(() => users.id, { onDelete: "set null" }),
    serviceType: serviceTypeEnum("service_type").notNull().default("other"),
    status: orderStatusEnum("status").notNull().default("booked"),
    description: text("description"),
    origin: text("origin"),
    destination: text("destination"),
    value: numeric("value", { precision: 12, scale: 2, mode: "number" }),
    bookedAt: timestamp("booked_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("orders_status_completed_idx").on(t.status, t.completedAt),
    index("orders_rep_idx").on(t.repId),
  ],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inquiryId: uuid("inquiry_id").references(() => inquiries.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_inquiry_idx").on(t.inquiryId, t.createdAt)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const usersRelations = relations(users, ({ many }) => ({
  inquiries: many(inquiries),
  orders: many(orders),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  owner: one(users, { fields: [customers.ownerId], references: [users.id] }),
  inquiries: many(inquiries),
  orders: many(orders),
}));

export const inquiriesRelations = relations(inquiries, ({ one, many }) => ({
  customer: one(customers, { fields: [inquiries.customerId], references: [customers.id] }),
  assignedRep: one(users, { fields: [inquiries.assignedRepId], references: [users.id] }),
  messages: many(messages),
  drafts: many(aiDrafts),
  orders: many(orders),
  activity: many(activityLog),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  inquiry: one(inquiries, { fields: [messages.inquiryId], references: [inquiries.id] }),
  sender: one(users, { fields: [messages.senderUserId], references: [users.id] }),
  draft: one(aiDrafts, { fields: [messages.aiDraftId], references: [aiDrafts.id] }),
}));

export const aiDraftsRelations = relations(aiDrafts, ({ one }) => ({
  inquiry: one(inquiries, { fields: [aiDrafts.inquiryId], references: [inquiries.id] }),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  inquiry: one(inquiries, { fields: [orders.inquiryId], references: [inquiries.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  rep: one(users, { fields: [orders.repId], references: [users.id] }),
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  inquiry: one(inquiries, { fields: [activityLog.inquiryId], references: [inquiries.id] }),
  user: one(users, { fields: [activityLog.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type Customer = typeof customers.$inferSelect;
export type Inquiry = typeof inquiries.$inferSelect;
export type InquiryStatus = (typeof inquiryStatusEnum.enumValues)[number];
export type ServiceType = (typeof serviceTypeEnum.enumValues)[number];
export type Priority = (typeof priorityEnum.enumValues)[number];
export type Message = typeof messages.$inferSelect;
export type AiDraft = typeof aiDrafts.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
