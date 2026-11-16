from __future__ import annotations

import hashlib
import os
from pathlib import Path

import psycopg


class MigrationDriftError(RuntimeError):
    pass


def migration_directory() -> Path:
    configured = os.getenv("OLO_MIGRATIONS_PATH")
    candidates = [
        Path(configured) if configured else None,
        Path(__file__).with_name("sql_migrations"),
        Path(__file__).resolve().parents[2] / "migrations",
        Path.cwd() / "services/api/migrations",
    ]
    for candidate in candidates:
        if candidate is not None and candidate.is_dir():
            return candidate
    raise FileNotFoundError("OLO SQL migrations directory is unavailable")


def _transaction_body(sql: str) -> str:
    body = sql.strip()
    if body.startswith("BEGIN;"):
        body = body[len("BEGIN;") :].lstrip()
    if body.endswith("COMMIT;"):
        body = body[: -len("COMMIT;")].rstrip()
    return body


def apply_migrations(database_url: str) -> None:
    directory = migration_directory()
    migrations = sorted(directory.glob("*.sql"))
    if not migrations:
        raise FileNotFoundError(f"no migrations found in {directory}")

    with psycopg.connect(database_url) as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version text PRIMARY KEY,
                checksum text NOT NULL,
                applied_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
        connection.commit()

        for path in migrations:
            sql = path.read_text()
            checksum = hashlib.sha256(sql.encode()).hexdigest()
            cursor.execute("SELECT pg_advisory_xact_lock(hashtext('olo.schema_migrations'))")
            cursor.execute(
                "SELECT checksum FROM schema_migrations WHERE version=%s",
                (path.name,),
            )
            existing = cursor.fetchone()
            if existing:
                if existing[0] != checksum:
                    raise MigrationDriftError(
                        f"applied migration {path.name} differs from the committed file"
                    )
                continue
            cursor.execute(_transaction_body(sql))
            cursor.execute(
                "INSERT INTO schema_migrations(version,checksum) VALUES (%s,%s)",
                (path.name, checksum),
            )
            connection.commit()
