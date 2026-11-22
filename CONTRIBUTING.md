# Contributing to Ocean

Ocean is an evolving open-source agent platform. Please review the [README](./README.md) and [architecture documents](./docs/architecture/v2/README.md) before making changes.

## Development setup

1. Install the Node.js and pnpm versions required by the current root `package.json`.
2. Run `pnpm install --frozen-lockfile`.
3. Follow the README to configure local services and model credentials. Do not commit secrets or local `.env` files.
4. Run the relevant checks before submitting a pull request.

For website changes:

```bash
pnpm --filter @ocean/contracts build
pnpm --filter web typecheck
pnpm --filter web build
```

For broader changes, use the root checks documented in the README and relevant package tests.

## Pull requests

- Create a branch from the latest `main`; avoid direct pushes to `main`.
- Keep changes focused and describe the user-facing behavior, affected paths, and verification commands.
- Include actual CI results; do not claim that unrun tests passed.
- When changing shared runtime or host behavior, add tests for the production execution path.
- Preserve existing product entry points unless removal is explicitly part of the reviewed change.

## Issues and security

Use [GitHub Issues](https://github.com/PinkCar520/ocean/issues) for bugs and feature discussions. Do not disclose credentials, tokens, personal data, or exploitable security details in public issues. Check GitHub's security reporting options for a private channel before sharing vulnerability details.
