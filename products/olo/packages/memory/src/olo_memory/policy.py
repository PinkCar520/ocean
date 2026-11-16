from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class MemoryDecision(StrEnum):
    STORE = "store"
    ASK = "ask"
    REJECT = "reject"


@dataclass(frozen=True, slots=True)
class MemoryCandidate:
    source_fact_id: str
    kind: str
    sensitivity: str
    explicit_user_request: bool
    confidence: float


class MemoryPolicy:
    """Conservative v0.1 promotion policy; storage is a separate operation."""

    def decide(self, candidate: MemoryCandidate) -> MemoryDecision:
        if candidate.sensitivity == "restricted":
            return MemoryDecision.REJECT
        if candidate.explicit_user_request and candidate.confidence == 1:
            return MemoryDecision.STORE
        if candidate.sensitivity == "sensitive" or candidate.confidence < 0.8:
            return MemoryDecision.ASK
        return MemoryDecision.ASK
