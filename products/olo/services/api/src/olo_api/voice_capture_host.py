"""Capture-only bridge from final voice transcripts to OLO's existing control plane.

This is deliberately not an Agent executor: the shared Ocean Core v2
execution adapter must replace it before a spoken command can run tools.
"""
from __future__ import annotations

import hashlib

from .models import IntentModel
from .repository import ControlPlaneRepository
from .voice_pipeline import AgentReply, VoiceTurn


class CaptureOnlyAgentHost:
    def __init__(self, repository: ControlPlaneRepository) -> None:
        self.repository = repository

    async def respond(self, turn: VoiceTurn) -> AgentReply:
        # Include subject and body to prevent cross-user/session identity collisions.
        fingerprint = "\x00".join((
            turn.subject_id, turn.source_body_id, turn.session_id, turn.transcript
        ))
        digest = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()
        task_id = f"task_voice_{digest[:32]}"
        _, _created = self.repository.create_intent(
            IntentModel(id=task_id, subjectId=turn.subject_id, rawIntent=turn.transcript),
            f"voice:{digest}",
        )
        return AgentReply(
            text="已收到语音请求，等待 Agent 执行服务处理。",
            session_id=turn.session_id,
        )
