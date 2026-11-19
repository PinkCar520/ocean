# Work/Life Workspace UI First Slice

## Goal

Align the Web/Desktop product model to two user-facing Spaces, Work and Life, while using the supplied agent-workspace references. Chat is available in both Spaces. Code is a Work capability, not a third Space.

## Current implementation findings

- The Gateway already has a persistent Run state machine, Worker execution, resumable event streams, approvals, retry/resume endpoints, steps, and artifact storage. Reuse these instead of adding another run lifecycle.
- The Run tool registry can bridge approved local file and notebook operations through `DeviceRpcBroker` to an authenticated CLI daemon. Device requests are session-bound and restricted to an explicit method list.
- The CLI daemon applies its local permission policy and confines file operations to its workspace. There is no equivalent Desktop-hosted agent process in the current Electron main/preload bridge.
- Web's Code projection reads repository, diff/review, and terminal-history APIs. It does not launch a coding Run. Web's Work projection supports project/task management.
- Desktop renders chat, history, skills, and projects. Its existing Workflows navigation is not wired to the Work projection.
- The current implementation also has an internal `code` Space and legacy UI routing. This UI slice hides that third Space and presents Code beneath Work; the backend ownership/data migration is deferred until the UI model is validated.

## Decisions

1. Keep Gateway/Worker as the authoritative Run control plane and the CLI daemon as the current local-workspace execution host.
2. Do not execute arbitrary shell commands in the Electron main process or add an unscoped shell RPC as part of the first slice.
3. Keep only Work and Life as user-facing Spaces. Sessions belong to one Space; Chat is available in both.
4. Present Code as a Work project capability/subview, not an independent navigation Space. Share the existing Code and Work projections through `packages/ui`.
5. Follow the reference layout's chat-first pattern: projects and sessions in navigation, workspace context and execution mode near the composer, with file/terminal/diff tools available as contextual panes.
6. Treat local coding execution, test commands, and workspace selection from Desktop as a follow-up slice. Before implementing those, define the Desktop-to-agent host contract, workspace binding, command approval semantics, and reconnect behavior.

## First slice and acceptance

- Web and Desktop use the same Work projection, with project/task and Code/repository views nested under Work.
- Desktop chat creates sessions in the selected Work or Life Space and displays only that Space's conversations.
- Work/Life remains switchable from both empty and active chats; changing Spaces opens a new chat in the selected Space.
- No Code Space option appears in the user-facing Space selector or navigation.
- Existing Web behavior for Work/Life conversations is preserved.
- No new Run state, shell execution surface, or permission bypass is introduced.

## Follow-up backend and coding workflow

1. Migrate repository, diff, review, and terminal records from the legacy `code` Space to Work, with explicit membership/access handling.
2. Bind a Work session to a selected repository/workspace and an authenticated local agent host.
3. Create and observe coding Runs through the existing Run API and resumable event stream.
4. Keep local file changes and any command execution within an explicitly selected workspace; require approval for writes and commands.
5. Present changed files, test output, and approval decisions in the same Run review surface.
6. Add cloud/remote execution only after the local-host contract and isolation model are validated.

## Validation

For the first slice, run the UI, Web, and Desktop TypeScript checks plus focused UI tests. For the later data migration, verify backfill and access behavior. For the execution slice, add contract and integration tests for session ownership, workspace confinement, approvals, disconnect/reconnect, and persisted Run-event recovery.
