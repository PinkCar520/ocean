BEGIN;

CREATE TABLE bodies (
    id text PRIMARY KEY,
    last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE capability_leases (
    body_id text NOT NULL REFERENCES bodies(id),
    capability text NOT NULL,
    descriptor jsonb NOT NULL,
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (body_id, capability)
);

CREATE INDEX capability_leases_available_idx
    ON capability_leases (capability, expires_at);

CREATE TABLE permission_decisions (
    plan_id text NOT NULL,
    plan_revision integer NOT NULL,
    subject_id text NOT NULL REFERENCES identities(id),
    capability text NOT NULL,
    purpose text NOT NULL,
    decision text NOT NULL CHECK (decision IN ('allow', 'confirmed', 'authenticated', 'deny')),
    reason text NOT NULL,
    decided_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (plan_id, plan_revision)
);

ALTER TABLE permission_decisions
    ADD CONSTRAINT permission_decisions_action_binding_key
    UNIQUE (plan_id, plan_revision, subject_id, capability, decision);

ALTER TABLE actions ADD COLUMN plan_id text;
ALTER TABLE actions ADD COLUMN permission_decision text;
ALTER TABLE actions
    ADD CONSTRAINT actions_plan_id_present
    CHECK (plan_id IS NOT NULL) NOT VALID;
ALTER TABLE actions
    ADD CONSTRAINT actions_permission_decision_valid
    CHECK (
        permission_decision IS NOT NULL
        AND permission_decision IN ('allow', 'confirmed', 'authenticated')
    ) NOT VALID;
ALTER TABLE actions
    ADD CONSTRAINT actions_permission_decision_binding
    FOREIGN KEY (plan_id, plan_revision, subject_id, capability, permission_decision)
    REFERENCES permission_decisions (
        plan_id, plan_revision, subject_id, capability, decision
    ) NOT VALID;

COMMIT;
