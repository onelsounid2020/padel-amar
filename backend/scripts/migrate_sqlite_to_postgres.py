from __future__ import annotations

import os
import sys

from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.config import Settings
from app.database import Base
from app import models  # noqa: F401


def normalize_url(url: str) -> str:
    settings = Settings(database_url=url)
    return settings.sqlalchemy_database_url


def engine_from_env(name: str) -> Engine:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return create_engine(normalize_url(value))


def target_has_data(engine: Engine) -> bool:
    with Session(engine) as session:
        for table in Base.metadata.sorted_tables:
            if session.execute(select(func.count()).select_from(table)).scalar_one() > 0:
                return True
    return False


def reset_postgres_sequences(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        for table in Base.metadata.sorted_tables:
            if "id" not in table.c:
                continue
            connection.execute(
                text(
                    """
                    SELECT setval(
                        pg_get_serial_sequence(:table_name, 'id'),
                        COALESCE((SELECT MAX(id) FROM {table_name}), 1),
                        (SELECT COUNT(*) FROM {table_name}) > 0
                    )
                    """.format(table_name=table.name)
                ),
                {"table_name": table.name},
            )


def copy_data(source: Engine, target: Engine) -> None:
    Base.metadata.create_all(bind=target)
    if target_has_data(target) and os.getenv("ALLOW_NONEMPTY_TARGET") != "1":
        raise RuntimeError("Target database is not empty. Set ALLOW_NONEMPTY_TARGET=1 only after verifying this is safe.")

    with Session(source) as source_session, target.begin() as target_connection:
        for table in Base.metadata.sorted_tables:
            rows = [dict(row) for row in source_session.execute(select(table)).mappings()]
            if not rows:
                print(f"{table.name}: 0 rows")
                continue
            target_connection.execute(table.insert(), rows)
            print(f"{table.name}: {len(rows)} rows")
    reset_postgres_sequences(target)


def main() -> int:
    source = engine_from_env("SOURCE_DATABASE_URL")
    target = engine_from_env("TARGET_DATABASE_URL")
    if source.dialect.name != "sqlite":
        raise RuntimeError(f"Expected SQLite source, got {source.dialect.name}")
    if target.dialect.name != "postgresql":
        raise RuntimeError(f"Expected PostgreSQL target, got {target.dialect.name}")
    copy_data(source, target)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Migration failed: {error}", file=sys.stderr)
        raise SystemExit(1)
