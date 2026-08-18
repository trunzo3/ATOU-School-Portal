import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const adminUsersTable = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const infoPagesTable = pgTable("info_pages", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  body: text("body").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  published: boolean("published").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Single-row key/value settings (email template, Airtable connection).
export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type AdminUser = typeof adminUsersTable.$inferSelect;
export type InfoPage = typeof infoPagesTable.$inferSelect;
