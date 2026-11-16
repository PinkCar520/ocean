import unittest

from olo_tools import Action, ActionStatus, ToolDescriptor, ToolGateway


def action(permission="confirmed") -> Action:
    return Action(
        id="act_1",
        request_id="request_1",
        subject_id="person_1",
        plan_revision=1,
        capability="apple.reminders.create.v1",
        arguments={"title": "Meeting"},
        permission_decision=permission,
    )


class ToolGatewayTests(unittest.TestCase):
    def setUp(self):
        self.gateway = ToolGateway()
        self.gateway.register(
            ToolDescriptor(
                "apple.reminders.create.v1", "device", "reversible_write", True, True, True
            )
        )

    def test_unregistered_tool_cannot_execute(self):
        with self.assertRaises(ValueError):
            ToolGateway().prepare(action())

    def test_action_without_permission_cannot_execute(self):
        with self.assertRaises(PermissionError):
            self.gateway.prepare(action("confirm"))

    def test_duplicate_request_is_idempotent(self):
        item = action()
        self.assertTrue(self.gateway.prepare(item)[1])
        self.assertFalse(self.gateway.prepare(item)[1])

    def test_verified_requires_evidence(self):
        self.gateway.prepare(action())
        self.gateway.transition("act_1", ActionStatus.SUBMITTED)
        self.gateway.transition("act_1", ActionStatus.ACCEPTED)
        self.gateway.transition("act_1", ActionStatus.COMPLETED)
        with self.assertRaises(ValueError):
            self.gateway.transition("act_1", ActionStatus.VERIFIED)
        verified = self.gateway.transition(
            "act_1", ActionStatus.VERIFIED, evidence={"providerReadback": "reminder_1"}
        )
        self.assertEqual(verified.status, ActionStatus.VERIFIED)

    def test_unknown_outcome_can_be_reconciled(self):
        self.gateway.prepare(action())
        self.gateway.transition("act_1", ActionStatus.SUBMITTED)
        self.gateway.transition("act_1", ActionStatus.OUTCOME_UNKNOWN)
        recovered = self.gateway.transition("act_1", ActionStatus.ACCEPTED, provider_ref="ref_1")
        self.assertEqual(recovered.provider_ref, "ref_1")


if __name__ == "__main__":
    unittest.main()
