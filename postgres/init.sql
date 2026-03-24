-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Contacts
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    company TEXT,
    role TEXT,
    location TEXT,
    email TEXT,
    phone TEXT,
    linkedin_url TEXT,
    source_databases TEXT[] DEFAULT '{}',
    notes TEXT,
    last_interaction_date TIMESTAMPTZ,
    priority_ring INT DEFAULT 3 CHECK (priority_ring BETWEEN 1 AND 5),
    name_tsvector TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(name, ''))) STORED,
    full_tsvector TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english',
            coalesce(name, '') || ' ' ||
            coalesce(company, '') || ' ' ||
            coalesce(role, '') || ' ' ||
            coalesce(location, '') || ' ' ||
            coalesce(notes, '')
        )
    ) STORED,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Interactions
CREATE TABLE interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('email', 'meeting', 'whatsapp', 'linkedin', 'telegram')),
    date TIMESTAMPTZ NOT NULL,
    summary TEXT,
    raw_content TEXT,
    group_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sub-agents
CREATE TABLE sub_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL DEFAULT 'sean',
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    config JSONB DEFAULT '{}',
    workflow_id TEXT,
    schedule TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Briefings
CREATE TABLE briefings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL DEFAULT 'sean',
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    content TEXT NOT NULL,
    sub_agent_outputs JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    tool_use JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_contacts_name_trgm ON contacts USING gist (name gist_trgm_ops);
CREATE INDEX idx_contacts_full_tsvector ON contacts USING gin (full_tsvector);
CREATE INDEX idx_contacts_embedding ON contacts USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_contacts_email ON contacts (email) WHERE email IS NOT NULL;
CREATE INDEX idx_contacts_phone ON contacts (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_interactions_contact_id ON interactions (contact_id);
CREATE INDEX idx_interactions_date ON interactions (date DESC);
CREATE INDEX idx_interactions_group_id ON interactions (group_id) WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX idx_interactions_contact_group_unique ON interactions (contact_id, group_id) WHERE group_id IS NOT NULL;
CREATE INDEX idx_sub_agents_user_active ON sub_agents (user_id) WHERE active = true;
CREATE INDEX idx_briefings_user_date ON briefings (user_id, date DESC);
CREATE INDEX idx_chat_messages_session ON chat_messages (session_id, created_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sub_agents_updated_at
    BEFORE UPDATE ON sub_agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
