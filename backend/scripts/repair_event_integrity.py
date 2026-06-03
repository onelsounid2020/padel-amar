from __future__ import annotations

import argparse
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Event, EventPair, EventRegistration, PairStatus, Payment, Player, RegistrationRole, RegistrationStatus
from app.registration_guard import primary_identity_key
from app.services import sync_player_payments


def registration_statuses(status: PairStatus, has_partner: bool) -> tuple[RegistrationStatus, RegistrationStatus]:
    if status == PairStatus.lista_espera:
        return RegistrationStatus.lista_espera, RegistrationStatus.lista_espera
    if has_partner and status == PairStatus.completa:
        return RegistrationStatus.confirmada, RegistrationStatus.confirmada
    return RegistrationStatus.buscando_partner, RegistrationStatus.buscando_partner


def repair_pair(db: Session, pair: EventPair, *, apply: bool) -> list[str]:
    changes: list[str] = []
    players: list[tuple[Player, RegistrationRole, RegistrationStatus]] = []
    primary_status, partner_status = registration_statuses(pair.status, pair.player_two_id is not None)
    player_one = db.get(Player, pair.player_one_id)
    player_two = db.get(Player, pair.player_two_id) if pair.player_two_id else None
    if player_one:
        players.append((player_one, RegistrationRole.jugador, primary_status))
    if player_two:
        players.append((player_two, RegistrationRole.partner, partner_status))

    valid_player_ids = {player.id for player, _, _ in players}
    stale_registrations = db.scalars(
        select(EventRegistration).where(
            EventRegistration.pair_id == pair.id,
            EventRegistration.player_id.not_in(valid_player_ids),
        )
    ).all()
    for registration in stale_registrations:
        changes.append(f"delete stale registration {registration.id} for pair {pair.id}")
        if apply:
            db.delete(registration)

    for player, role, status in players:
        registration = db.scalar(
            select(EventRegistration).where(
                EventRegistration.event_id == pair.event_id,
                EventRegistration.pair_id == pair.id,
                EventRegistration.player_id == player.id,
            )
        )
        if registration:
            if registration.identity_key != primary_identity_key(player):
                changes.append(f"update identity for registration {registration.id}")
                if apply:
                    registration.identity_key = primary_identity_key(player)
            if registration.status != status or registration.role != role or registration.category != pair.category:
                changes.append(f"update registration {registration.id} status/role/category")
                if apply:
                    registration.status = status
                    registration.role = role
                    registration.category = pair.category
            continue
        changes.append(f"create registration for pair {pair.id}, player {player.id}")
        if apply:
            db.add(
                EventRegistration(
                    event_id=pair.event_id,
                    pair_id=pair.id,
                    player_id=player.id,
                    user_id=player.user_id,
                    identity_key=primary_identity_key(player),
                    role=role,
                    category=pair.category,
                    status=status,
                    source="repair",
                )
            )

    legacy_payment = db.scalar(select(Payment).where(Payment.event_id == pair.event_id, Payment.pair_id == pair.id))
    if pair.status == PairStatus.lista_espera and legacy_payment:
        changes.append(f"delete waitlist legacy payment for pair {pair.id}")
        if apply:
            db.delete(legacy_payment)
    if pair.status != PairStatus.lista_espera and not legacy_payment:
        changes.append(f"create legacy payment for active pair {pair.id}")
        if apply:
            db.add(Payment(event_id=pair.event_id, pair_id=pair.id))

    return changes


def repair_event_integrity(db: Session, *, apply: bool) -> list[str]:
    changes: list[str] = []
    events = db.scalars(select(Event).order_by(Event.id)).all()
    for event in events:
        pairs = db.scalars(select(EventPair).where(EventPair.event_id == event.id).order_by(EventPair.id)).all()
        for pair in pairs:
            changes.extend(repair_pair(db, pair, apply=apply))
        if apply:
            sync_player_payments(db, event.id)
    if apply:
        db.commit()
    else:
        db.rollback()
    return changes


def main() -> None:
    parser = argparse.ArgumentParser(description="Repair pair registrations and payments for the configured database.")
    parser.add_argument("--apply", action="store_true", help="Apply changes. Without this flag the script only reports.")
    args = parser.parse_args()

    with SessionLocal() as db:
        changes = repair_event_integrity(db, apply=args.apply)
    mode = "APPLIED" if args.apply else "DRY RUN"
    print(f"{mode}: {len(changes)} change(s)")
    for change in changes:
        print(f"- {change}")


if __name__ == "__main__":
    main()
