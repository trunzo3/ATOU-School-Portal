import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  timestamp,
  date,
  jsonb,
} from "drizzle-orm/pg-core";

export const schoolsTable = pgTable("schools", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  workshopDate: date("workshop_date", { mode: "string" }),
  locked: boolean("locked").notNull().default(false),
  airtableRecordId: text("airtable_record_id"),
  // Read-only, pulled from the Airtable Workshops "Approx # Students" column.
  approxStudents: text("approx_students"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const contactsTable = pgTable("contacts", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id")
    .notNull()
    .references(() => schoolsTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
});

// Every save of a simple question is a new row; history is all rows.
export const answersTable = pgTable("answers", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id")
    .notNull()
    .references(() => schoolsTable.id, { onDelete: "cascade" }),
  questionKey: text("question_key").notNull(),
  value: text("value").notNull(),
  enteredBy: text("entered_by").notNull(),
  enteredAt: timestamp("entered_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TeacherRowData = {
  firstName: string;
  lastName: string;
  email: string;
  studentCount: number;
};

// Each save records the full teacher list as it stood at that moment.
export const teacherSnapshotsTable = pgTable("teacher_snapshots", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id")
    .notNull()
    .references(() => schoolsTable.id, { onDelete: "cascade" }),
  rows: jsonb("rows").$type<TeacherRowData[]>().notNull(),
  totalStudents: integer("total_students").notNull(),
  enteredBy: text("entered_by").notNull(),
  enteredAt: timestamp("entered_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// One row per school per send. `delivered` is false until a real email
// service (Resend) is connected — the send is still recorded in the log.
export const emailSendsTable = pgTable("email_sends", {
  id: serial("id").primaryKey(),
  schoolId: integer("school_id")
    .notNull()
    .references(() => schoolsTable.id, { onDelete: "cascade" }),
  recipients: jsonb("recipients").$type<string[]>().notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  isFollowUp: boolean("is_follow_up").notNull().default(false),
  delivered: boolean("delivered").notNull().default(false),
  sentBy: text("sent_by").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export type School = typeof schoolsTable.$inferSelect;
export type EmailSend = typeof emailSendsTable.$inferSelect;
export type Contact = typeof contactsTable.$inferSelect;
export type Answer = typeof answersTable.$inferSelect;
export type TeacherSnapshot = typeof teacherSnapshotsTable.$inferSelect;
