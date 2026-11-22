import asyncio

from olo_api.repository import InMemoryControlPlaneRepository
from olo_api.voice_capture_host import CaptureOnlyAgentHost
from olo_api.voice_pipeline import VoiceTurn


def test_capture_uses_real_repository_and_is_idempotent():
    repository = InMemoryControlPlaneRepository()
    host = CaptureOnlyAgentHost(repository)
    turn = VoiceTurn(
        subject_id="person_1", session_id="session_1",
        transcript="提醒我明天开会", source_body_id="iphone_1",
    )
    first = asyncio.run(host.respond(turn))
    second = asyncio.run(host.respond(turn))
    assert first == second
    assert first.session_id == "session_1"
    task_id = next(iter(repository.agent._tasks))
    stored = repository.get_task(task_id)
    assert stored["rawIntent"] == turn.transcript
    assert stored["subjectId"] == turn.subject_id
    assert len(repository.agent._tasks) == 1


def test_capture_separates_subject_and_session():
    repository = InMemoryControlPlaneRepository()
    host = CaptureOnlyAgentHost(repository)
    for subject, session in (("person_1", "session_1"), ("person_1", "session_2"),
                             ("person_2", "session_1")):
        asyncio.run(host.respond(VoiceTurn(
            subject_id=subject, session_id=session,
            transcript="提醒我明天开会", source_body_id="iphone_1",
        )))
    assert len(repository.agent._tasks) == 3
