# TCR image publication (R04, stage 1)

This phase publishes images only. It does not deploy to a server. The production Compose file remains unchanged until the server pull/deployment phase.

## Administrator setup before merging

- Create private TCR Personal repositories `ocean-gateway` and `ocean-web` in the actual Ocean namespace.
- Set repository Actions variable `TCR_NAMESPACE` to that namespace (not a URL).
- Set Actions environment **production** secrets `TCR_USERNAME` and `TCR_PASSWORD` using a dedicated registry credential authorized to push and pull only the two repositories, if supported by TCR.
- Keep the production environment's branch restriction to main. Never commit or share credentials in logs.
- Ensure GitHub-hosted runners can reach `ccr.ccs.tencentyun.com`.

The workflow runs on main pushes or a manual dispatch on main. The existing reusable quality gate must pass before either build publishes. Both builds tag the checked-out revision (12-character SHA); the verification job checks each remote digest and the tag-to-digest match before producing an `ocean-release.json` artifact containing the full Git SHA and exact image references.

Docker Hub publication and the old self-hosted deploy job are paused in this phase. No server, SSH credential or self-hosted runner is required. Do not treat a successful image publication as production deployment.

## Acceptance

1. Both quality and image jobs pass in the same run.
2. Verify TCR publication passes and the manifest artifact exists with both images.
3. In TCR, confirm both revision tags and digests.
4. Separately verify server pull of the exact manifest references and the pinned PostgreSQL/Redis images; then adapt production Compose and implement restricted deployment.
5. Keep registry version cleanup disabled until current and rollback image references can be protected.
