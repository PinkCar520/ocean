from __future__ import annotations

from dataclasses import dataclass, field, replace
from enum import StrEnum
from threading import RLock
from typing import Any


class ActionStatus(StrEnum):
    PREPARED = "prepared"
    SUBMITTED = "submitted"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    OUTCOME_UNKNOWN = "outcome_unknown"
    COMPLETED = "completed"
    VERIFIED = "verified"


@dataclass(frozen=True, slots=True)
class ToolDescriptor:
    capability: str
    execution: str
    side_effect: str
    supports_idempotency: bool
    supports_query: bool
    supports_cancel: bool


@dataclass(frozen=True, slots=True)
class Action:
    id: str
    request_id: str
    subject_id: str
    plan_revision: int
    capability: str
    arguments: dict[str, Any]
    permission_decision: str
    status: ActionStatus = ActionStatus.PREPARED
    provider_ref: str | None = None
    evidence: dict[str, Any] = field(default_factory=dict)


_ALLOWED_TRANSITIONS = {
    ActionStatus.PREPARED: {ActionStatus.SUBMITTED},
    ActionStatus.SUBMITTED: {
        ActionStatus.ACCEPTED,
        ActionStatus.REJECTED,
        ActionStatus.OUTCOME_UNKNOWN,
    },
    ActionStatus.ACCEPTED: {
        ActionStatus.COMPLETED,
        ActionStatus.OUTCOME_UNKNOWN,
    },
    ActionStatus.OUTCOME_UNKNOWN: {
        ActionStatus.ACCEPTED,
        ActionStatus.REJECTED,
        ActionStatus.COMPLETED,
    },
    ActionStatus.COMPLETED: {ActionStatus.VERIFIED, ActionStatus.OUTCOME_UNKNOWN},
    ActionStatus.REJECTED: set(),
    ActionStatus.VERIFIED: set(),
}


class ToolGateway:
    def __init__(self) -> None:
        self._tools: dict[str, ToolDescriptor] = {}
        self._actions: dict[str, Action] = {}
        self._requests: dict[str, str] = {}
        self._lock = RLock()

    def register(self, descriptor: ToolDescriptor) -> None:
        self._tools[descriptor.capability] = descriptor

    @property
    def capabilities(self) -> tuple[ToolDescriptor, ...]:
        return tuple(self._tools.values())

    def prepare(self, action: Action) -> tuple[Action, bool]:
        with self._lock:
            if action.capability not in self._tools:
                raise ValueError("unregistered capability")
            if action.permission_decision not in {"allow", "confirmed", "authenticated"}:
                raise PermissionError("action lacks executable permission evidence")
            prior_id = self._requests.get(action.request_id)
            if prior_id is not None:
                prior = self._actions[prior_id]
                if self._request_fingerprint(prior) != self._request_fingerprint(action):
                    raise ValueError("request id reused with different action")
                return prior, False
            self._actions[action.id] = action
            self._requests[action.request_id] = action.id
            return action, True

    def transition(
        self,
        action_id: str,
        status: ActionStatus,
        *,
        provider_ref: str | None = None,
        evidence: dict[str, Any] | None = None,
    ) -> Action:
        with self._lock:
            current = self._actions[action_id]
            if status not in _ALLOWED_TRANSITIONS[current.status]:
                raise ValueError(f"invalid action transition: {current.status} -> {status}")
            if status is ActionStatus.VERIFIED and not evidence:
                raise ValueError("verified action requires evidence")
            updated = replace(
                current,
                status=status,
                provider_ref=provider_ref or current.provider_ref,
                evidence=evidence or current.evidence,
            )
            self._actions[action_id] = updated
            return updated

    def get(self, action_id: str) -> Action:
        return self._actions[action_id]

    @staticmethod
    def _request_fingerprint(action: Action) -> tuple[object, ...]:
        return (
            action.id,
            action.request_id,
            action.subject_id,
            action.plan_revision,
            action.capability,
            repr(sorted(action.arguments.items())),
            action.permission_decision,
        )
