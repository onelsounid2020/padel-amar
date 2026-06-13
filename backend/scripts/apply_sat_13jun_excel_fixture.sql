\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM matches
        WHERE event_id = 7
          AND (pair_one_score IS NOT NULL OR pair_two_score IS NOT NULL)
    ) THEN
        RAISE EXCEPTION 'El evento ya tiene resultados; no se reemplazo el fixture';
    END IF;

    IF (SELECT count(*) FROM event_pairs WHERE event_id = 7 AND category = '4TaC' AND seed BETWEEN 1 AND 12) <> 12 THEN
        RAISE EXCEPTION 'Las 12 parejas 4TaC esperadas no estan disponibles';
    END IF;
END $$;

DELETE FROM matches WHERE event_id = 7;

WITH pairs AS (
    SELECT id, seed
    FROM event_pairs
    WHERE event_id = 7 AND category = '4TaC' AND seed BETWEEN 1 AND 12
),
fixture(group_name, round_number, slot_time, court, seed_one, seed_two) AS (
    VALUES
        ('Grupo A', 1, '15:40-16:10', '1', 1, 2),
        ('Grupo A', 1, '15:40-16:10', '3', 3, 4),
        ('Grupo A', 2, '16:10-16:35', '1', 1, 3),
        ('Grupo A', 2, '16:10-16:35', '3', 2, 4),
        ('Grupo A', 3, '16:35-17:00', '1', 1, 4),
        ('Grupo A', 3, '16:35-17:00', '3', 2, 3),

        ('Grupo B', 1, '15:40-16:10', '5', 5, 6),
        ('Grupo B', 1, '15:40-16:10', '7', 7, 8),
        ('Grupo B', 2, '16:10-16:35', '5', 5, 7),
        ('Grupo B', 2, '16:10-16:35', '7', 6, 8),
        ('Grupo B', 3, '16:35-17:00', '5', 5, 8),
        ('Grupo B', 3, '16:35-17:00', '7', 6, 7),

        ('Grupo C', 1, '15:40-16:10', '9', 9, 10),
        ('Grupo C', 1, '15:40-16:10', '11', 11, 12),
        ('Grupo C', 2, '16:10-16:35', '9', 9, 11),
        ('Grupo C', 2, '16:10-16:35', '11', 10, 12),
        ('Grupo C', 3, '16:35-17:00', '9', 9, 12),
        ('Grupo C', 3, '16:35-17:00', '11', 10, 11)
)
INSERT INTO matches (event_id, pair_one_id, pair_two_id, round_name, court, created_at)
SELECT
    7,
    pair_one.id,
    pair_two.id,
    '4TaC - ' || fixture.group_name || ' - Ronda ' || fixture.round_number || ' - ' || fixture.slot_time,
    fixture.court,
    now()
FROM fixture
JOIN pairs pair_one ON pair_one.seed = fixture.seed_one
JOIN pairs pair_two ON pair_two.seed = fixture.seed_two;

UPDATE events
SET description = concat_ws(
        E'\n',
        nullif(description, ''),
        'Fixture 4TaC aplicado desde PadelNaty2series_13June_11canchas.xlsm: canchas 1, 3, 5, 7, 9 y 11; ranking de 15:40 a 17:00.'
    )
WHERE id = 7
  AND coalesce(description, '') NOT LIKE '%PadelNaty2series_13June_11canchas.xlsm%';

COMMIT;
