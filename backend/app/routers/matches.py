from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.match import Match
from app.schemas.matches import MatchCreate, MatchRead, MatchResultUpdate
from app.services import generate_fixture, generate_group_fixture, generate_tournament_bracket, recalculate_standings

router = APIRouter(prefix="/events/{event_id}/matches", tags=["matches"])


@router.post("", response_model=MatchRead, status_code=201)
def create_match(event_id: int, payload: MatchCreate, db: Session = Depends(get_db)) -> Match:
    match = Match(event_id=event_id, **payload.model_dump())
    db.add(match)
    db.commit()
    db.refresh(match)
    return match


@router.get("", response_model=list[MatchRead])
def list_matches(event_id: int, db: Session = Depends(get_db)) -> list[Match]:
    return list(db.scalars(select(Match).where(Match.event_id == event_id).order_by(Match.created_at)))


@router.post("/generate-fixture", response_model=list[MatchRead], status_code=201)
def generate_event_fixture(
    event_id: int,
    minimum_matches: int = 5,
    courts: str | None = None,
    replace_unplayed: bool = True,
    format: str = "groups",
    group_size: int = 4,
    courts_per_group: int = 2,
    start_time: str = "17:00",
    set_minutes: int = 22,
    db: Session = Depends(get_db),
) -> list[Match]:
    if minimum_matches < 1:
        raise HTTPException(status_code=400, detail="El minimo de partidos debe ser mayor a 0")
    court_names = courts.split(",") if courts else None
    if format == "groups":
        try:
            return generate_group_fixture(
                db,
                event_id,
                minimum_matches=minimum_matches,
                replace_unplayed=replace_unplayed,
                courts=court_names,
                group_size=group_size,
                courts_per_group=courts_per_group,
                start_time=start_time,
                set_minutes=set_minutes,
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
    return generate_fixture(db, event_id, minimum_matches=minimum_matches, replace_unplayed=replace_unplayed, courts=court_names)


@router.post("/generate-bracket", response_model=list[MatchRead], status_code=201)
def generate_event_bracket(
    event_id: int,
    courts: str | None = None,
    db: Session = Depends(get_db),
) -> list[Match]:
    court_names = courts.split(",") if courts else None
    return generate_tournament_bracket(db, event_id, courts=court_names)


@router.patch("/{match_id}/result", response_model=MatchRead)
def register_result(
    event_id: int,
    match_id: int,
    payload: MatchResultUpdate,
    db: Session = Depends(get_db),
) -> Match:
    match = db.scalar(select(Match).where(Match.id == match_id, Match.event_id == event_id))
    if not match:
        raise HTTPException(status_code=404, detail="Partido no encontrado")
    match.pair_one_score = payload.pair_one_score
    match.pair_two_score = payload.pair_two_score
    match.played_at = payload.played_at
    if payload.pair_one_score == payload.pair_two_score:
        match.winner_pair_id = None
    else:
        match.winner_pair_id = match.pair_one_id if payload.pair_one_score > payload.pair_two_score else match.pair_two_id
    db.commit()
    db.refresh(match)
    recalculate_standings(db, event_id)
    return match
