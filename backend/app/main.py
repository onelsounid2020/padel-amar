from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.auth import ensure_default_admin
from app.models import Event, EventPair, EventRegistration, Match, Payment, Player, Standing
from app.routers import auth, events, matches, pairs, payments, players, public, standings

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
