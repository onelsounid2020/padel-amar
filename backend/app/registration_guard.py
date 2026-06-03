from __future__ import annotations

import re
import unicodedata

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.player import EventPair, Player
from app.models.registration import EventRegistration

EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def normalize_name(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", (value or "").strip().lower())
    text = "".join(character for character in text if not unicodedata.combining(character))
    return re.sub(r"\s+", " ", text)


def normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def validate_email(value: str | None, *, field_name: str = "email") -> str:
    email = normalize_email(value)
    if not email:
        raise HTTPException(status_code=400, detail=f"Falta el {field_name}")
    if not EMAIL_PATTERN.fullmatch(email):
        raise HTTPException(status_code=400, detail=f"El {field_name} no es valido")
    return email


def normalize_phone(value: str | None) -> str:
    digits = re.sub(r"\D+", "", value or "")
    if digits.startswith("56") and len(digits) in {10, 11}:
        return digits[2:]
    return digits


def player_identity_keys(player: Player) -> list[str]:
    keys: list[str] = []
    email = normalize_email((player.email or player.user.email) if player.user else player.email)
    phone = normalize_phone(player.phone)
    name = normalize_name(player.name)
    if email:
        keys.append(f"email:{email}")
    if phone:
        keys.append(f"phone:{phone}")
    if player.user_id:
        keys.append(f"user:{player.user_id}")
    if name:
        keys.append(f"name:{name}")
    return keys


def primary_identity_key(player: Player) -> str:
    keys = player_identity_keys(player)
    if not keys:
        raise HTTPException(status_code=400, detail="Falta una identidad valida para el jugador")
    return keys[0]


def ensure_different_players(player_one: Player, player_two: Player | None) -> None:
    if not player_two:
        return
    if player_one.id == player_two.id:
        raise HTTPException(status_code=400, detail="El partner no puede ser el mismo jugador")
    shared_keys = set(player_identity_keys(player_one)) & set(player_identity_keys(player_two))
    if shared_keys:
        raise HTTPException(status_code=400, detail="El partner no puede tener los mismos datos del jugador")


def ensure_not_registered(db: Session, event_id: int, player: Player, *, exclude_pair_id: int | None = None) -> None:
    keys = player_identity_keys(player)
    if not keys:
        raise HTTPException(status_code=400, detail="Falta una identidad valida para el jugador")

    existing_registration = db.scalar(
        select(EventRegistration)
        .where(EventRegistration.event_id == event_id)
        .where(EventRegistration.pair_id != exclude_pair_id if exclude_pair_id else True)
        .where(
            or_(
                EventRegistration.player_id == player.id,
                EventRegistration.user_id == player.user_id if player.user_id else False,
                EventRegistration.identity_key.in_(keys),
            )
        )
    )
    if existing_registration:
        raise HTTPException(status_code=409, detail=f"{player.name} ya esta inscrito en este evento")

    event_players = db.scalars(
        select(Player)
        .join(
            EventPair,
            or_(EventPair.player_one_id == Player.id, EventPair.player_two_id == Player.id),
        )
        .where(EventPair.event_id == event_id)
        .where(EventPair.id != exclude_pair_id if exclude_pair_id else True)
    ).all()
    player_keys = set(keys)
    for existing_player in event_players:
        if existing_player.id == player.id or player_keys.intersection(player_identity_keys(existing_player)):
            raise HTTPException(status_code=409, detail=f"{player.name} ya esta inscrito en este evento")
