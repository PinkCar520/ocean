# EH-05 workspace verification

Run `node scripts/engineering/verification.mjs /tmp/workspace-verification` after a frozen dependency install and Prisma generation. The checked-in matrix covers each tracked JS workspace package manifest, checks its declared build/typecheck/test scripts, and records existing external CI ownership and explicit gaps. It refuses missing workspaces and invented or uncovered commands.

The matrix executes additional checks that are not in the existing Core/CLI/Gateway quality workflow or website workflow, including shared UI typecheck/test and Desktop build/test. Workspace dependency order is computed from actual package manifests; missing dependencies or cycles fail explicitly. It stops at the first failed command and persists real results. A declared external check is not proof it executed at the same SHA; the existing workflow run must be verified independently.

OLO uses its existing Xcode 27 workflow. Visual interaction tests, native packaging and workspaces without tests remain gaps. This is not final EH-05 acceptance and does not change application code.
