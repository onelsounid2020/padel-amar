from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.player import Player
from app.schemas.players import PlayerCreate, PlayerRead

router = APIRouter(prefix="/players", tags=["players"])


@router.post("", response_model=PlayerRead, status_code=201)
def create_player(payload: PlayerCreate, db: Session = Depends(get_db)) -> Player:
    player = Player(**payload.model_dump())
    db.add(player)
    db.commit()
    db.refresh(player)
    return player


@router.get("", response_model=list[PlayerRead])
def list_players(db: Session = Depends(get_db)) -> list[Player]:
    return list(db.scalars(select(Player).order_by(Player.name)))
