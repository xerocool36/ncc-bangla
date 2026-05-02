-- NCC Bangla registration leads table
-- Prefixed ncc_bangla_ to avoid collisions with other projects in the shared review-management Supabase project

CREATE TABLE IF NOT EXISTS ncc_bangla_registrations (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ncc_bangla_registrations_created_idx
    ON ncc_bangla_registrations (created_at DESC);

ALTER TABLE ncc_bangla_registrations ENABLE ROW LEVEL SECURITY;
