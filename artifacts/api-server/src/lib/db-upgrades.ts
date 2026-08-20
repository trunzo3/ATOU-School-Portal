/**
 * Idempotent schema upgrades, run once at server boot BEFORE the app starts
 * serving. The workspace database gets schema changes via drizzle push
 * during development, but a deployed (production) database only runs this —
 * so every statement here must be safe to run repeatedly and must bring an
 * older database up to what the code requires.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

export async function ensureDatabaseUpgrades(): Promise<void> {
  // Two-way Airtable sync bookkeeping (per-field last-synced baselines).
  await db.execute(sql`
    alter table schools add column if not exists airtable_sync_state jsonb
  `);
  // One school per Airtable workshop record; makes concurrent sync runs'
  // duplicate creates a no-op (insert ... on conflict do nothing).
  await db.execute(sql`
    do $$ begin
      if not exists (
        select 1 from pg_constraint where conname = 'schools_airtable_record_id_unique'
      ) then
        alter table schools
          add constraint schools_airtable_record_id_unique unique (airtable_record_id);
      end if;
    end $$
  `);
  logger.info("Database schema upgrades verified");
}
