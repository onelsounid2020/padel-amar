\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM matches
        WHERE event_id = 7
          AND (pair_one_score IS NOT NULL OR pair_two_score IS NOT NULL)
    ) THEN
        RAISE EXCEPTION 'El evento ya tiene resultados; no se modifico el fixture';
    END IF;

    IF (SELECT count(*) FROM event_pairs WHERE event_id = 7 AND category = '4TaC') <> 12 THEN
        RAISE EXCEPTION 'Se esperaban exactamente 12 parejas 4TaC';
    END IF;
END $$;

DELETE FROM matches
WHERE event_id = 7
  AND pair_one_id IN (SELECT id FROM event_pairs WHERE event_id = 7 AND category = '4TaC')
  AND pair_two_id IN (SELECT id FROM event_pairs WHERE event_id = 7 AND category = '4TaC');

WITH pairs AS (
    SELECT id, seed FROM event_pairs
    WHERE event_id = 7 AND category = '4TaC' AND seed BETWEEN 1 AND 12
),
fixture(group_name, round_number, start_time, court, seed_one, seed_two) AS (
    VALUES
        ('Grupo A', 1, '15:40-16:05', '1', 1, 4),
        ('Grupo A', 1, '15:40-16:05', '2', 2, 3),
        ('Grupo A', 2, '16:05-16:30', '1', 1, 3),
        ('Grupo A', 2, '16:05-16:30', '2', 4, 2),
        ('Grupo A', 3, '16:30-16:55', '1', 1, 2),
        ('Grupo A', 3, '16:30-16:55', '2', 3, 4),

        ('Grupo B', 1, '15:40-16:05', '3', 5, 8),
        ('Grupo B', 1, '15:40-16:05', '4', 6, 7),
        ('Grupo B', 2, '16:05-16:30', '3', 5, 7),
        ('Grupo B', 2, '16:05-16:30', '4', 8, 6),
        ('Grupo B', 3, '16:30-16:55', '3', 5, 6),
        ('Grupo B', 3, '16:30-16:55', '4', 7, 8),

        ('Grupo C', 1, '15:40-16:05', '5', 9, 12),
        ('Grupo C', 1, '15:40-16:05', '6', 10, 11),
        ('Grupo C', 2, '16:05-16:30', '5', 9, 11),
        ('Grupo C', 2, '16:05-16:30', '6', 12, 10),
        ('Grupo C', 3, '16:30-16:55', '5', 9, 10),
        ('Grupo C', 3, '16:30-16:55', '6', 11, 12)
)
INSERT INTO matches (event_id, pair_one_id, pair_two_id, round_name, court, created_at)
SELECT
    7,
    pair_one.id,
    pair_two.id,
    '4TaC - ' || fixture.group_name || ' - Ronda ' || fixture.round_number || ' - ' || fixture.start_time,
    fixture.court,
    now()
FROM fixture
JOIN pairs pair_one ON pair_one.seed = fixture.seed_one
JOIN pairs pair_two ON pair_two.seed = fixture.seed_two;

UPDATE events
SET description = concat_ws(
        E'\n',
        nullif(description, ''),
        'Formato 4TaC: grupos A, B y C de 4 parejas; 3 partidos de ranking por pareja. Semifinales: 1A vs 1C y 1B vs mejor segundo de los tres grupos.'
    )
WHERE id = 7
  AND coalesce(description, '') NOT LIKE '%Semifinales: 1A vs 1C%';

COMMIT;
