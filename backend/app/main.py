from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.models import Event, EventPair, Match, Payment, Player, Standing
from app.routers import events, matches, pairs, payments, players, standings

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Padel Manager API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(events.router)
app.include_router(players.router)
app.include_router(pairs.router)
app.include_router(payments.router)
app.include_router(matches.router)
app.include_router(standings.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
