ALTER TABLE interactions ADD COLUMN group_id TEXT;
CREATE INDEX idx_interactions_group_id ON interactions (group_id) WHERE group_id IS NOT NULL;
