import unittest
from datetime import UTC, datetime, timedelta

from olo_context.domain import ContextView, Observation, ObservationSource, Sensitivity
from olo_context.proactive import ProactiveDecisionEngine


NOW = datetime(2026, 11, 22, 10, tzinfo=UTC)


def event(*, identifier="obs_1", subject="person_1", starts_in=30,
          opted_in=True, confidence=1.0, sensitivity=Sensitivity.PERSONAL,
          permission="calendar.read", event_id="flight_1", expires_in=90):
    return Observation(
        id=identifier, subject_id=subject, kind="calendar.event",
        payload={"eventId": event_id, "title": "机场出发",
                 "startsAt": (NOW + timedelta(minutes=starts_in)).isoformat(),
                 "proactiveOptIn": opted_in},
        source=ObservationSource("fixture", "iphone_1", identifier),
        observed_at=NOW, received_at=NOW, permission_scope=permission,
        valid_until=NOW + timedelta(minutes=expires_in),
        confidence=confidence, sensitivity=sensitivity,
    )


def view(*items, subject="person_1"):
    return ContextView(subject, 1, NOW, tuple(items))


class ProactiveDecisionTests(unittest.TestCase):
    def test_eligible_event_suggested_once_without_execution(self):
        engine = ProactiveDecisionEngine()
        suggestions = engine.evaluate(view(event()), at=NOW)
        self.assertEqual(len(suggestions), 1)
        self.assertEqual(suggestions[0].event_key, "flight_1")
        self.assertIn("机场出发", suggestions[0].message)
        self.assertEqual(engine.evaluate(view(event()), at=NOW), ())

    def test_no_interruption_without_explicit_opt_in(self):
        engine = ProactiveDecisionEngine()
        self.assertEqual(engine.evaluate(view(event(opted_in=False)), at=NOW), ())
        self.assertEqual(engine.evaluate(view(event(permission="other.read")), at=NOW), ())
        self.assertEqual(engine.evaluate(view(event(confidence=0.5)), at=NOW), ())
        self.assertEqual(engine.evaluate(view(event(sensitivity=Sensitivity.SENSITIVE)), at=NOW), ())

    def test_expired_distant_and_other_subject_are_ignored(self):
        engine = ProactiveDecisionEngine()
        self.assertEqual(engine.evaluate(view(event(expires_in=-1)), at=NOW), ())
        self.assertEqual(engine.evaluate(view(event(starts_in=90)), at=NOW), ())
        self.assertEqual(engine.evaluate(view(event(subject="person_2")), at=NOW), ())

    def test_cooldown_scoped_by_subject_and_event(self):
        engine = ProactiveDecisionEngine(cooldown=timedelta(minutes=10))
        first = view(event())
        self.assertEqual(len(engine.evaluate(first, at=NOW)), 1)
        self.assertEqual(engine.evaluate(first, at=NOW + timedelta(minutes=5)), ())
        self.assertEqual(len(engine.evaluate(first, at=NOW + timedelta(minutes=11))), 1)
        other = view(event(identifier="obs_2", event_id="flight_2"))
        self.assertEqual(len(engine.evaluate(other, at=NOW)), 1)

    def test_invalid_timestamp_is_ignored_and_naive_evaluation_rejected(self):
        item = event()
        invalid = Observation(
            id=item.id, subject_id=item.subject_id, kind=item.kind,
            payload={**item.payload, "startsAt": "not-a-date"},
            source=item.source, observed_at=item.observed_at,
            received_at=item.received_at, permission_scope=item.permission_scope,
        )
        engine = ProactiveDecisionEngine()
        self.assertEqual(engine.evaluate(view(invalid), at=NOW), ())
        with self.assertRaises(ValueError):
            engine.evaluate(view(item), at=datetime(2026, 11, 22, 10))


if __name__ == "__main__":
    unittest.main()
