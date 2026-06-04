from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import current_user, require_permission, role_permissions
from app.database import get_db
from app.models.match import Match
from app.models.player import EventPair
from app.models.result_submission import MatchResultSubmission, ResultSubmissionStatus
from app.models.user import User
from app.schemas.matches import MatchCreate, MatchRead, MatchResultUpdate, ResultSubmissionCreate, ResultSubmissionRead
from app.services import generate_fixture, generate_group_fixture, generate_tournament_bracket, recalculate_standings

router = APIRouter(prefix="/events/{event_id}/matches", tags=["matches"])


@router.post("", response_model=MatchRead, status_code=201)
def create_match(
    event_id: int,
    payload: MatchCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("events")),
) -> Match:
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
    _: User = Depends(require_permission("events")),
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
    _: User = Depends(require_permission("events")),
) -> list[Match]:
    court_names = courts.split(",") if courts else None
    return generate_tournament_bracket(db, event_id, courts=court_names)


@router.patch("/{match_id}/result", response_model=MatchRead)
def register_result(
    event_id: int,
    match_id: int,
    payload: MatchResultUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("tablet")),
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
    _resolve_submissions_from_official_result(db, match, payload.pair_one_score, payload.pair_two_score)
    db.commit()
    db.refresh(match)
    recalculate_standings(db, event_id)
    return match


@router.post("/{match_id}/result-submissions", response_model=ResultSubmissionRead, status_code=201)
def submit_player_result(
    event_id: int,
    match_id: int,
    payload: ResultSubmissionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> MatchResultSubmission:
    match = _match_with_pairs(db, event_id, match_id)
    if not _user_is_match_player(user.id, match):
        raise HTTPException(status_code=403, detail="Solo los jugadores del partido pueden reportar este resultado")

    submission = db.scalar(
        select(MatchResultSubmission).where(
            MatchResultSubmission.match_id == match_id,
            MatchResultSubmission.submitted_by_user_id == user.id,
        )
    )
    if submission:
        submission.pair_one_score = payload.pair_one_score
        submission.pair_two_score = payload.pair_two_score
        submission.note = payload.note
        submission.status = ResultSubmissionStatus.pendiente
    else:
        submission = MatchResultSubmission(
            event_id=event_id,
            match_id=match_id,
            submitted_by_user_id=user.id,
            pair_one_score=payload.pair_one_score,
            pair_two_score=payload.pair_two_score,
            note=payload.note,
        )
        db.add(submission)
    db.flush()
    _evaluate_result_submissions(db, match)
    db.commit()
    db.refresh(submission)
    return submission


@router.get("/result-submissions", response_model=list[ResultSubmissionRead])
def list_result_submissions(
    event_id: int,
    status: ResultSubmissionStatus | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> list[MatchResultSubmission]:
    can_see_all = user.role.value == "superadmin" or role_permissions(db, user.role).get("tablet", False)
    query = select(MatchResultSubmission).where(MatchResultSubmission.event_id == event_id)
    if status:
        query = query.where(MatchResultSubmission.status == status)
    if not can_see_all:
        query = query.join(Match, Match.id == MatchResultSubmission.match_id)
        query = query.join(EventPair, (EventPair.id == Match.pair_one_id) | (EventPair.id == Match.pair_two_id))
        query = query.where(
            (EventPair.player_one.has(user_id=user.id)) | (EventPair.player_two.has(user_id=user.id))
        )
    return list(db.scalars(query.order_by(MatchResultSubmission.updated_at.desc())))


def _match_with_pairs(db: Session, event_id: int, match_id: int) -> Match:
    match = db.scalar(select(Match).where(Match.id == match_id, Match.event_id == event_id))
    if not match:
        raise HTTPException(status_code=404, detail="Partido no encontrado")
    return match


def _user_is_match_player(user_id: int, match: Match) -> bool:
    pairs = [match.pair_one, match.pair_two]
    return any(
        pair and (
            pair.player_one and pair.player_one.user_id == user_id
            or pair.player_two and pair.player_two.user_id == user_id
        )
        for pair in pairs
    )


def _apply_official_result(db: Session, match: Match, pair_one_score: int, pair_two_score: int) -> None:
    match.pair_one_score = pair_one_score
    match.pair_two_score = pair_two_score
    if pair_one_score == pair_two_score:
        match.winner_pair_id = None
    else:
        match.winner_pair_id = match.pair_one_id if pair_one_score > pair_two_score else match.pair_two_id
    db.flush()
    recalculate_standings(db, match.event_id)


def _resolve_submissions_from_official_result(db: Session, match: Match, pair_one_score: int, pair_two_score: int) -> None:
    submissions = db.scalars(select(MatchResultSubmission).where(MatchResultSubmission.match_id == match.id)).all()
    for submission in submissions:
        submission.status = (
            ResultSubmissionStatus.confirmado
            if submission.pair_one_score == pair_one_score and submission.pair_two_score == pair_two_score
            else ResultSubmissionStatus.descartado
        )


def _evaluate_result_submissions(db: Session, match: Match) -> None:
    submissions = list(
        db.scalars(
            select(MatchResultSubmission)
            .where(MatchResultSubmission.match_id == match.id)
            .where(MatchResultSubmission.status != ResultSubmissionStatus.descartado)
        )
    )
    score_groups: dict[tuple[int, int], list[MatchResultSubmission]] = {}
    for submission in submissions:
        score_groups.setdefault((submission.pair_one_score, submission.pair_two_score), []).append(submission)

    confirmed_score = next((score for score, items in score_groups.items() if len(items) >= 2), None)
    if confirmed_score:
        for submission in submissions:
            submission.status = (
                ResultSubmissionStatus.confirmado
                if (submission.pair_one_score, submission.pair_two_score) == confirmed_score
                else ResultSubmissionStatus.descartado
            )
        _apply_official_result(db, match, confirmed_score[0], confirmed_score[1])
        return

    if len(score_groups) > 1:
        for submission in submissions:
            submission.status = ResultSubmissionStatus.conflicto
        return

    for submission in submissions:
        submission.status = ResultSubmissionStatus.pendiente
