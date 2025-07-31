import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const feedbacks = pgTable("feedbacks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull(),
  description: text("description"),
  impactLevel: text("impact_level"),
  feedbackType: text("feedback_type").notNull(),
  fileName: text("file_name"),
  fileUrl: text("file_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertFeedbackSchema = createInsertSchema(feedbacks).pick({
  companyName: true,
  description: true,
  impactLevel: true,
  feedbackType: true,
  fileName: true,
  fileUrl: true,
}).extend({
  companyName: z.string().min(1, "Nome da empresa é obrigatório"),
  feedbackType: z.string().min(1, "Tipo de feedback é obrigatório"),
  description: z.string().optional(),
  impactLevel: z.string().optional(),
  fileName: z.string().optional(),
  fileUrl: z.string().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedbacks.$inferSelect;
