from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.match import Match
from app.models.player import EventPair, PairStatus
from app.models.standing import Standing


def normalize_matchup(pair_one_id: int, pair_two_id: int) -> tuple[int, int]:
    return tuple(sorted((pair_one_id, pair_two_id)))


def build_round_robin_rounds(pair_ids: list[int], rounds_needed: int) -> list[list[tuple[int, int]]]:
    if len(pair_ids) < 2:
        return []

    teams = pair_ids[:]
    has_bye = len(teams) % 2 == 1
    if has_bye:
        teams.append(None)

    rounds = []
    total_slots = len(teams) - 1
    total_rounds = max(rounds_needed, total_slots)

    for round_index in range(total_rounds):
        round_matches = []
        for index in range(len(teams) // 2):
            first = teams[index]
            second = teams[-index - 1]
            if first is not None and second is not None:
                round_matches.append((first, second))
        rounds.append(round_matches)
        teams = [teams[0], teams[-1], *teams[1:-1]]

    return rounds


def normalize_courts(courts: list[str] | None) -> list[str]:
    if not courts:
        return []
    return [court.strip() for court in courts if court.strip()]


def format_slot_time(start_minutes: int, set_minutes: int, round_index: int) -> str:
    slot_start = start_minutes + ((round_index - 1) * set_minutes)
    slot_end = slot_start + set_minutes
    return f"{slot_start // 60:02d}:{slot_start % 60:02d}-{slot_end // 60:02d}:{slot_end % 60:02d}"


def parse_start_minutes(start_time: str) -> int:
    hours, minutes = start_time.split(":", 1)
    return (int(hours) * 60) + int(minutes)


def schedule_round_robin_group(
    group_pairs: list[EventPair],
    category: str,
    group_name: str,
    court_names: list[str],
    start_minutes: int,
    set_minutes: int,
) -> list[tuple[int, str, int, int, str]]:
    pair_ids = [pair.id for pair in group_pairs]
    round_matches = build_round_robin_rounds(pair_ids, len(pair_ids) - 1)[: len(pair_ids) - 1]
    scheduled: list[tuple[int, str, int, int, str]] = []
    slot_index = 0

    for round_index, matches_in_round in enumerate(round_matches, start=1):
        for match_index, (pair_one_id, pair_two_id) in enumerate(matches_in_round):
            local_slot = slot_index + (match_index // len(court_names))
            court = court_names[match_index % len(court_names)]
            slot_time = format_slot_time(start_minutes + (local_slot * set_minutes), set_minutes, 1)
            scheduled.append((round_index, court, pair_one_id, pair_two_id, slot_time))
        slot_index += (len(matches_in_round) + len(court_names) - 1) // len(court_names)

    return scheduled


def generate_group_fixture(
    db: Session,
    event_id: int,
    minimum_matches: int = 5,
    replace_unplayed: bool = True,
    courts: list[str] | None = None,
    group_size: int = 4,
    courts_per_group: int = 2,
    start_time: str = "17:00",
    set_minutes: int = 22,
) -> list[Match]:
    if group_size != 4:
        raise ValueError("El formato por grupos actualmente soporta grupos de 4 parejas")

    if replace_unplayed:
        db.execute(
            delete(Match).where(
                Match.event_id == event_id,
                Match.pair_one_score.is_(None),
                Match.pair_two_score.is_(None),
            )
        )
        db.flush()

    pairs = db.scalars(
        select(EventPair).where(
            EventPair.event_id == event_id,
            EventPair.status == PairStatus.completa,
            EventPair.player_two_id.is_not(None),
        )
    ).all()

    by_category: dict[str, list[EventPair]] = {}
    for pair in pairs:
        by_category.setdefault(pair.category, []).append(pair)

    court_names = normalize_courts(courts)
    if not court_names:
        court_names = [str(index) for index in range(1, 13)]

    group_letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    start_minutes = parse_start_minutes(start_time)
    created: list[Match] = []

    all_groups: list[tuple[str, str, list[EventPair], int]] = []
    for category, category_pairs in sorted(by_category.items()):
        ordered_pairs = sorted(category_pairs, key=lambda pair: (pair.seed is None, pair.seed or 9999, pair.id))
        groups: list[list[EventPair]] = []
        index = 0
        while index < len(ordered_pairs):
            remaining = len(ordered_pairs) - index
            if remaining == 6:
                current_group_size = 6
            elif remaining < group_size:
                current_group_size = remaining
            else:
                current_group_size = group_size
            group_pairs = ordered_pairs[index : index + current_group_size]
            if len(group_pairs) >= 2:
                groups.append(group_pairs)
            index += current_group_size

        for group_number, group_pairs in enumerate(groups):
            required_courts = max(1, len(group_pairs) // 2)
            if required_courts > len(court_names):
                raise ValueError("No hay canchas suficientes para programar un grupo sin choques")

            group_name = f"Grupo {group_letters[group_number]}"
            all_groups.append((category, group_name, group_pairs, required_courts))

    all_groups.sort(key=lambda item: (-item[3], item[0], item[1]))
    remaining_courts = court_names[:]
    for index, (category, group_name, group_pairs, required_courts) in enumerate(all_groups):
        remaining_groups = len(all_groups) - index
        max_assignable = max(1, len(remaining_courts) - (remaining_groups - 1))
        assigned_count = min(required_courts, max_assignable)
        group_courts = remaining_courts[:assigned_count]
        remaining_courts = remaining_courts[assigned_count:]
        group_schedule = schedule_round_robin_group(group_pairs, category, group_name, group_courts, start_minutes, set_minutes)

        for round_index, court, pair_one_id, pair_two_id, slot_time in group_schedule:
            match = Match(
                event_id=event_id,
                pair_one_id=pair_one_id,
                pair_two_id=pair_two_id,
                round_name=f"{category} - {group_name} - Ronda {round_index} - {slot_time}",
                court=court,
            )
            db.add(match)
            db.flush()
            created.append(match)

    games_by_pair: dict[int, int] = {}
    matchup_counts: dict[tuple[int, int], int] = {}
    occupied_slots = set()
    pair_slots = set()
    for match in created:
        slot = match.round_name.rsplit(" - ", 1)[-1]
        slot_index = (parse_start_minutes(slot.split("-", 1)[0]) - start_minutes) // set_minutes
        occupied_slots.add((slot_index, match.court))
        pair_slots.add((slot_index, match.pair_one_id))
        pair_slots.add((slot_index, match.pair_two_id))
        games_by_pair[match.pair_one_id] = games_by_pair.get(match.pair_one_id, 0) + 1
        games_by_pair[match.pair_two_id] = games_by_pair.get(match.pair_two_id, 0) + 1
        matchup = normalize_matchup(match.pair_one_id, match.pair_two_id)
        matchup_counts[matchup] = matchup_counts.get(matchup, 0) + 1

    for category, category_pairs in sorted(by_category.items()):
        category_pair_ids = [pair.id for pair in sorted(category_pairs, key=lambda pair: (pair.seed is None, pair.seed or 9999, pair.id))]
        if len(category_pair_ids) < 2:
            continue

        extra_round = 1
        while min(games_by_pair.get(pair_id, 0) for pair_id in category_pair_ids) < minimum_matches:
            candidates = []
            for index, pair_one_id in enumerate(category_pair_ids):
                for pair_two_id in category_pair_ids[index + 1:]:
                    if games_by_pair.get(pair_one_id, 0) >= minimum_matches and games_by_pair.get(pair_two_id, 0) >= minimum_matches:
                        continue
                    matchup = normalize_matchup(pair_one_id, pair_two_id)
                    candidates.append((
                        matchup_counts.get(matchup, 0),
                        games_by_pair.get(pair_one_id, 0) + games_by_pair.get(pair_two_id, 0),
                        pair_one_id,
                        pair_two_id,
                    ))
            if not candidates:
                break

            _, _, pair_one_id, pair_two_id = min(candidates)
            slot_index = 0
            court = None
            while court is None:
                for court_name in court_names:
                    if (
                        (slot_index, court_name) not in occupied_slots
                        and (slot_index, pair_one_id) not in pair_slots
                        and (slot_index, pair_two_id) not in pair_slots
                    ):
                        court = court_name
                        break
                if court is None:
                    slot_index += 1

            slot_time = format_slot_time(start_minutes + (slot_index * set_minutes), set_minutes, 1)
            match = Match(
                event_id=event_id,
                pair_one_id=pair_one_id,
                pair_two_id=pair_two_id,
                round_name=f"{category} - Extra - Ronda {extra_round} - {slot_time}",
                court=court,
            )
            db.add(match)
            db.flush()
            created.append(match)
            occupied_slots.add((slot_index, court))
            pair_slots.add((slot_index, pair_one_id))
            pair_slots.add((slot_index, pair_two_id))
            games_by_pair[pair_one_id] = games_by_pair.get(pair_one_id, 0) + 1
            games_by_pair[pair_two_id] = games_by_pair.get(pair_two_id, 0) + 1
            matchup = normalize_matchup(pair_one_id, pair_two_id)
            matchup_counts[matchup] = matchup_counts.get(matchup, 0) + 1
            extra_round += 1

    max_slot_index = max((slot_index for slot_index, _ in occupied_slots), default=-1)
    fill_round = 1
    for slot_index in range(max_slot_index + 1):
        occupied_courts = {court for occupied_slot, court in occupied_slots if occupied_slot == slot_index}
        while len(occupied_courts) < len(court_names):
            busy_pairs = {pair_id for busy_slot, pair_id in pair_slots if busy_slot == slot_index}
            candidates = []
            for category, category_pairs in sorted(by_category.items()):
                category_pair_ids = [
                    pair.id
                    for pair in sorted(category_pairs, key=lambda pair: (pair.seed is None, pair.seed or 9999, pair.id))
                    if pair.id not in busy_pairs
                ]
                for index, pair_one_id in enumerate(category_pair_ids):
                    for pair_two_id in category_pair_ids[index + 1:]:
                        matchup = normalize_matchup(pair_one_id, pair_two_id)
                        candidates.append((
                            matchup_counts.get(matchup, 0),
                            games_by_pair.get(pair_one_id, 0) + games_by_pair.get(pair_two_id, 0),
                            category,
                            pair_one_id,
                            pair_two_id,
                        ))

            if not candidates:
                break

            court = next((court_name for court_name in court_names if court_name not in occupied_courts), None)
            if court is None:
                break

            _, _, category, pair_one_id, pair_two_id = min(candidates)
            slot_time = format_slot_time(start_minutes + (slot_index * set_minutes), set_minutes, 1)
            match = Match(
                event_id=event_id,
                pair_one_id=pair_one_id,
                pair_two_id=pair_two_id,
                round_name=f"{category} - Refuerzo - Ronda {fill_round} - {slot_time}",
                court=court,
            )
            db.add(match)
            db.flush()
            created.append(match)
            occupied_slots.add((slot_index, court))
            occupied_courts.add(court)
            pair_slots.add((slot_index, pair_one_id))
            pair_slots.add((slot_index, pair_two_id))
            games_by_pair[pair_one_id] = games_by_pair.get(pair_one_id, 0) + 1
            games_by_pair[pair_two_id] = games_by_pair.get(pair_two_id, 0) + 1
            matchup = normalize_matchup(pair_one_id, pair_two_id)
            matchup_counts[matchup] = matchup_counts.get(matchup, 0) + 1
            fill_round += 1

    db.commit()
    for match in created:
        db.refresh(match)
    return created


def generate_fixture(
    db: Session,
    event_id: int,
    minimum_matches: int = 5,
    replace_unplayed: bool = True,
    courts: list[str] | None = None,
) -> list[Match]:
    if replace_unplayed:
        db.execute(
            delete(Match).where(
                Match.event_id == event_id,
                Match.pair_one_score.is_(None),
                Match.pair_two_score.is_(None),
            )
        )
        db.flush()

    existing = db.scalars(select(Match).where(Match.event_id == event_id)).all()
    existing_matchups = {normalize_matchup(match.pair_one_id, match.pair_two_id) for match in existing}

    pairs = db.scalars(
        select(EventPair).where(
            EventPair.event_id == event_id,
            EventPair.status == PairStatus.completa,
            EventPair.player_two_id.is_not(None),
        )
    ).all()

    by_category: dict[str, list[EventPair]] = {}
    for pair in pairs:
        by_category.setdefault(pair.category, []).append(pair)

    court_names = normalize_courts(courts)
    match_specs: list[tuple[str, int, int]] = []
    created: list[Match] = []
    pairs_by_category: dict[str, list[int]] = {}
    for category, category_pairs in by_category.items():
        ordered_pairs = sorted(category_pairs, key=lambda pair: (pair.seed is None, pair.seed or 9999, pair.id))
        pair_ids = [pair.id for pair in ordered_pairs]
        pairs_by_category[category] = pair_ids
        if len(pair_ids) < 2:
            continue

        if len(pair_ids) >= minimum_matches + 1:
            rounds_needed = minimum_matches if len(pair_ids) % 2 == 0 else minimum_matches + 1
            rounds = build_round_robin_rounds(pair_ids, rounds_needed)[:rounds_needed]
        else:
            rounds = build_round_robin_rounds(pair_ids, len(pair_ids) - 1)

        games_by_pair = {pair_id: 0 for pair_id in pair_ids}
        for round_index, round_matches in enumerate(rounds, start=1):
            for pair_one_id, pair_two_id in round_matches:
                matchup = normalize_matchup(pair_one_id, pair_two_id)
                if matchup in existing_matchups:
                    continue
                match_specs.append((category, pair_one_id, pair_two_id))
                existing_matchups.add(matchup)
                games_by_pair[pair_one_id] += 1
                games_by_pair[pair_two_id] += 1

        extra_round = len(rounds) + 1
        while pair_ids and min(games_by_pair.values()) < minimum_matches:
            made_progress = False
            for index, pair_one_id in enumerate(pair_ids):
                if games_by_pair[pair_one_id] >= minimum_matches:
                    continue
                opponents = sorted(pair_ids[index + 1 :] + pair_ids[:index], key=lambda pair_id: games_by_pair[pair_id])
                for pair_two_id in opponents:
                    if pair_one_id == pair_two_id or games_by_pair[pair_two_id] >= minimum_matches:
                        continue
                    match_specs.append((category, pair_one_id, pair_two_id))
                    games_by_pair[pair_one_id] += 1
                    games_by_pair[pair_two_id] += 1
                    made_progress = True
                    break
            if not made_progress:
                break
            extra_round += 1

    active_courts = court_names or ["1"]
    if len(active_courts) > 1 and match_specs:
        games_by_pair: dict[int, int] = {}
        for _, pair_one_id, pair_two_id in match_specs:
            games_by_pair[pair_one_id] = games_by_pair.get(pair_one_id, 0) + 1
            games_by_pair[pair_two_id] = games_by_pair.get(pair_two_id, 0) + 1

        missing_slots = (-len(match_specs)) % len(active_courts)
        for _ in range(missing_slots):
            partial_turn = match_specs[-(len(match_specs) % len(active_courts)) :] if len(match_specs) % len(active_courts) else []
            busy_pairs = {pair_id for _, one, two in partial_turn for pair_id in (one, two)}
            candidates: list[tuple[int, int, str, int, int]] = []
            for category, pair_ids in pairs_by_category.items():
                available_pair_ids = [pair_id for pair_id in pair_ids if pair_id not in busy_pairs]
                for index, pair_one_id in enumerate(available_pair_ids):
                    for pair_two_id in available_pair_ids[index + 1 :]:
                        matchup = normalize_matchup(pair_one_id, pair_two_id)
                        repeat_penalty = 1 if matchup in existing_matchups else 0
                        load = games_by_pair.get(pair_one_id, 0) + games_by_pair.get(pair_two_id, 0)
                        candidates.append((repeat_penalty, load, category, pair_one_id, pair_two_id))

            if not candidates:
                break

            _, _, category, pair_one_id, pair_two_id = min(candidates)
            match_specs.append((category, pair_one_id, pair_two_id))
            existing_matchups.add(normalize_matchup(pair_one_id, pair_two_id))
            games_by_pair[pair_one_id] = games_by_pair.get(pair_one_id, 0) + 1
            games_by_pair[pair_two_id] = games_by_pair.get(pair_two_id, 0) + 1

    for index, (category, pair_one_id, pair_two_id) in enumerate(match_specs):
        turn = (index // len(active_courts)) + 1
        court = active_courts[index % len(active_courts)]
        match = Match(
            event_id=event_id,
            pair_one_id=pair_one_id,
            pair_two_id=pair_two_id,
            round_name=f"{category} - Turno {turn}",
            court=court,
        )
        db.add(match)
        db.flush()
        created.append(match)

    db.commit()
    for match in created:
        db.refresh(match)
    return created


def generate_tournament_bracket(
    db: Session,
    event_id: int,
    courts: list[str] | None = None,
) -> list[Match]:
    recalculate_standings(db, event_id)
    standings = list(
        db.scalars(
            select(Standing)
            .join(EventPair)
            .where(Standing.event_id == event_id)
            .order_by(EventPair.category, Standing.position)
        )
    )

    by_category: dict[str, list[Standing]] = {}
    for standing in standings:
        if standing.position is not None:
            by_category.setdefault(standing.pair.category, []).append(standing)

    court_names = normalize_courts(courts) or [str(index) for index in range(1, 5)]
    existing = db.scalars(select(Match).where(Match.event_id == event_id)).all()
    created: list[Match] = []
    next_court = 0

    def add_match(category: str, stage: str, pair_one_id: int, pair_two_id: int) -> None:
        nonlocal next_court
        already_exists = any(
            match.round_name == f"{category} - Torneo - {stage}"
            and {match.pair_one_id, match.pair_two_id} == {pair_one_id, pair_two_id}
            for match in existing + created
        )
        if already_exists:
            return
        match = Match(
            event_id=event_id,
            pair_one_id=pair_one_id,
            pair_two_id=pair_two_id,
            round_name=f"{category} - Torneo - {stage}",
            court=court_names[next_court % len(court_names)],
        )
        next_court += 1
        db.add(match)
        db.flush()
        created.append(match)

    for category, category_standings in by_category.items():
        ordered = sorted(category_standings, key=lambda item: item.position or 9999)
        if len(ordered) < 4 or any(item.played == 0 for item in ordered[:4]):
            continue

        semifinals = [
            match
            for match in existing
            if match.round_name.startswith(f"{category} - Torneo - Semifinal")
        ]
        if not semifinals:
            add_match(category, "Semifinal 1", ordered[0].pair_id, ordered[3].pair_id)
            add_match(category, "Semifinal 2", ordered[1].pair_id, ordered[2].pair_id)
            continue

        if len(semifinals) < 2 or any(match.pair_one_score is None or match.pair_two_score is None for match in semifinals):
            continue

        winners = [match.winner_pair_id for match in semifinals if match.winner_pair_id]
        losers = [
            match.pair_two_id if match.winner_pair_id == match.pair_one_id else match.pair_one_id
            for match in semifinals
            if match.winner_pair_id
        ]
        if len(winners) == 2:
            add_match(category, "Final", winners[0], winners[1])
        if len(losers) == 2:
            add_match(category, "Tercer lugar", losers[0], losers[1])

    db.commit()
    for match in created:
        db.refresh(match)
    return created


def recalculate_standings(db: Session, event_id: int) -> list[Standing]:
    db.execute(delete(Standing).where(Standing.event_id == event_id))
    db.flush()

    pairs = db.scalars(select(EventPair).where(EventPair.event_id == event_id)).all()
    by_pair = {
        pair.id: Standing(
            event_id=event_id,
            pair_id=pair.id,
            played=0,
            won=0,
            lost=0,
            points_for=0,
            points_against=0,
            points=0,
        )
        for pair in pairs
        if pair.status != PairStatus.lista_espera
    }

    matches = db.scalars(
        select(Match).where(
            Match.event_id == event_id,
            Match.pair_one_score.is_not(None),
            Match.pair_two_score.is_not(None),
        )
    ).all()

    for match in matches:
        one = by_pair.get(match.pair_one_id)
        two = by_pair.get(match.pair_two_id)
        if one is None or two is None:
            continue

        one.played += 1
        two.played += 1
        one.points_for += match.pair_one_score or 0
        one.points_against += match.pair_two_score or 0
        two.points_for += match.pair_two_score or 0
        two.points_against += match.pair_one_score or 0

        if match.winner_pair_id == match.pair_one_id:
            one.won += 1
            two.lost += 1
            one.points += 3
        elif match.winner_pair_id == match.pair_two_id:
            two.won += 1
            one.lost += 1
            two.points += 3
        else:
            one.points += 1
            two.points += 1

    ordered = sorted(
        by_pair.values(),
        key=lambda item: (item.points, item.won, item.points_for - item.points_against, item.points_for),
        reverse=True,
    )
    for index, standing in enumerate(ordered, start=1):
        standing.position = index
        db.add(standing)

    db.commit()
    return ordered


def format_pair(pair: EventPair) -> str:
    second = f" / {pair.player_two.name}" if pair.player_two else " / buscando partner"
    return f"{pair.player_one.name}{second} ({pair.category})"
