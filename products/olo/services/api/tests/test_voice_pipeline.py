import asyncio
import unittest

from olo_api.voice_pipeline import AgentReply, VoicePipeline


class FakeASR:
    async def transcribe(self, audio, *, locale):
        assert audio == b"audio" and locale == "zh-CN"
        return "提醒我明天开会"


class FakeAgent:
    def __init__(self):
        self.turns = []

    async def respond(self, turn):
        self.turns.append(turn)
        return AgentReply("请确认提醒时间", turn.session_id)


class FakeTTS:
    async def synthesize(self, text, *, locale):
        assert text == "请确认提醒时间" and locale == "zh-CN"
        return b"spoken"


class VoicePipelineTests(unittest.TestCase):
    def test_voice_routes_through_agent_with_session_and_body_identity(self):
        agent = FakeAgent()
        pipeline = VoicePipeline(FakeASR(), agent, FakeTTS())
        reply, audio = asyncio.run(pipeline.process(
            b"audio", subject_id="person_1", session_id="session_1",
            source_body_id="iphone_1", speak=True))
        self.assertEqual(reply.text, "请确认提醒时间")
        self.assertEqual(audio, b"spoken")
        self.assertEqual(agent.turns[0].session_id, "session_1")
        self.assertEqual(agent.turns[0].source_body_id, "iphone_1")

    def test_text_only_mode_does_not_require_tts(self):
        reply, audio = asyncio.run(VoicePipeline(FakeASR(), FakeAgent()).process(
            b"audio", subject_id="person_1", session_id="session_1",
            source_body_id="iphone_1"))
        self.assertIsNone(audio)
        self.assertEqual(reply.session_id, "session_1")

    def test_empty_audio_rejected(self):
        with self.assertRaises(ValueError):
            asyncio.run(VoicePipeline(FakeASR(), FakeAgent()).process(
                b"", subject_id="person_1", session_id="session_1",
                source_body_id="iphone_1"))


if __name__ == "__main__":
    unittest.main()
