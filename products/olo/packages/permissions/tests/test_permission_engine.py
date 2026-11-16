import unittest
from datetime import UTC, datetime, timedelta

from olo_permissions import Decision, PermissionEngine, PermissionPolicy, Proposal

NOW = datetime(2026, 9, 11, tzinfo=UTC)


class PermissionEngineTests(unittest.TestCase):
    def setUp(self):
        self.engine = PermissionEngine()
        self.proposal = Proposal(
            subject_id="person_1",
            capability="apple.reminders.create.v1",
            purpose="user_requested_reminder",
            plan_revision=2,
            arguments={"title": "Meeting"},
            body_id="iphone_1",
        )

    def test_no_policy_denies(self):
        result = self.engine.evaluate(self.proposal, [], NOW)
        self.assertEqual(result.decision, Decision.DENY)

    def test_expired_policy_denies(self):
        policy = PermissionPolicy(
            "policy_1",
            1,
            "person_1",
            self.proposal.capability,
            self.proposal.purpose,
            Decision.ALLOW,
            NOW - timedelta(seconds=1),
        )
        self.assertEqual(self.engine.evaluate(self.proposal, [policy], NOW).decision, Decision.DENY)

    def test_cost_ceiling_denies(self):
        proposal = Proposal(
            subject_id=self.proposal.subject_id,
            capability=self.proposal.capability,
            purpose=self.proposal.purpose,
            plan_revision=self.proposal.plan_revision,
            arguments=self.proposal.arguments,
            body_id=self.proposal.body_id,
            cost_minor=101,
        )
        policy = PermissionPolicy(
            "policy_1",
            1,
            "person_1",
            proposal.capability,
            proposal.purpose,
            Decision.CONFIRM,
            max_cost_minor=100,
        )
        self.assertEqual(self.engine.evaluate(proposal, [policy], NOW).decision, Decision.DENY)

    def test_latest_matching_revision_wins(self):
        policies = [
            PermissionPolicy(
                "policy_1",
                1,
                "person_1",
                self.proposal.capability,
                self.proposal.purpose,
                Decision.ALLOW,
            ),
            PermissionPolicy(
                "policy_1",
                2,
                "person_1",
                self.proposal.capability,
                self.proposal.purpose,
                Decision.CONFIRM,
            ),
        ]
        result = self.engine.evaluate(self.proposal, policies, NOW)
        self.assertEqual(result.decision, Decision.CONFIRM)
        self.assertEqual(result.policy_revision, 2)
        self.assertEqual(result.plan_revision, 2)


if __name__ == "__main__":
    unittest.main()
