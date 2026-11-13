-- =============================================================================
-- Merilo — PostgreSQL / Supabase Production Cloud Architecture
-- Hackathon Track: Case 5 "THE EXPERIENCE GAP" (National Founder Cup)
-- =============================================================================
-- This schema models a scalable B2B verification engine where candidates prove
-- practical skills via micro-tasks, passing a 3-gate verification pipeline
-- (AST Parsing, Security Shield, and Gemini 2.5 Flash Structured Evaluation)
-- resulting in cryptographically signed, publicly verifiable Skill Cards.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Table: users
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'candidate' CHECK (role IN ('candidate', 'recruiter', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE users IS 'Registered platform users: candidates building verified portfolios and recruiters searching talent.';
COMMENT ON COLUMN users.id IS 'Unique UUID identifier of the user.';
COMMENT ON COLUMN users.password_hash IS 'PBKDF2-HMAC-SHA256 hashed password with 100,000 iterations.';
COMMENT ON COLUMN users.salt IS 'Cryptographically secure 16-byte random salt in hex representation.';
COMMENT ON COLUMN users.role IS 'User role: candidate, recruiter, or admin.';

-- -----------------------------------------------------------------------------
-- 2. Table: micro_tasks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS micro_tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    company_name TEXT NOT NULL,
    stack TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    description TEXT NOT NULL,
    rubric JSONB NOT NULL,
    buggy_code TEXT NOT NULL,
    preset_ideal TEXT NOT NULL,
    preset_vulnerable TEXT NOT NULL,
    preset_injection TEXT NOT NULL,
    preset_ideal_name TEXT NOT NULL DEFAULT 'Эталонная реализация',
    preset_vulnerable_name TEXT NOT NULL DEFAULT 'Базовая реализация',
    preset_injection_name TEXT NOT NULL DEFAULT 'Альтернативное решение',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE micro_tasks IS 'Real-world business micro-tasks from partner companies (FinTech, Logistics, EdTech) designed to close the Experience Gap.';
COMMENT ON COLUMN micro_tasks.id IS 'Slug identifier (e.g., task-fintech-01).';
COMMENT ON COLUMN micro_tasks.rubric IS 'Structured criteria for Gemini 2.5 Flash evaluation (clean_code, architecture, edge_cases).';

-- -----------------------------------------------------------------------------
-- 3. Table: submissions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id TEXT NOT NULL REFERENCES micro_tasks(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES users(id) ON DELETE SET NULL,
    candidate_name TEXT NOT NULL,
    submitted_code TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('verified', 'rejected', 'blocked')),
    gate_reached INT NOT NULL CHECK (gate_reached IN (1, 2, 3)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE submissions IS 'Candidate code submissions processed by the 3-gate verification engine.';
COMMENT ON COLUMN submissions.status IS 'Pipeline outcome: verified (passed), rejected (syntax error), or blocked (prompt injection).';
COMMENT ON COLUMN submissions.gate_reached IS 'Furthest pipeline gate reached: 1 (AST Parse), 2 (Security Shield), 3 (AI Evaluation).';

-- -----------------------------------------------------------------------------
-- 4. Table: evaluations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    clean_code INT NOT NULL CHECK (clean_code >= 0 AND clean_code <= 100),
    architecture INT NOT NULL CHECK (architecture >= 0 AND architecture <= 100),
    edge_cases INT NOT NULL CHECK (edge_cases >= 0 AND edge_cases <= 100),
    is_plagiarized_or_injected BOOLEAN NOT NULL DEFAULT false,
    executive_summary TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE evaluations IS 'Granular evaluation metrics emitted by Gemini 2.5 Flash structured output and fallback engine.';
COMMENT ON COLUMN evaluations.executive_summary IS 'Executive summary generated for hiring managers and recruiters.';

-- -----------------------------------------------------------------------------
-- 5. Table: skill_cards
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skill_cards (
    card_hash TEXT PRIMARY KEY,
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    candidate_name TEXT NOT NULL,
    task_id TEXT NOT NULL REFERENCES micro_tasks(id) ON DELETE CASCADE,
    total_score INT NOT NULL CHECK (total_score >= 0 AND total_score <= 100),
    badge_tier TEXT NOT NULL CHECK (badge_tier IN ('Gold Verified', 'Silver Verified', 'Needs Work', 'Rejected')),
    signature TEXT NOT NULL,
    verify_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE skill_cards IS 'Publicly shareable, cryptographically signed Skill Cards (SHA-256 hash + HMAC signature) embedded in candidate portfolios.';
COMMENT ON COLUMN skill_cards.card_hash IS 'First 12 chars of SHA-256 hash identifying the verification snapshot.';
COMMENT ON COLUMN skill_cards.signature IS 'HMAC-SHA256 signature binding the card hash, candidate user ID, and score to platform secret key.';

-- =============================================================================
-- Indexes for High Performance Querying
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_micro_tasks_company ON micro_tasks(company_name);
CREATE INDEX IF NOT EXISTS idx_submissions_task_id ON submissions(task_id);
CREATE INDEX IF NOT EXISTS idx_submissions_candidate_id ON submissions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evaluations_submission_id ON evaluations(submission_id);
CREATE INDEX IF NOT EXISTS idx_skill_cards_task_id ON skill_cards(task_id);
CREATE INDEX IF NOT EXISTS idx_skill_cards_user_id ON skill_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_skill_cards_candidate_name ON skill_cards(candidate_name);
CREATE INDEX IF NOT EXISTS idx_skill_cards_created_at ON skill_cards(created_at DESC);

-- =============================================================================
-- Row Level Security (RLS) & Policies
-- =============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE micro_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_cards ENABLE ROW LEVEL SECURITY;

-- Micro-tasks are publicly readable by anyone
CREATE POLICY "Allow public read access to micro_tasks"
    ON micro_tasks FOR SELECT
    USING (true);

-- Skill cards are publicly readable for tamper-proof verification by recruiters
CREATE POLICY "Allow public read access to skill_cards"
    ON skill_cards FOR SELECT
    USING (true);

-- Anyone can submit code for verification during demo / interview
CREATE POLICY "Allow anonymous submission creation"
    ON submissions FOR INSERT
    WITH CHECK (true);

-- Users can read their own submissions
CREATE POLICY "Allow candidates to read their own submissions"
    ON submissions FOR SELECT
    USING (auth.uid() = candidate_id OR candidate_id IS NULL);

-- Evaluations are readable by submission owners
CREATE POLICY "Allow read access to evaluations for submission owners"
    ON evaluations FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM submissions s
        WHERE s.id = evaluations.submission_id
        AND (s.candidate_id = auth.uid() OR s.candidate_id IS NULL)
    ));
