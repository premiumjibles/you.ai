import type { Pool } from "pg";

export async function runMigrations(db: Pool): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS outreach_drafts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
      message TEXT NOT NULL,
      context JSONB DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'sent', 'discarded')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS import_history (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL CHECK (file_type IN ('csv', 'mbox', 'ics', 'linkedin-messages')),
      records_imported INT DEFAULT 0,
      duplicates_merged INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS github_summaries (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      repo TEXT NOT NULL,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      summary TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(repo, date)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_outreach_drafts_status ON outreach_drafts(status);
    CREATE INDEX IF NOT EXISTS idx_import_history_created ON import_history(created_at DESC);

    DO $$ BEGIN
      CREATE TRIGGER outreach_drafts_updated_at
        BEFORE UPDATE ON outreach_drafts
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      CREATE TRIGGER app_settings_updated_at
        BEFORE UPDATE ON app_settings
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // Unique contact indexes (replace old non-unique ones)
  await db.query(`
    DROP INDEX IF EXISTS idx_contacts_email;
    DROP INDEX IF EXISTS idx_contacts_phone;
    DROP INDEX IF EXISTS idx_contacts_linkedin_url;
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_email_unique
      ON contacts (lower(email)) WHERE email IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_phone_unique
      ON contacts (phone) WHERE phone IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_linkedin_url_unique
      ON contacts (lower(linkedin_url)) WHERE linkedin_url IS NOT NULL;
  `);

  // Update import_history CHECK constraint to include linkedin-messages
  await db.query(`
    ALTER TABLE import_history DROP CONSTRAINT IF EXISTS import_history_file_type_check;
    ALTER TABLE import_history ADD CONSTRAINT import_history_file_type_check
      CHECK (file_type IN ('csv', 'mbox', 'ics', 'linkedin-messages'));
  `);

  console.log("Database migrations complete");
}
