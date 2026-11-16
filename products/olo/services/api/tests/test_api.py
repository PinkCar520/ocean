from fastapi.testclient import TestClient
from olo_api.main import app, reset_in_memory_repository_for_testing

client = TestClient(app)


def setup_function() -> None:
    reset_in_memory_repository_for_testing()


def observation(identifier: str = "obs_api_1") -> dict:
    return {
        "id": identifier,
        "schemaVersion": 1,
        "subjectId": "person_1",
        "kind": "calendar.event",
        "payload": {"title": "Meeting"},
        "source": {
            "provider": "fixture",
            "bodyId": "iphone_1",
            "sourceRef": identifier,
        },
        "observedAt": "2026-09-11T01:00:00Z",
        "receivedAt": "2026-09-11T01:00:01Z",
        "validUntil": "2027-09-11T01:00:00Z",
        "confidence": 1.0,
        "sensitivity": "personal",
        "permissionScope": "calendar.read",
    }


def test_health() -> None:
    assert client.get("/health").json() == {
        "status": "ok",
        "repository": "InMemoryControlPlaneRepository",
    }


def test_observation_ingest_is_idempotent() -> None:
    headers = {"Idempotency-Key": "key-1"}
    first = client.post("/v1/observations", headers=headers, json=observation())
    second = client.post("/v1/observations", headers=headers, json=observation())
    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["created"] is False


def test_observation_idempotency_conflict() -> None:
    headers = {"Idempotency-Key": "key-1"}
    client.post("/v1/observations", headers=headers, json=observation())
    conflict = client.post("/v1/observations", headers=headers, json=observation("obs_api_2"))
    assert conflict.status_code == 409


def test_current_context_returns_provenance_ids() -> None:
    client.post(
        "/v1/observations",
        headers={"Idempotency-Key": "key-1"},
        json=observation(),
    )
    result = client.get("/v1/context/views/current", params={"subjectId": "person_1"})
    assert result.status_code == 200
    assert result.json()["observations"] == ["obs_api_1"]


def test_intent_keeps_stable_task_identity() -> None:
    payload = {"id": "task_api_1", "subjectId": "person_1", "rawIntent": "提醒我开会"}
    headers = {"Idempotency-Key": "intent-key-1"}
    created = client.post("/v1/intents", headers=headers, json=payload)
    existing = client.post("/v1/intents", headers=headers, json=payload)
    task = client.get("/v1/tasks/task_api_1")
    assert created.status_code == 201
    assert existing.status_code == 200
    assert task.json()["id"] == "task_api_1"
    assert task.json()["status"] == "captured"


def test_intent_idempotency_conflict_returns_409() -> None:
    headers = {"Idempotency-Key": "intent-key-1"}
    client.post(
        "/v1/intents",
        headers=headers,
        json={"id": "task_api_1", "subjectId": "person_1", "rawIntent": "提醒我开会"},
    )
    conflict = client.post(
        "/v1/intents",
        headers=headers,
        json={"id": "task_api_2", "subjectId": "person_1", "rawIntent": "提醒我喝水"},
    )
    assert conflict.status_code == 409


def test_unknown_task_returns_404() -> None:
    assert client.get("/v1/tasks/missing").status_code == 404


def register_reminder_capability() -> None:
    response = client.post(
        "/v1/bodies/iphone_1/capabilities",
        json={
            "capability": "apple.reminders.create.v1",
            "execution": "device",
            "sideEffect": "reversible_write",
            "supportsIdempotency": True,
            "supportsQuery": True,
            "supportsCancel": True,
        },
    )
    assert response.status_code == 201


def create_action_task() -> None:
    response = client.post(
        "/v1/intents",
        headers={"Idempotency-Key": "intent-key-action"},
        json={"id": "task_api_1", "subjectId": "person_1", "rawIntent": "提醒我开会"},
    )
    assert response.status_code == 201


def record_permission_decision(decision: str = "confirmed") -> None:
    response = client.post(
        "/v1/plans/plan_api_1/decisions",
        json={
            "subjectId": "person_1",
            "capability": "apple.reminders.create.v1",
            "purpose": "user_requested_action",
            "planRevision": 1,
            "decision": decision,
            "reason": "User confirmed the displayed proposal",
        },
    )
    assert response.status_code == 200


def prepare_action_dependencies(decision: str = "confirmed") -> None:
    create_action_task()
    register_reminder_capability()
    record_permission_decision(decision)


def action_payload(permission: str = "confirmed") -> dict:
    return {
        "id": "act_api_1",
        "requestId": "request-api-1",
        "subjectId": "person_1",
        "taskId": "task_api_1",
        "planId": "plan_api_1",
        "planRevision": 1,
        "capability": "apple.reminders.create.v1",
        "arguments": {"title": "Meeting", "dueDate": "2026-09-12T01:00:00Z"},
        "permissionDecision": permission,
    }


def test_action_requires_registered_capability() -> None:
    create_action_task()
    record_permission_decision()
    response = client.post(
        "/v1/actions",
        headers={"Idempotency-Key": "request-api-1"},
        json=action_payload(),
    )
    assert response.status_code == 404


def test_action_requires_executable_permission() -> None:
    prepare_action_dependencies("deny")
    response = client.post(
        "/v1/actions",
        headers={"Idempotency-Key": "request-api-1"},
        json=action_payload("deny"),
    )
    assert response.status_code == 403


def test_action_requires_recorded_matching_decision() -> None:
    create_action_task()
    register_reminder_capability()
    response = client.post(
        "/v1/actions",
        headers={"Idempotency-Key": "request-api-1"},
        json=action_payload(),
    )
    assert response.status_code == 403


def test_action_request_is_idempotent_after_progress() -> None:
    prepare_action_dependencies()
    headers = {"Idempotency-Key": "request-api-1"}
    assert client.post("/v1/actions", headers=headers, json=action_payload()).status_code == 201
    assert (
        client.post("/v1/actions/act_api_1/results", json={"status": "submitted"}).status_code
        == 200
    )
    replay = client.post("/v1/actions", headers=headers, json=action_payload())
    assert replay.status_code == 200
    assert replay.json()["status"] == "submitted"


def test_action_cannot_verify_without_evidence() -> None:
    prepare_action_dependencies()
    client.post(
        "/v1/actions",
        headers={"Idempotency-Key": "request-api-1"},
        json=action_payload(),
    )
    for status in ("submitted", "accepted", "completed"):
        assert (
            client.post("/v1/actions/act_api_1/results", json={"status": status}).status_code == 200
        )
    rejected = client.post(
        "/v1/actions/act_api_1/results", json={"status": "verified", "evidence": {}}
    )
    assert rejected.status_code == 409


def test_verified_action_has_receipt_evidence() -> None:
    prepare_action_dependencies()
    client.post(
        "/v1/actions",
        headers={"Idempotency-Key": "request-api-1"},
        json=action_payload(),
    )
    client.post("/v1/actions/act_api_1/results", json={"status": "submitted"})
    client.post(
        "/v1/actions/act_api_1/results",
        json={"status": "accepted", "providerRef": "reminder_1"},
    )
    client.post("/v1/actions/act_api_1/results", json={"status": "completed"})
    verified = client.post(
        "/v1/actions/act_api_1/results",
        json={"status": "verified", "evidence": {"providerReadback": "reminder_1"}},
    )
    receipt = client.get("/v1/actions/act_api_1/receipt")
    assert verified.status_code == 200
    assert receipt.json()["status"] == "verified"
    assert receipt.json()["evidence"] == {"providerReadback": "reminder_1"}
