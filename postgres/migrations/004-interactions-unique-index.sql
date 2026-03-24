CREATE UNIQUE INDEX IF NOT EXISTS idx_interactions_contact_group_unique ON interactions (contact_id, group_id) WHERE group_id IS NOT NULL;
