from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from threading import RLock

from .domain import ContextView, Observation


@dataclass(frozen=True, slots=True)
class ProactiveSuggestion:
    subject_id: str
    event_key: str
    kind: str
    message: str
    observation_id: str
    proposed_at: datetime


class ProactiveDecisionEngine:
    """Conservative, side-effect-free decision layer for observed calendar deadlines.

    Only explicitly opted-in observations are eligible. This class never calls
    tools or issues notifications: hosts must apply their permission policy.
    Cooldown history is process-local; durable delivery is a separate concern.
    """

    def __init__(self, *, lead_time: timedelta = timedelta(minutes=45),
                 cooldown: timedelta = timedelta(hours=2)) -> None:
        if lead_time <= timedelta(0) or cooldown <= timedelta(0):
            raise ValueError("lead_time and cooldown must be positive")
        self._lead_time = lead_time
        self._cooldown = cooldown
        self._last_proposed: dict[tuple[str, str], datetime] = {}
        self._lock = RLock()

    def evaluate(self, view: ContextView, *, at: datetime) -> tuple[ProactiveSuggestion, ...]:
        if at.tzinfo is None:
            raise ValueError("evaluation time must be timezone-aware")
        if view.subject_id == "":
            return ()
        candidates: list[tuple[datetime, Observation, str]] = []
        for item in view.observations:
            if item.subject_id != view.subject_id or not item.is_current(at):
                continue
            if item.kind != "calendar.event" or item.permission_scope != "calendar.read":
                continue
            if item.confidence < 0.8 or item.sensitivity.value in {"sensitive", "restricted"}:
                continue
            payload = item.payload
            if payload.get("proactiveOptIn") is not True:
                continue
            event_key = payload.get("eventId")
            starts_at = payload.get("startsAt")
            if not isinstance(event_key, str) or not event_key.strip():
                continue
            if not isinstance(starts_at, str):
                continue
            try:
                start = datetime.fromisoformat(starts_at.replace("Z", "+00:00"))
            except ValueError:
                continue
            if start.tzinfo is None or not at < start <= at + self._lead_time:
                continue
            candidates.append((start, item, event_key))
        candidates.sort(key=lambda x: (x[0], x[2], x[1].id))
        suggestions: list[ProactiveSuggestion] = []
        with self._lock:
            for start, item, event_key in candidates:
                key = (view.subject_id, event_key)
                last = self._last_proposed.get(key)
                if last is not None and at - last < self._cooldown:
                    continue
                title = item.payload.get("title")
                title = title.strip() if isinstance(title, str) else ""
                if not title:
                    title = "日程"
                suggestions.append(ProactiveSuggestion(
                    subject_id=view.subject_id,
                    event_key=event_key,
                    kind="upcoming_calendar_event",
                    message=f"{title}即将开始，是否需要提前准备？",
                    observation_id=item.id,
                    proposed_at=at,
                ))
                self._last_proposed[key] = at
        return tuple(suggestions)
