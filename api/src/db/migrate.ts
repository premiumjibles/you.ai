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
      file_type TEXT NOT NULL CHECK (file_type IN ('csv', 'mbox', 'ics')),
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
  console.log("Database migrations complete");
}
