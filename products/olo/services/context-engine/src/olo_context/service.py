from __future__ import annotations

from datetime import UTC, datetime
from threading import RLock

from .domain import ContextView, Observation


class ObservationConflict(ValueError):
    pass


class ContextEngine:
    """Thread-safe v0.1 store with production domain invariants.

    PostgreSQL replaces the in-memory dictionaries at the repository boundary;
    the service behavior remains independently testable.
    """

    def __init__(self) -> None:
        self._observations: dict[str, Observation] = {}
        self._idempotency: dict[str, str] = {}
        self._revision = 0
        self._lock = RLock()

    def ingest(self, observation: Observation, idempotency_key: str) -> tuple[Observation, bool]:
        if not idempotency_key.strip():
            raise ValueError("idempotency key is required")
        with self._lock:
            prior_id = self._idempotency.get(idempotency_key)
            if prior_id is not None:
                prior = self._observations[prior_id]
                if prior != observation:
                    raise ObservationConflict("idempotency key reused with different payload")
                return prior, False
            if observation.id in self._observations:
                if self._observations[observation.id] != observation:
                    raise ObservationConflict("observation id reused with different payload")
                return observation, False
            self._observations[observation.id] = observation
            self._idempotency[idempotency_key] = observation.id
            self._revision += 1
            return observation, True

    def current_view(self, subject_id: str, at: datetime | None = None) -> ContextView:
        now = at or datetime.now(UTC)
        with self._lock:
            current = tuple(
                item
                for item in self._observations.values()
                if item.subject_id == subject_id and item.is_current(now)
            )
            return ContextView(subject_id, self._revision, now, current)
