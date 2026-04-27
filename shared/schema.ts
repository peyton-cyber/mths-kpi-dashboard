import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Departments that map to dashboard pages
export const DEPARTMENTS = [
  "all",           // Can see everything
  "acquisitions",
  "transactions",
  "dispositions",
  "lead_managers",
  "marketing",
  "leadership",
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  picture: text("picture"),
  // Comma-separated department list, e.g. "acquisitions,dispositions"
  // "all" = admin/leadership can see everything
  departments: text("departments").notNull().default("all"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  // Track logins
  lastLogin: text("last_login"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
