import unittest
from datetime import UTC, datetime, timedelta

from olo_context import ContextEngine, Observation, ObservationConflict, ObservationSource


def observation(identifier: str = "obs_1", *, valid_until=None) -> Observation:
    now = datetime(2026, 9, 11, tzinfo=UTC)
    return Observation(
        id=identifier,
        subject_id="person_1",
        kind="calendar.event",
        payload={"title": "Meeting"},
        source=ObservationSource("fixture", "iphone_1", identifier),
        observed_at=now,
        received_at=now,
        valid_until=valid_until,
        confidence=1.0,
        permission_scope="calendar.read",
    )


class ContextEngineTests(unittest.TestCase):
    def test_idempotent_ingest_returns_existing_object(self):
        engine = ContextEngine()
        item = observation()
        self.assertTrue(engine.ingest(item, "key-1")[1])
        stored, created = engine.ingest(item, "key-1")
        self.assertFalse(created)
        self.assertEqual(stored, item)

    def test_idempotency_conflict_is_visible(self):
        engine = ContextEngine()
        engine.ingest(observation("obs_1"), "key-1")
        with self.assertRaises(ObservationConflict):
            engine.ingest(observation("obs_2"), "key-1")

    def test_current_view_excludes_expired_evidence(self):
        now = datetime(2026, 9, 11, tzinfo=UTC)
        engine = ContextEngine()
        engine.ingest(observation("obs_old", valid_until=now - timedelta(seconds=1)), "old")
        engine.ingest(observation("obs_new", valid_until=now + timedelta(hours=1)), "new")
        view = engine.current_view("person_1", now)
        self.assertEqual([item.id for item in view.observations], ["obs_new"])

    def test_naive_timestamp_is_rejected(self):
        with self.assertRaises(ValueError):
            Observation(
                id="obs_bad",
                subject_id="person_1",
                kind="fixture",
                payload={},
                source=ObservationSource("fixture", "body_1", "bad"),
                observed_at=datetime(2026, 9, 11),  # noqa: DTZ001 - deliberately invalid
                received_at=datetime.now(UTC),
                permission_scope="fixture.read",
            )


if __name__ == "__main__":
    unittest.main()
