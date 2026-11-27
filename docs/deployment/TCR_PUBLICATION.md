# TCR image publication and stack parity (R04)

Both Compose environments declare the same seven services: gateway, worker, web, fastapi-backend, postgres, redis, migrate. Gateway/worker/migrate share one image; migrate exits after Prisma migration. Development builds locally and uses the same pinned upstream database/cache images. Production uses five TCR digest references. Existing development databases initialized using db push must be backed up and baselined before enabling migrate; never reset an existing database just to pass startup.

## Administrator setup before merging

Create private TCR Personal repositories ocean-gateway, ocean-web, ocean-fastapi-backend, ocean-postgres, ocean-redis in the actual Ocean namespace. Set repository variable TCR_NAMESPACE to that namespace and production environment secrets TCR_USERNAME/TCR_PASSWORD to a dedicated credential able to push/pull the five repositories. Keep production restricted to main. Never commit credentials.

On main, the quality gate checks Compose topology, dependencies, pinned upstream sources and the built FastAPI image's health and embedding HTTP contract (mock provider). Then build three Ocean images and mirror the exact upstream PostgreSQL and Redis manifests. Mirroring fails closed if TCR changes the digest or cannot store the upstream manifest. All five revision tags must resolve to their expected digests before ocean-release.json is uploaded. Docker Hub publication and server deployment remain paused.

## Server acceptance (separate)

Use OCEAN_IMAGE_PREFIX=ccr.ccs.tencentyun.com/<namespace> and OCEAN_GATEWAY_DIGEST, OCEAN_WEB_DIGEST, OCEAN_FASTAPI_DIGEST, OCEAN_POSTGRES_DIGEST, OCEAN_REDIS_DIGEST from the verified manifest. Create private secrets/gateway.env, secrets/worker.env, secrets/fastapi.env; FastAPI only needs its model provider configuration. Supply DATABASE_URL and POSTGRES_PASSWORD locally. Pull using an independent read-only registry identity. Keep FastAPI, PostgreSQL and Redis internal. Validate migration, six healthy long-running services, actual provider embedding and skill matching before calling production accepted. No real provider credential is used in CI.

Do not enable version cleanup until production and rollback digests are protected.
