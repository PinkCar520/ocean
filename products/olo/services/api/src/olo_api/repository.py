from __future__ import annotations

import hashlib
import json
import os
from datetime import UTC, datetime
from typing import Any, Protocol

import psycopg
from olo_agent import AgentRuntime, Task
from olo_context import ContextEngine, Observation, ObservationConflict, ObservationSource
from olo_tools import Action, ActionStatus, ToolDescriptor, ToolGateway
from psycopg.rows import dict_row

from .models import (
    ActionCreateModel,
    ActionResultModel,
    CapabilityModel,
    IntentModel,
    ObservationModel,
    PermissionDecisionModel,
)


class RepositoryConflict(ValueError):
    pass


class RepositoryNotFound(LookupError):
    pass


class RepositoryPermissionDenied(PermissionError):
    pass


class ControlPlaneRepository(Protocol):
    def ingest_observation(self, model: ObservationModel, key: str) -> tuple[str, bool]: ...
    def current_context(self, subject_id: str) -> dict[str, object]: ...
    def create_intent(self, model: IntentModel, key: str) -> tuple[dict[str, object], bool]: ...
    def get_task(self, task_id: str) -> dict[str, object]: ...
    def register_capability(self, body_id: str, model: CapabilityModel) -> None: ...
    def decide_plan(self, plan_id: str, model: PermissionDecisionModel) -> None: ...
    def create_action(self, model: ActionCreateModel) -> tuple[dict[str, object], bool]: ...
    def transition_action(self, action_id: str, model: ActionResultModel) -> dict[str, object]: ...
    def action_receipt(self, action_id: str) -> dict[str, object]: ...


class InMemoryControlPlaneRepository:
    def __init__(self) -> None:
        self.context = ContextEngine()
        self.agent = AgentRuntime()
        self.tools = ToolGateway()
        self.decisions: dict[tuple[str, int], PermissionDecisionModel] = {}

    def reset(self) -> None:
        self.context = ContextEngine()
        self.agent = AgentRuntime()
        self.tools = ToolGateway()
        self.decisions.clear()

    def ingest_observation(self, model: ObservationModel, key: str) -> tuple[str, bool]:
        item = Observation(
            id=model.id,
            schema_version=model.schemaVersion,
            subject_id=model.subjectId,
            kind=model.kind,
            payload=model.payload,
            source=ObservationSource(
                model.source.provider, model.source.bodyId, model.source.sourceRef
            ),
            observed_at=model.observedAt,
            received_at=model.receivedAt,
            valid_until=model.validUntil,
            confidence=model.confidence,
            sensitivity=model.sensitivity,
            permission_scope=model.permissionScope,
        )
        try:
            stored, created = self.context.ingest(item, key)
        except ObservationConflict as error:
            raise RepositoryConflict(str(error)) from error
        return stored.id, created

    def current_context(self, subject_id: str) -> dict[str, object]:
        view = self.context.current_view(subject_id)
        return {
            "subjectId": view.subject_id,
            "revision": view.revision,
            "generatedAt": view.generated_at,
            "observations": [item.id for item in view.observations],
        }

    def create_intent(self, model: IntentModel, key: str) -> tuple[dict[str, object], bool]:
        try:
            task, created = self.agent.capture(
                Task(id=model.id, subject_id=model.subjectId, raw_intent=model.rawIntent), key
            )
        except ValueError as error:
            raise RepositoryConflict(str(error)) from error
        return self._task_dict(task), created

    def get_task(self, task_id: str) -> dict[str, object]:
        try:
            return self._task_dict(self.agent.get(task_id))
        except KeyError as error:
            raise RepositoryNotFound("unknown task") from error

    def register_capability(self, body_id: str, model: CapabilityModel) -> None:
        del body_id
        self.tools.register(
            ToolDescriptor(
                capability=model.capability,
                execution=model.execution,
                side_effect=model.sideEffect,
                supports_idempotency=model.supportsIdempotency,
                supports_query=model.supportsQuery,
                supports_cancel=model.supportsCancel,
            )
        )

    def decide_plan(self, plan_id: str, model: PermissionDecisionModel) -> None:
        key = (plan_id, model.planRevision)
        existing = self.decisions.get(key)
        if existing is not None and existing != model:
            raise RepositoryConflict("plan revision already has a different permission decision")
        self.decisions[key] = model

    def create_action(self, model: ActionCreateModel) -> tuple[dict[str, object], bool]:
        try:
            task = self.agent.get(model.taskId)
        except KeyError as error:
            raise RepositoryNotFound("unknown task") from error
        if task.subject_id != model.subjectId:
            raise RepositoryConflict("action subject does not match task subject")
        decision = self.decisions.get((model.planId, model.planRevision))
        if decision is None:
            raise RepositoryPermissionDenied("action lacks a recorded permission decision")
        if (
            decision.subjectId != model.subjectId
            or decision.capability != model.capability
            or decision.decision != model.permissionDecision
        ):
            raise RepositoryPermissionDenied("action does not match its permission decision")
        item = Action(
            id=model.id,
            request_id=model.requestId,
            subject_id=model.subjectId,
            plan_revision=model.planRevision,
            capability=model.capability,
            arguments=model.arguments,
            permission_decision=model.permissionDecision,
        )
        try:
            action, created = self.tools.prepare(item)
        except PermissionError as error:
            raise RepositoryPermissionDenied(str(error)) from error
        except ValueError as error:
            if str(error) == "unregistered capability":
                raise RepositoryNotFound(str(error)) from error
            raise RepositoryConflict(str(error)) from error
        return self._action_dict(action), created

    def transition_action(self, action_id: str, model: ActionResultModel) -> dict[str, object]:
        try:
            action = self.tools.transition(
                action_id,
                ActionStatus(model.status),
                provider_ref=model.providerRef,
                evidence=model.evidence,
            )
        except KeyError as error:
            raise RepositoryNotFound("unknown action") from error
        except ValueError as error:
            raise RepositoryConflict(str(error)) from error
        return self._action_dict(action)

    def action_receipt(self, action_id: str) -> dict[str, object]:
        try:
            action = self.tools.get(action_id)
        except KeyError as error:
            raise RepositoryNotFound("unknown action") from error
        return self._receipt_dict(action)

    @staticmethod
    def _task_dict(task: Task) -> dict[str, object]:
        return {
            "id": task.id,
            "subjectId": task.subject_id,
            "rawIntent": task.raw_intent,
            "intentRevision": task.intent_revision,
            "status": task.status,
            "summary": task.summary,
        }

    @staticmethod
    def _action_dict(action: Action) -> dict[str, object]:
        return {
            "id": action.id,
            "status": action.status,
            "providerRef": action.provider_ref,
        }

    @staticmethod
    def _receipt_dict(action: Action) -> dict[str, object]:
        return {
            "actionId": action.id,
            "requestId": action.request_id,
            "capability": action.capability,
            "status": action.status,
            "summary": "Verified by tool evidence"
            if action.status is ActionStatus.VERIFIED
            else "",
            "evidence": action.evidence,
            "providerRef": action.provider_ref,
        }


class PostgresControlPlaneRepository:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def _connect(self):
        return psycopg.connect(self.database_url, row_factory=dict_row)

    @staticmethod
    def _hash(payload: dict[str, Any]) -> str:
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(encoded.encode()).hexdigest()

    @staticmethod
    def _ensure_identity(cursor, subject_id: str) -> None:
        cursor.execute(
            "INSERT INTO identities(id) VALUES (%s) ON CONFLICT DO NOTHING", (subject_id,)
        )

    @staticmethod
    def _lock_idempotency_key(cursor, scope: str, key: str) -> None:
        cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"{scope}:{key}",))

    def ingest_observation(self, model: ObservationModel, key: str) -> tuple[str, bool]:
        payload = model.model_dump(mode="json")
        request_hash = self._hash(payload)
        with self._connect() as connection, connection.cursor() as cursor:
            self._lock_idempotency_key(cursor, "observation", key)
            cursor.execute(
                "SELECT request_hash, response_body FROM idempotency_keys WHERE scope=%s AND key=%s FOR UPDATE",
                ("observation", key),
            )
            prior = cursor.fetchone()
            if prior:
                if prior["request_hash"] != request_hash:
                    raise RepositoryConflict("idempotency key reused with different payload")
                return prior["response_body"]["id"], False
            self._ensure_identity(cursor, model.subjectId)
            cursor.execute(
                """
                INSERT INTO observations(
                    id, schema_version, subject_id, kind, payload, source,
                    observed_at, received_at, valid_until, confidence,
                    sensitivity, permission_scope
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    model.id,
                    model.schemaVersion,
                    model.subjectId,
                    model.kind,
                    json.dumps(model.payload),
                    json.dumps(model.source.model_dump()),
                    model.observedAt,
                    model.receivedAt,
                    model.validUntil,
                    model.confidence,
                    model.sensitivity,
                    model.permissionScope,
                ),
            )
            cursor.execute(
                "INSERT INTO idempotency_keys(scope,key,request_hash,response_status,response_body) VALUES (%s,%s,%s,201,%s)",
                ("observation", key, request_hash, json.dumps({"id": model.id})),
            )
        return model.id, True

    def current_context(self, subject_id: str) -> dict[str, object]:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id FROM observations
                WHERE subject_id=%s AND (valid_until IS NULL OR valid_until > now())
                ORDER BY observed_at, id
                """,
                (subject_id,),
            )
            ids = [row["id"] for row in cursor.fetchall()]
            cursor.execute(
                "SELECT count(*) AS revision FROM observations WHERE subject_id=%s", (subject_id,)
            )
            revision = cursor.fetchone()["revision"]
        return {
            "subjectId": subject_id,
            "revision": revision,
            "generatedAt": datetime.now(UTC),
            "observations": ids,
        }

    def create_intent(self, model: IntentModel, key: str) -> tuple[dict[str, object], bool]:
        payload = model.model_dump(mode="json")
        request_hash = self._hash(payload)
        with self._connect() as connection, connection.cursor() as cursor:
            self._lock_idempotency_key(cursor, "intent", key)
            cursor.execute(
                "SELECT request_hash,response_body FROM idempotency_keys WHERE scope=%s AND key=%s FOR UPDATE",
                ("intent", key),
            )
            prior = cursor.fetchone()
            if prior:
                if prior["request_hash"] != request_hash:
                    raise RepositoryConflict("idempotency key reused with different task")
                return prior["response_body"], False
            self._ensure_identity(cursor, model.subjectId)
            result = {
                "id": model.id,
                "subjectId": model.subjectId,
                "rawIntent": model.rawIntent,
                "intentRevision": 1,
                "status": "captured",
                "summary": "",
            }
            cursor.execute(
                "INSERT INTO tasks(id,subject_id,raw_intent,status) VALUES (%s,%s,%s,'captured')",
                (model.id, model.subjectId, model.rawIntent),
            )
            cursor.execute(
                "INSERT INTO idempotency_keys(scope,key,request_hash,response_status,response_body) VALUES (%s,%s,%s,201,%s)",
                ("intent", key, request_hash, json.dumps(result)),
            )
        return result, True

    def get_task(self, task_id: str) -> dict[str, object]:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT id,subject_id,raw_intent,intent_revision,status,summary FROM tasks WHERE id=%s",
                (task_id,),
            )
            row = cursor.fetchone()
        if not row:
            raise RepositoryNotFound("unknown task")
        return {
            "id": row["id"],
            "subjectId": row["subject_id"],
            "rawIntent": row["raw_intent"],
            "intentRevision": row["intent_revision"],
            "status": row["status"],
            "summary": row["summary"],
        }

    def register_capability(self, body_id: str, model: CapabilityModel) -> None:
        descriptor = model.model_dump(mode="json")
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO bodies(id,last_seen_at) VALUES (%s,now()) ON CONFLICT(id) DO UPDATE SET last_seen_at=now()",
                (body_id,),
            )
            cursor.execute(
                """
                INSERT INTO capability_leases(body_id,capability,descriptor,expires_at)
                VALUES (%s,%s,%s,now()+interval '5 minutes')
                ON CONFLICT(body_id,capability) DO UPDATE
                SET descriptor=EXCLUDED.descriptor, expires_at=EXCLUDED.expires_at
                """,
                (body_id, model.capability, json.dumps(descriptor)),
            )

    def decide_plan(self, plan_id: str, model: PermissionDecisionModel) -> None:
        with self._connect() as connection, connection.cursor() as cursor:
            self._ensure_identity(cursor, model.subjectId)
            cursor.execute(
                """
                INSERT INTO permission_decisions(
                    plan_id,plan_revision,subject_id,capability,purpose,decision,reason
                ) VALUES (%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT(plan_id,plan_revision) DO NOTHING
                RETURNING plan_id
                """,
                (
                    plan_id,
                    model.planRevision,
                    model.subjectId,
                    model.capability,
                    model.purpose,
                    model.decision,
                    model.reason,
                ),
            )
            if cursor.fetchone():
                return
            cursor.execute(
                """
                SELECT subject_id,capability,purpose,decision,reason
                FROM permission_decisions
                WHERE plan_id=%s AND plan_revision=%s
                """,
                (plan_id, model.planRevision),
            )
            existing = cursor.fetchone()
            expected = {
                "subject_id": model.subjectId,
                "capability": model.capability,
                "purpose": model.purpose,
                "decision": model.decision,
                "reason": model.reason,
            }
            if existing != expected:
                raise RepositoryConflict(
                    "plan revision already has a different permission decision"
                )

    def create_action(self, model: ActionCreateModel) -> tuple[dict[str, object], bool]:
        if model.permissionDecision not in {"allow", "confirmed", "authenticated"}:
            raise RepositoryPermissionDenied("action lacks executable permission evidence")
        with self._connect() as connection, connection.cursor() as cursor:
            self._lock_idempotency_key(cursor, "action", model.requestId)
            cursor.execute(
                "SELECT id,capability,arguments,status,provider_ref FROM actions WHERE request_id=%s FOR UPDATE",
                (model.requestId,),
            )
            prior = cursor.fetchone()
            if prior:
                if (
                    prior["id"] != model.id
                    or prior["capability"] != model.capability
                    or prior["arguments"] != model.arguments
                ):
                    raise RepositoryConflict("request id reused with different action")
                return {
                    "id": prior["id"],
                    "status": prior["status"],
                    "providerRef": prior["provider_ref"],
                }, False
            cursor.execute(
                "SELECT subject_id FROM tasks WHERE id=%s",
                (model.taskId,),
            )
            task = cursor.fetchone()
            if not task:
                raise RepositoryNotFound("unknown task")
            if task["subject_id"] != model.subjectId:
                raise RepositoryConflict("action subject does not match task subject")
            cursor.execute(
                """
                SELECT subject_id,capability,decision
                FROM permission_decisions
                WHERE plan_id=%s AND plan_revision=%s
                """,
                (model.planId, model.planRevision),
            )
            decision = cursor.fetchone()
            if not decision:
                raise RepositoryPermissionDenied("action lacks a recorded permission decision")
            if (
                decision["subject_id"] != model.subjectId
                or decision["capability"] != model.capability
                or decision["decision"] != model.permissionDecision
            ):
                raise RepositoryPermissionDenied("action does not match its permission decision")
            cursor.execute(
                "SELECT 1 FROM capability_leases WHERE capability=%s AND expires_at>now()",
                (model.capability,),
            )
            if not cursor.fetchone():
                raise RepositoryNotFound("unregistered or expired capability")
            self._ensure_identity(cursor, model.subjectId)
            cursor.execute(
                """
                INSERT INTO actions(
                    id,request_id,subject_id,task_id,plan_id,plan_revision,
                    capability,arguments,permission_decision,status
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'prepared')
                """,
                (
                    model.id,
                    model.requestId,
                    model.subjectId,
                    model.taskId,
                    model.planId,
                    model.planRevision,
                    model.capability,
                    json.dumps(model.arguments),
                    model.permissionDecision,
                ),
            )
            cursor.execute(
                "INSERT INTO outbox(topic,aggregate_id,payload) VALUES ('action.prepared',%s,%s)",
                (model.id, json.dumps({"actionId": model.id, "requestId": model.requestId})),
            )
        return {"id": model.id, "status": "prepared", "providerRef": None}, True

    def transition_action(self, action_id: str, model: ActionResultModel) -> dict[str, object]:
        allowed = {
            "prepared": {"submitted"},
            "submitted": {"accepted", "rejected", "outcome_unknown"},
            "accepted": {"completed", "outcome_unknown"},
            "outcome_unknown": {"accepted", "rejected", "completed"},
            "completed": {"verified", "outcome_unknown"},
            "rejected": set(),
            "verified": set(),
        }
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT request_id,capability,status,provider_ref FROM actions WHERE id=%s FOR UPDATE",
                (action_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise RepositoryNotFound("unknown action")
            if model.status not in allowed[row["status"]]:
                raise RepositoryConflict(
                    f"invalid action transition: {row['status']} -> {model.status}"
                )
            if model.status == "verified" and not model.evidence:
                raise RepositoryConflict("verified action requires evidence")
            provider_ref = model.providerRef or row["provider_ref"]
            cursor.execute(
                "UPDATE actions SET status=%s,provider_ref=%s,updated_at=now() WHERE id=%s",
                (model.status, provider_ref, action_id),
            )
            if model.status == "verified":
                cursor.execute(
                    """
                    INSERT INTO action_receipts(action_id,status,summary,evidence,verified_at)
                    VALUES (%s,'verified',%s,%s,now())
                    ON CONFLICT(action_id) DO NOTHING
                    """,
                    (
                        action_id,
                        model.summary or "Verified by tool evidence",
                        json.dumps(model.evidence),
                    ),
                )
        return {"id": action_id, "status": model.status, "providerRef": provider_ref}

    def action_receipt(self, action_id: str) -> dict[str, object]:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT a.id,a.request_id,a.capability,a.status,a.provider_ref,
                       r.summary,r.evidence
                FROM actions a LEFT JOIN action_receipts r ON r.action_id=a.id
                WHERE a.id=%s
                """,
                (action_id,),
            )
            row = cursor.fetchone()
        if not row:
            raise RepositoryNotFound("unknown action")
        return {
            "actionId": row["id"],
            "requestId": row["request_id"],
            "capability": row["capability"],
            "status": row["status"],
            "summary": row["summary"] or "",
            "evidence": row["evidence"] or {},
            "providerRef": row["provider_ref"],
        }


def build_repository() -> ControlPlaneRepository:
    mode = os.getenv("OLO_REPOSITORY", "postgres")
    if mode == "memory":
        return InMemoryControlPlaneRepository()
    if mode != "postgres":
        raise RuntimeError(f"unsupported OLO_REPOSITORY value: {mode}")
    database_url = os.getenv("OLO_DATABASE_URL")
    if not database_url:
        raise RuntimeError("OLO_DATABASE_URL is required for the PostgreSQL repository")
    return PostgresControlPlaneRepository(database_url)
