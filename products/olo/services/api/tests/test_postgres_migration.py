import os
from datetime import UTC, datetime, timedelta

import psycopg
import pytest
from olo_api.migrations import apply_migrations
from olo_api.models import (
    ActionCreateModel,
    ActionResultModel,
    CapabilityModel,
    IntentModel,
    ObservationModel,
    PermissionDecisionModel,
    SourceModel,
)
from olo_api.repository import PostgresControlPlaneRepository

DATABASE_URL = os.getenv("OLO_TEST_DATABASE_URL")


@pytest.mark.skipif(not DATABASE_URL, reason="OLO_TEST_DATABASE_URL is not configured")
def test_initial_migration_and_core_constraints() -> None:
    with (
        psycopg.connect(DATABASE_URL, autocommit=True) as connection,
        connection.cursor() as cursor,
    ):
        cursor.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public")
    apply_migrations(DATABASE_URL)
    apply_migrations(DATABASE_URL)

    repository = PostgresControlPlaneRepository(DATABASE_URL)
    now = datetime.now(UTC)
    observation = ObservationModel(
        id="obs_test",
        subjectId="person_test",
        kind="calendar.event",
        payload={"title": "Meeting"},
        source=SourceModel(provider="fixture", bodyId="iphone_test", sourceRef="event_1"),
        observedAt=now,
        receivedAt=now,
        validUntil=now + timedelta(hours=1),
        confidence=1,
        sensitivity="personal",
        permissionScope="calendar.read",
    )
    assert repository.ingest_observation(observation, "observation-key") == ("obs_test", True)
    assert repository.ingest_observation(observation, "observation-key") == ("obs_test", False)
    assert repository.current_context("person_test")["observations"] == ["obs_test"]

    intent = IntentModel(id="task_test", subjectId="person_test", rawIntent="remind me")
    assert repository.create_intent(intent, "intent-key")[1] is True
    assert repository.get_task("task_test")["status"] == "captured"

    repository.register_capability(
        "iphone_test",
        CapabilityModel(
            capability="apple.reminders.create.v1",
            execution="device",
            sideEffect="reversible_write",
            supportsIdempotency=True,
            supportsQuery=True,
            supportsCancel=True,
        ),
    )
    repository.decide_plan(
        "plan_test",
        PermissionDecisionModel(
            subjectId="person_test",
            capability="apple.reminders.create.v1",
            purpose="user_requested_action",
            planRevision=1,
            decision="confirmed",
            reason="User confirmed the displayed proposal",
        ),
    )
    action = ActionCreateModel(
        id="act_test",
        requestId="request_test",
        subjectId="person_test",
        taskId="task_test",
        planId="plan_test",
        planRevision=1,
        capability="apple.reminders.create.v1",
        arguments={"title": "Meeting"},
        permissionDecision="confirmed",
    )
    assert repository.create_action(action)[1] is True
    for status, evidence in (
        ("submitted", {}),
        ("accepted", {}),
        ("completed", {}),
        ("verified", {"providerReadback": "reminder_test"}),
    ):
        repository.transition_action(
            "act_test", ActionResultModel(status=status, evidence=evidence)
        )
    receipt = repository.action_receipt("act_test")
    assert receipt["status"] == "verified"
    assert receipt["evidence"] == {"providerReadback": "reminder_test"}

    with psycopg.connect(DATABASE_URL) as connection, connection.cursor() as cursor:
        cursor.execute("SELECT count(*) FROM outbox WHERE completed_at IS NULL")
        assert cursor.fetchone() == (1,)
