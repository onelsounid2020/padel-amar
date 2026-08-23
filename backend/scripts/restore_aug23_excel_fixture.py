from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

from import_aug23_fixture import Api, DEFAULT_API_URL, EVENT_DATE, EVENT_ID


SOURCE_BACKUP = Path(__file__).resolve().parents[2] / "tmp" / "event-18-backup-before-women-round-robin-20260823-115504.json"


def main() -> None:
    email = os.environ.get("AMAR_ADMIN_EMAIL")
    password = os.environ.get("AMAR_ADMIN_PASSWORD")
    if not email or not password:
        raise ValueError("Faltan AMAR_ADMIN_EMAIL y AMAR_ADMIN_PASSWORD")

    source = json.loads(SOURCE_BACKUP.read_text(encoding="utf-8"))
    source_event = source["event"]
    source_pairs = source["pairs"]
    source_matches = source["matches"]
    if source_event["date"] != EVENT_DATE:
        raise ValueError("El respaldo no corresponde al evento de hoy")
    if len(source_pairs) != 14 or len(source_matches) != 27:
        raise ValueError("El respaldo no contiene las 14 parejas y 27 partidos del Excel")

    source_women_pairs = [pair for pair in source_pairs if pair["category"] == "Mujeres"]
    source_women_ids = {pair["id"] for pair in source_women_pairs}
    source_women_matches = [
        match for match in source_matches
        if match["pair_one_id"] in source_women_ids and match["pair_two_id"] in source_women_ids
    ]
    if len(source_women_pairs) != 8 or len(source_women_matches) != 12:
        raise ValueError("El respaldo no coincide con la hoja female del Excel")

    api = Api(os.environ.get("AMAR_API_URL", DEFAULT_API_URL))
    api.token = api.request("/auth/login", "POST", {"email": email, "password": password})["access_token"]
    current_event = api.request(f"/events/{EVENT_ID}")
    current_pairs = api.request(f"/events/{EVENT_ID}/pairs")
    current_matches = api.request(f"/events/{EVENT_ID}/matches")
    current_standings = api.request(f"/events/{EVENT_ID}/standings")
    if current_event["date"] != EVENT_DATE:
        raise ValueError("El evento productivo no corresponde a hoy")

    backup_dir = Path(__file__).resolve().parents[2] / "tmp"
    backup = backup_dir / f"event-{EVENT_ID}-backup-before-restore-excel-{datetime.now():%Y%m%d-%H%M%S}.json"
    backup.write_text(json.dumps({
        "created_at": datetime.now().isoformat(),
        "event": current_event,
        "pairs": current_pairs,
        "matches": current_matches,
        "standings": current_standings,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    current_by_id = {pair["id"]: pair for pair in current_pairs}
    for pair in source_women_pairs:
        current = current_by_id.get(pair["id"])
        if not current or current["category"] != "Mujeres":
            raise ValueError(f"No encontré la pareja femenina {pair['id']} para restaurar")
        if current["player_one_id"] != pair["player_one_id"] or current["player_two_id"] != pair["player_two_id"]:
            api.request(f"/events/{EVENT_ID}/pairs/{pair['id']}", "PATCH", {
                "player_one_id": pair["player_one_id"],
                "player_two_id": pair["player_two_id"],
            })

    api.request(f"/events/{EVENT_ID}", "PATCH", {
        "schedule": source_event["schedule"],
        "category_configs": source_event["category_configs"],
        "fixture_config": source_event["fixture_config"],
        "fixture_visible": True,
    })
    created = api.request(f"/events/{EVENT_ID}/matches/bulk", "POST", {
        "matches": [{
            "pair_one_id": match["pair_one_id"],
            "pair_two_id": match["pair_two_id"],
            "round_name": match["round_name"],
            "court": match["court"],
            "played_at": match["played_at"],
        } for match in source_women_matches],
        "replace_unplayed": True,
        "replace_category": "Mujeres",
    })
    standings = api.request(f"/events/{EVENT_ID}/standings/recalculate", "POST", {})
    print(f"Restaurado desde Excel: {len(created)} partidos femeninos y {len(standings)} posiciones. Respaldo previo: {backup}")


if __name__ == "__main__":
    main()
