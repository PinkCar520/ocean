from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any


class Decision(StrEnum):
    ALLOW = "allow"
    CONFIRM = "confirm"
    AUTHENTICATE = "authenticate"
    DENY = "deny"


@dataclass(frozen=True, slots=True)
class PermissionPolicy:
    id: str
    revision: int
    subject_id: str
    capability: str
    purpose: str
    decision: Decision
    valid_until: datetime | None = None
    max_cost_minor: int | None = None
    allowed_body_id: str | None = None


@dataclass(frozen=True, slots=True)
class Proposal:
    subject_id: str
    capability: str
    purpose: str
    plan_revision: int
    arguments: dict[str, Any]
    body_id: str | None = None
    cost_minor: int = 0


@dataclass(frozen=True, slots=True)
class PermissionResult:
    decision: Decision
    policy_id: str | None
    policy_revision: int | None
    plan_revision: int
    reason: str


class PermissionEngine:
    def evaluate(
        self, proposal: Proposal, policies: list[PermissionPolicy], now: datetime
    ) -> PermissionResult:
        candidates = [
            policy
            for policy in policies
            if policy.subject_id == proposal.subject_id
            and policy.capability == proposal.capability
            and policy.purpose == proposal.purpose
            and (policy.valid_until is None or policy.valid_until > now)
            and (policy.allowed_body_id is None or policy.allowed_body_id == proposal.body_id)
        ]
        if not candidates:
            return PermissionResult(
                Decision.DENY, None, None, proposal.plan_revision, "no matching active policy"
            )
        policy = max(candidates, key=lambda item: item.revision)
        if policy.max_cost_minor is not None and proposal.cost_minor > policy.max_cost_minor:
            return PermissionResult(
                Decision.DENY,
                policy.id,
                policy.revision,
                proposal.plan_revision,
                "proposal exceeds policy cost ceiling",
            )
        return PermissionResult(
            policy.decision,
            policy.id,
            policy.revision,
            proposal.plan_revision,
            "matched current scoped policy",
        )
