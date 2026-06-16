import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.auth import ensure_default_admin
from app.models import Event, EventPair, EventRegistration, Match, MatchResultSubmission, Payment, Player, Standing
from app.routers import auth, events, matches, pairs, payments, players, public, standings

logger = logging.getLogger("amar.database")

if os.getenv("RAILWAY_ENVIRONMENT") and settings.sqlalchemy_database_url.startswith("sqlite"):
    logger.warning(
        "Production-like Railway environment is using SQLite. "
        "Migrate DATABASE_URL to Railway PostgreSQL before relying on persistent production data."
    )
if os.getenv("RAILWAY_ENVIRONMENT") and not os.getenv("AUTH_SECRET"):
    logger.warning("AUTH_SECRET is not configured. Set a long random value so session tokens survive database changes safely.")

Base.metadata.create_all(bind=engine)


def ensure_local_schema() -> None:
    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    if "events" not in table_names:
        return
    columns = {column["name"] for column in inspector.get_columns("events")}
    with engine.begin() as connection:
        if "category_configs" not in columns:
            connection.execute(text("ALTER TABLE events ADD COLUMN category_configs JSON DEFAULT '[]'"))
        if "ranking_config" not in columns:
            connection.execute(text("ALTER TABLE events ADD COLUMN ranking_config JSON DEFAULT '{}'"))
        if "fixture_config" not in columns:
            connection.execute(text("ALTER TABLE events ADD COLUMN fixture_config JSON DEFAULT '{}'"))
        if "status" not in columns:
            connection.execute(text("ALTER TABLE events ADD COLUMN status VARCHAR(19) NOT NULL DEFAULT 'registration_open'"))
        if "event_type" not in columns:
            connection.execute(text("ALTER TABLE events ADD COLUMN event_type VARCHAR(7) NOT NULL DEFAULT 'hombres'"))
        if "users" in table_names:
            user_columns = {column["name"] for column in inspector.get_columns("users")}
            if "phone" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN phone VARCHAR(40)"))
            if "category" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN category VARCHAR(80)"))
            if "preferred_side" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN preferred_side VARCHAR(11)"))
        if "players" in table_names:
            player_columns = {column["name"] for column in inspector.get_columns("players")}
            if "user_id" not in player_columns:
                connection.execute(text("ALTER TABLE players ADD COLUMN user_id INTEGER REFERENCES users(id)"))
                connection.execute(text("CREATE INDEX IF NOT EXISTS ix_players_user_id ON players(user_id)"))
                player_columns.add("user_id")
            if "email" not in player_columns:
                connection.execute(text("ALTER TABLE players ADD COLUMN email VARCHAR(180)"))
                connection.execute(text("CREATE INDEX IF NOT EXISTS ix_players_email ON players(email)"))
                player_columns.add("email")
            if "users" in table_names and "user_id" in player_columns and "email" in player_columns:
                connection.execute(
                    text(
                        """
                        UPDATE players
                        SET email = (
                            SELECT users.email
                            FROM users
                            WHERE users.id = players.user_id
                        )
                        WHERE players.user_id IS NOT NULL
                        AND (players.email IS NULL OR players.email = '')
                        """
                    )
                )
        if "event_pairs" in table_names:
            pair_columns = {column["name"] for column in inspector.get_columns("event_pairs")}
            if "skill_level" not in pair_columns:
                connection.execute(text("ALTER TABLE event_pairs ADD COLUMN skill_level INTEGER NOT NULL DEFAULT 5"))
        if "event_registrations" in table_names:
            registration_columns = {column["name"] for column in inspector.get_columns("event_registrations")}
            if "identity_key" not in registration_columns:
                connection.execute(text("ALTER TABLE event_registrations ADD COLUMN identity_key VARCHAR(160)"))
            if "checked_in" not in registration_columns:
                connection.execute(text("ALTER TABLE event_registrations ADD COLUMN checked_in BOOLEAN NOT NULL DEFAULT 0"))
            duplicate_identities = connection.execute(
                text(
                    """
                    SELECT event_id, identity_key
                    FROM event_registrations
                    WHERE identity_key IS NOT NULL
                    GROUP BY event_id, identity_key
                    HAVING COUNT(*) > 1
                    LIMIT 1
                    """
                )
            ).first()
            if duplicate_identities is None:
                connection.execute(
                    text(
                        """
                        CREATE UNIQUE INDEX IF NOT EXISTS uq_event_registration_identity_idx
                        ON event_registrations(event_id, identity_key)
                        WHERE identity_key IS NOT NULL
                        """
                    )
                )


ensure_local_schema()
with SessionLocal() as db:
    ensure_default_admin(db)

app = FastAPI(title="Padel Manager API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+):5173$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(public.router)
app.include_router(events.router)
app.include_router(players.router)
app.include_router(pairs.router)
app.include_router(payments.router)
app.include_router(matches.router)
app.include_router(standings.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/db")
def database_health() -> dict[str, str]:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    database = "postgresql" if settings.sqlalchemy_database_url.startswith("postgresql") else "sqlite"
    return {"status": "ok", "database": database}
