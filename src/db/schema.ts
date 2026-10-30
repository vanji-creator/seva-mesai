import {
  boolean,
  customType,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { DocReading } from "@/lib/docs/read";
import type { Finding, Suggestion } from "@/lib/types";

export const officers = pgTable("officers", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  nameTa: text("name_ta").notNull(),
  role: text("role").$type<"officer" | "supervisor">().notNull(),
  office: text("office").notNull(),
  officeTa: text("office_ta").notNull(),
});

export const applications = pgTable("applications", {
  id: serial("id").primaryKey(),
  refNo: text("ref_no").notNull().unique(),
  type: text("type").$type<"patta" | "grievance">().notNull(),
  applicantName: text("applicant_name").notNull(),
  applicantNameTa: text("applicant_name_ta").notNull(),
  village: text("village").notNull(),
  villageTa: text("village_ta").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
  slaDueAt: timestamp("sla_due_at", { withTimezone: true }).notNull(),
  status: text("status")
    .$type<"pending" | "approved" | "rejected" | "returned">()
    .notNull()
    .default("pending"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  /** Intake pre-check counts (deterministic verifier) – drive queue priority. */
  blockers: integer("blockers").notNull().default(0),
  warnings: integer("warnings").notNull().default(0),
  /** 1 normal, 2 high, 3 critical (grievances; patta stays 1). */
  urgency: integer("urgency").notNull().default(1),
});

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/**
 * Every file attached to a case. Seeded (citizen) files are static under /case-docs; files an officer
 * uploads are kept in the row itself (small, fictional demo data; avoids a separate blob store).
 */
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  /** What the document is (from Classify): application_form, sale_deed, patta, ec, tax_receipt, id_proof, petition, other. */
  kind: text("kind").notNull(),
  fileName: text("file_name").notNull(),
  mime: text("mime").notNull(),
  /** Static file URL (seeded) — or null when the bytes are stored in `data`. */
  url: text("url"),
  previewUrl: text("preview_url"),
  data: bytea("data"),
  source: text("source").$type<"citizen" | "officer">().notNull().default("citizen"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  /** What Sarvam read from it (Classify + Extract, or OCR + translation for petitions). */
  reading: jsonb("reading").$type<DocReading>(),
});

export const aiAnalyses = pgTable("ai_analyses", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  locale: text("locale").notNull(),
  summary: text("summary").notNull(),
  findings: jsonb("findings").$type<Finding[]>().notNull(),
  suggestion: text("suggestion").$type<Suggestion>().notNull(),
  reasons: jsonb("reasons").$type<string[]>().notNull(),
  draftReply: text("draft_reply"),
  source: text("source").$type<"llm" | "rules">().notNull(),
  model: text("model"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const decisions = pgTable("decisions", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  officerId: integer("officer_id")
    .notNull()
    .references(() => officers.id),
  /** A decision, or "reopened" when a decided case is sent back to the desk. */
  action: text("action").$type<"approved" | "rejected" | "returned" | "reopened">().notNull(),
  reason: text("reason"),
  aiSuggestion: text("ai_suggestion").$type<Suggestion>(),
  followedAi: boolean("followed_ai"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Mock "other department" registries. In production these are API calls.
export const regSaleDeeds = pgTable("reg_sale_deeds", {
  deedNo: text("deed_no").primaryKey(),
  seller: text("seller").notNull(),
  buyer: text("buyer").notNull(),
  surveyNo: text("survey_no").notNull(),
  extentCents: integer("extent_cents").notNull(),
  registeredOn: timestamp("registered_on", { withTimezone: true }).notNull(),
});

export const regLandRecords = pgTable("reg_land_records", {
  surveyNo: text("survey_no").primaryKey(),
  pattaNo: text("patta_no"),
  currentOwner: text("current_owner").notNull(),
  extentCents: integer("extent_cents").notNull(),
  landClass: text("land_class").notNull(),
});

export const regTaxReceipts = pgTable("reg_tax_receipts", {
  receiptNo: text("receipt_no").primaryKey(),
  surveyNo: text("survey_no").notNull(),
  paidUpToYear: integer("paid_up_to_year").notNull(),
  duesAmount: integer("dues_amount").notNull(),
});

export const regEncumbrances = pgTable("reg_encumbrances", {
  id: serial("id").primaryKey(),
  surveyNo: text("survey_no").notNull(),
  kind: text("kind").$type<"mortgage" | "litigation" | "none">().notNull(),
  detail: text("detail").notNull(),
});
