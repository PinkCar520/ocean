from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class VoiceTurn:
    """Transport-neutral final transcript passed to an Agent host."""

    subject_id: str
    session_id: str
    transcript: str
    source_body_id: str

    def __post_init__(self) -> None:
        if not all((self.subject_id.strip(), self.session_id.strip(),
                    self.transcript.strip(), self.source_body_id.strip())):
            raise ValueError("voice turn fields must be non-empty")


@dataclass(frozen=True, slots=True)
class AgentReply:
    text: str
    session_id: str


class SpeechRecognizer(Protocol):
    async def transcribe(self, audio: bytes, *, locale: str) -> str: ...


class AgentTurnHost(Protocol):
    async def respond(self, turn: VoiceTurn) -> AgentReply: ...


class SpeechSynthesizer(Protocol):
    async def synthesize(self, text: str, *, locale: str) -> bytes: ...


class VoicePipeline:
    """ASR -> shared Agent host -> optional TTS; no vendor or CLI coupling.

    ASR and TTS implementations may be native-device bridges or cloud adapters.
    The Agent host owns authorization, session persistence and tool execution.
    """

    def __init__(self, recognizer: SpeechRecognizer, agent: AgentTurnHost,
                 synthesizer: SpeechSynthesizer | None = None) -> None:
        self.recognizer = recognizer
        self.agent = agent
        self.synthesizer = synthesizer

    async def process(self, audio: bytes, *, subject_id: str, session_id: str,
                      source_body_id: str, locale: str = "zh-CN",
                      speak: bool = False) -> tuple[AgentReply, bytes | None]:
        if not audio:
            raise ValueError("audio is empty")
        transcript = await self.recognizer.transcribe(audio, locale=locale)
        turn = VoiceTurn(subject_id=subject_id, session_id=session_id,
                         transcript=transcript, source_body_id=source_body_id)
        reply = await self.agent.respond(turn)
        if reply.session_id != session_id:
            raise ValueError("agent reply session mismatch")
        if not speak:
            return reply, None
        if self.synthesizer is None:
            raise ValueError("speech synthesis provider is not configured")
        return reply, await self.synthesizer.synthesize(reply.text, locale=locale)
