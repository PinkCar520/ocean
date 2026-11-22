from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class SourceModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: str = Field(min_length=1)
    bodyId: str = Field(min_length=1)
    sourceRef: str = Field(min_length=1)


class ObservationModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^obs_")
    schemaVersion: Literal[1] = 1
    subjectId: str = Field(min_length=1)
    kind: str = Field(min_length=1)
    payload: dict[str, Any]
    source: SourceModel
    observedAt: datetime
    receivedAt: datetime
    validUntil: datetime | None = None
    confidence: float = Field(ge=0, le=1)
    sensitivity: Literal["public", "personal", "sensitive", "restricted"]
    permissionScope: str = Field(min_length=1)


class IntentModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^task_")
    subjectId: str = Field(min_length=1)
    rawIntent: str = Field(min_length=1)


class CapabilityModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    capability: str = Field(min_length=1)
    execution: Literal["device", "server"]
    sideEffect: Literal["read", "reversible_write", "irreversible_write"]
    supportsIdempotency: bool
    supportsQuery: bool
    supportsCancel: bool


class PermissionDecisionModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subjectId: str = Field(min_length=1)
    capability: str = Field(min_length=1)
    purpose: str = Field(min_length=1)
    planRevision: int = Field(ge=1)
    decision: Literal["allow", "confirmed", "authenticated", "deny"]
    reason: str = Field(min_length=1)


class ActionCreateModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^act_")
    requestId: str = Field(min_length=1)
    subjectId: str = Field(min_length=1)
    taskId: str = Field(pattern=r"^task_")
    planId: str = Field(pattern=r"^plan_")
    planRevision: int = Field(ge=1)
    capability: str = Field(min_length=1)
    arguments: dict[str, Any]
    permissionDecision: Literal["allow", "confirmed", "authenticated", "deny", "confirm"]


class ActionResultModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal[
        "submitted",
        "accepted",
        "rejected",
        "outcome_unknown",
        "completed",
        "verified",
    ]
    providerRef: str | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)
    summary: str = ""


class VoiceTurnModel(BaseModel):
    """A final, already-transcribed utterance from a trusted device host."""
    model_config = ConfigDict(extra="forbid")
    subjectId: str = Field(min_length=1)
    sessionId: str = Field(min_length=1)
    sourceBodyId: str = Field(min_length=1)
    transcript: str = Field(min_length=1)
