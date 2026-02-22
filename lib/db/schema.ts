import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import type { AnalysisResult, EditorSnapshot } from "@/lib/types";

export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull().default("Untitled Document"),
  template: text("template").notNull().default("product_spec"),
  draftHtml: text("draft_html").notNull().default("<p></p>"),
  draftPlainText: text("draft_plain_text").notNull().default(""),
  snapshots: jsonb("snapshots").notNull().default([]).$type<EditorSnapshot[]>(),
  analysis: jsonb("analysis").default(null).$type<AnalysisResult | null>(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull(),
});

export type DocumentRow = typeof documents.$inferSelect;
export type DocumentInsert = typeof documents.$inferInsert;
