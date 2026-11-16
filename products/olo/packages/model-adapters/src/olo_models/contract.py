from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True, slots=True)
class ModelRequest:
    task_id: str
    template_version: str
    schema_version: int
    input: dict[str, Any]


@dataclass(frozen=True, slots=True)
class ModelResult:
    adapter: str
    output: dict[str, Any]
    latency_ms: int
    fallback_reason: str | None = None


class ModelAdapter(Protocol):
    async def generate(self, request: ModelRequest) -> ModelResult: ...
