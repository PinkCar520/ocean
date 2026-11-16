BEGIN;

CREATE TABLE identities (
    id text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE observations (
    id text PRIMARY KEY,
    schema_version integer NOT NULL,
    subject_id text NOT NULL REFERENCES identities(id),
    kind text NOT NULL,
    payload jsonb NOT NULL,
    source jsonb NOT NULL,
    observed_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL,
    valid_until timestamptz,
    confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    sensitivity text NOT NULL CHECK (sensitivity IN ('public', 'personal', 'sensitive', 'restricted')),
    permission_scope text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX observations_current_subject_idx
    ON observations (subject_id, valid_until, observed_at DESC);

CREATE TABLE tasks (
    id text PRIMARY KEY,
    subject_id text NOT NULL REFERENCES identities(id),
    raw_intent text NOT NULL,
    intent_revision integer NOT NULL DEFAULT 1,
    status text NOT NULL,
    summary text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE task_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id text NOT NULL REFERENCES tasks(id),
    event_type text NOT NULL,
    safe_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE permission_policies (
    id text NOT NULL,
    revision integer NOT NULL,
    subject_id text NOT NULL REFERENCES identities(id),
    capability text NOT NULL,
    purpose text NOT NULL,
    decision text NOT NULL CHECK (decision IN ('allow', 'confirm', 'authenticate', 'deny')),
    scope jsonb NOT NULL,
    valid_until timestamptz,
    revoked_at timestamptz,
    PRIMARY KEY (id, revision)
);

CREATE TABLE actions (
    id text PRIMARY KEY,
    request_id text NOT NULL UNIQUE,
    subject_id text NOT NULL REFERENCES identities(id),
    task_id text NOT NULL REFERENCES tasks(id),
    plan_revision integer NOT NULL,
    capability text NOT NULL,
    arguments jsonb NOT NULL,
    status text NOT NULL,
    provider_ref text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE action_attempts (
    id text PRIMARY KEY,
    action_id text NOT NULL REFERENCES actions(id),
    attempt_number integer NOT NULL,
    status text NOT NULL,
    provider_ref text,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (action_id, attempt_number)
);

CREATE TABLE action_receipts (
    action_id text PRIMARY KEY REFERENCES actions(id),
    status text NOT NULL,
    summary text NOT NULL,
    evidence jsonb NOT NULL,
    verified_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    topic text NOT NULL,
    aggregate_id text NOT NULL,
    payload jsonb NOT NULL,
    available_at timestamptz NOT NULL DEFAULT now(),
    claimed_until timestamptz,
    completed_at timestamptz,
    attempts integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbox_pending_idx
    ON outbox (available_at, id)
    WHERE completed_at IS NULL;

CREATE TABLE idempotency_keys (
    scope text NOT NULL,
    key text NOT NULL,
    request_hash text NOT NULL,
    response_status integer NOT NULL,
    response_body jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (scope, key)
);

COMMIT;
