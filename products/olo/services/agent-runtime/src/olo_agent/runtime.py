from __future__ import annotations

from dataclasses import dataclass, replace
from enum import StrEnum
from threading import RLock


class TaskStatus(StrEnum):
    CAPTURED = "captured"
    UNDERSTANDING = "understanding"
    NEEDS_INFORMATION = "needs_information"
    PLANNING = "planning"
    WAITING_FOR_PERMISSION = "waiting_for_permission"
    EXECUTING = "executing"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    PARTIAL = "partial"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass(frozen=True, slots=True)
class Task:
    id: str
    subject_id: str
    raw_intent: str
    intent_revision: int = 1
    status: TaskStatus = TaskStatus.CAPTURED
    summary: str = ""


_TRANSITIONS = {
    TaskStatus.CAPTURED: {TaskStatus.UNDERSTANDING, TaskStatus.CANCELLED},
    TaskStatus.UNDERSTANDING: {
        TaskStatus.NEEDS_INFORMATION,
        TaskStatus.PLANNING,
        TaskStatus.FAILED,
        TaskStatus.CANCELLED,
    },
    TaskStatus.NEEDS_INFORMATION: {
        TaskStatus.UNDERSTANDING,
        TaskStatus.CANCELLED,
    },
    TaskStatus.PLANNING: {
        TaskStatus.WAITING_FOR_PERMISSION,
        TaskStatus.EXECUTING,
        TaskStatus.FAILED,
        TaskStatus.CANCELLED,
    },
    TaskStatus.WAITING_FOR_PERMISSION: {
        TaskStatus.EXECUTING,
        TaskStatus.FAILED,
        TaskStatus.CANCELLED,
    },
    TaskStatus.EXECUTING: {
        TaskStatus.VERIFYING,
        TaskStatus.PARTIAL,
        TaskStatus.FAILED,
        TaskStatus.CANCELLED,
    },
    TaskStatus.VERIFYING: {
        TaskStatus.COMPLETED,
        TaskStatus.PARTIAL,
        TaskStatus.FAILED,
    },
    TaskStatus.COMPLETED: set(),
    TaskStatus.PARTIAL: set(),
    TaskStatus.FAILED: set(),
    TaskStatus.CANCELLED: set(),
}


class AgentRuntime:
    def __init__(self) -> None:
        self._tasks: dict[str, Task] = {}
        self._idempotency: dict[str, str] = {}
        self._lock = RLock()

    def capture(self, task: Task, idempotency_key: str) -> tuple[Task, bool]:
        with self._lock:
            prior_id = self._idempotency.get(idempotency_key)
            if prior_id is not None:
                prior = self._tasks[prior_id]
                if prior != task:
                    raise ValueError("idempotency key reused with different task")
                return prior, False
            self._tasks[task.id] = task
            self._idempotency[idempotency_key] = task.id
            return task, True

    def transition(self, task_id: str, status: TaskStatus, summary: str = "") -> Task:
        with self._lock:
            current = self._tasks[task_id]
            if status not in _TRANSITIONS[current.status]:
                raise ValueError(f"invalid task transition: {current.status} -> {status}")
            updated = replace(current, status=status, summary=summary)
            self._tasks[task_id] = updated
            return updated

    def get(self, task_id: str) -> Task:
        return self._tasks[task_id]
