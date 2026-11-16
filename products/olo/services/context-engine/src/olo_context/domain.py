from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any


class Sensitivity(StrEnum):
    PUBLIC = "public"
    PERSONAL = "personal"
    SENSITIVE = "sensitive"
    RESTRICTED = "restricted"


@dataclass(frozen=True, slots=True)
class ObservationSource:
    provider: str
    body_id: str
    source_ref: str


@dataclass(frozen=True, slots=True)
class Observation:
    id: str
    subject_id: str
    kind: str
    payload: dict[str, Any]
    source: ObservationSource
    observed_at: datetime
    received_at: datetime
    permission_scope: str
    valid_until: datetime | None = None
    confidence: float = 1.0
    sensitivity: Sensitivity = Sensitivity.PERSONAL
    schema_version: int = 1

    def __post_init__(self) -> None:
        if not self.id.startswith("obs_"):
            raise ValueError("observation id must start with obs_")
        if not 0 <= self.confidence <= 1:
            raise ValueError("confidence must be between 0 and 1")
        for value in (self.observed_at, self.received_at, self.valid_until):
            if value is not None and value.tzinfo is None:
                raise ValueError("observation timestamps must be timezone-aware")

    def is_current(self, at: datetime | None = None) -> bool:
        now = at or datetime.now(UTC)
        return self.valid_until is None or self.valid_until > now


@dataclass(frozen=True, slots=True)
class ContextView:
    subject_id: str
    revision: int
    generated_at: datetime
    observations: tuple[Observation, ...] = field(default_factory=tuple)
