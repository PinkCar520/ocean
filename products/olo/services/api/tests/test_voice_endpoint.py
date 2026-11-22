from fastapi.testclient import TestClient
from olo_api.main import app, reset_in_memory_repository_for_testing

client = TestClient(app)
TURN = {
    "subjectId": "person_1",
    "sessionId": "session_1",
    "sourceBodyId": "iphone_1",
    "transcript": "提醒我明天开会",
}


def setup_function():
    reset_in_memory_repository_for_testing()


def test_voice_endpoint_disabled_without_token(monkeypatch):
    monkeypatch.delenv("OLO_VOICE_CAPTURE_TOKEN", raising=False)
    response = client.post("/v1/voice/turns", json=TURN)
    assert response.status_code == 503


def test_voice_endpoint_requires_token_and_captures_once(monkeypatch):
    monkeypatch.setenv("OLO_VOICE_CAPTURE_TOKEN", "test-secret")
    assert client.post("/v1/voice/turns", json=TURN).status_code == 401
    headers = {"X-OLO-Voice-Token": "test-secret"}
    first = client.post("/v1/voice/turns", headers=headers, json=TURN)
    second = client.post("/v1/voice/turns", headers=headers, json=TURN)
    assert first.status_code == 202
    assert second.status_code == 202
    assert first.json() == second.json()
    assert first.json()["status"] == "captured"


def test_voice_endpoint_rejects_empty_transcript(monkeypatch):
    monkeypatch.setenv("OLO_VOICE_CAPTURE_TOKEN", "test-secret")
    response = client.post(
        "/v1/voice/turns", headers={"X-OLO-Voice-Token": "test-secret"},
        json={**TURN, "transcript": ""},
    )
    assert response.status_code == 422


def test_voice_endpoint_captures_queryable_task(monkeypatch):
    import hashlib
    monkeypatch.setenv("OLO_VOICE_CAPTURE_TOKEN", "test-secret")
    headers = {"X-OLO-Voice-Token": "test-secret"}
    response = client.post("/v1/voice/turns", headers=headers, json=TURN)
    assert response.status_code == 202
    digest = hashlib.sha256("\x00".join((
        TURN["subjectId"], TURN["sourceBodyId"],
        TURN["sessionId"], TURN["transcript"]
    )).encode()).hexdigest()
    task = client.get(f"/v1/tasks/task_voice_{digest[:32]}")
    assert task.status_code == 200
    assert task.json()["rawIntent"] == TURN["transcript"]
    assert task.json()["status"] == "captured"
