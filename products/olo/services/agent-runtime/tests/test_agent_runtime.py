import unittest

from olo_agent import AgentRuntime, Task, TaskStatus


class AgentRuntimeTests(unittest.TestCase):
    def test_capture_is_idempotent(self):
        runtime = AgentRuntime()
        task = Task("task_1", "person_1", "明天九点提醒我开会")
        self.assertTrue(runtime.capture(task, "key-1")[1])
        self.assertFalse(runtime.capture(task, "key-1")[1])

    def test_cannot_skip_verification(self):
        runtime = AgentRuntime()
        runtime.capture(Task("task_1", "person_1", "提醒我"), "key-1")
        runtime.transition("task_1", TaskStatus.UNDERSTANDING)
        runtime.transition("task_1", TaskStatus.PLANNING)
        runtime.transition("task_1", TaskStatus.EXECUTING)
        with self.assertRaises(ValueError):
            runtime.transition("task_1", TaskStatus.COMPLETED)

    def test_clarification_preserves_task_identity(self):
        runtime = AgentRuntime()
        runtime.capture(Task("task_1", "person_1", "下午提醒我去机场"), "key-1")
        runtime.transition("task_1", TaskStatus.UNDERSTANDING)
        runtime.transition("task_1", TaskStatus.NEEDS_INFORMATION)
        refined = runtime.transition("task_1", TaskStatus.UNDERSTANDING)
        self.assertEqual(refined.id, "task_1")

    def test_verified_path_completes(self):
        runtime = AgentRuntime()
        runtime.capture(Task("task_1", "person_1", "提醒我"), "key-1")
        for status in (
            TaskStatus.UNDERSTANDING,
            TaskStatus.PLANNING,
            TaskStatus.WAITING_FOR_PERMISSION,
            TaskStatus.EXECUTING,
            TaskStatus.VERIFYING,
            TaskStatus.COMPLETED,
        ):
            task = runtime.transition("task_1", status)
        self.assertEqual(task.status, TaskStatus.COMPLETED)


if __name__ == "__main__":
    unittest.main()
