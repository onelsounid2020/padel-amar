\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE import_pairs (
    group_name text NOT NULL,
    seed integer NOT NULL,
    player_one_name text NOT NULL,
    player_two_name text NOT NULL,
    player_one_email text NOT NULL,
    player_two_email text NOT NULL
) ON COMMIT DROP;

INSERT INTO import_pairs VALUES
    ('Grupo A', 101, 'Arturo',    'Ivonne',     'amar-20260613-5tad-a1-1@local.invalid', 'amar-20260613-5tad-a1-2@local.invalid'),
    ('Grupo A', 102, 'Marco',     'Maka',       'amar-20260613-5tad-a2-1@local.invalid', 'amar-20260613-5tad-a2-2@local.invalid'),
    ('Grupo A', 103, 'Roberto',   'Daniela',    'amar-20260613-5tad-a3-1@local.invalid', 'amar-20260613-5tad-a3-2@local.invalid'),
    ('Grupo A', 104, 'Pauli',     'Seba',       'amar-20260613-5tad-a4-1@local.invalid', 'amar-20260613-5tad-a4-2@local.invalid'),
    ('Grupo B', 105, 'Cris',      'Day',        'amar-20260613-5tad-b1-1@local.invalid', 'amar-20260613-5tad-b1-2@local.invalid'),
    ('Grupo B', 106, 'Yenny',     'Francisco',  'amar-20260613-5tad-b2-1@local.invalid', 'amar-20260613-5tad-b2-2@local.invalid'),
    ('Grupo B', 107, 'Diman',     'Caro',       'amar-20260613-5tad-b3-1@local.invalid', 'amar-20260613-5tad-b3-2@local.invalid'),
    ('Grupo B', 108, 'Maca',      'Javier',     'amar-20260613-5tad-b4-1@local.invalid', 'amar-20260613-5tad-b4-2@local.invalid'),
    ('Grupo C', 109, 'Patricio',  'Coni',       'amar-20260613-5tad-c1-1@local.invalid', 'amar-20260613-5tad-c1-2@local.invalid'),
    ('Grupo C', 110, 'Ale M',     'Fredy',      'amar-20260613-5tad-c2-1@local.invalid', 'amar-20260613-5tad-c2-2@local.invalid'),
    ('Grupo C', 111, 'Matias',    'MariaJesus', 'amar-20260613-5tad-c3-1@local.invalid', 'amar-20260613-5tad-c3-2@local.invalid'),
    ('Grupo C', 112, 'Constanza', 'Pablo',      'amar-20260613-5tad-c4-1@local.invalid', 'amar-20260613-5tad-c4-2@local.invalid');

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM matches
        WHERE event_id = 7 AND (pair_one_score IS NOT NULL OR pair_two_score IS NOT NULL)
    ) THEN
        RAISE EXCEPTION 'El evento ya tiene resultados; no se importo 5taD';
    END IF;
END $$;

-- Elimina la pareja aislada de prueba Arturo/Ivonne, pero conserva sus perfiles.
DELETE FROM event_pairs
WHERE event_id = 7
  AND category = '5ta'
  AND id IN (
      SELECT ep.id
      FROM event_pairs ep
      JOIN players p1 ON p1.id = ep.player_one_id
      JOIN players p2 ON p2.id = ep.player_two_id
      WHERE ep.event_id = 7
        AND lower(p1.name) = 'arturo'
        AND lower(p2.name) = 'ivonne'
  );

INSERT INTO players (name, email, phone, category, preferred_side, created_at)
SELECT source.name, source.email, NULL, '5taD', 'indiferente', now()
FROM (
    SELECT player_one_name AS name, player_one_email AS email FROM import_pairs
    UNION ALL
    SELECT player_two_name, player_two_email FROM import_pairs
) source
WHERE NOT EXISTS (SELECT 1 FROM players WHERE players.email = source.email);

INSERT INTO event_pairs (event_id, player_one_id, player_two_id, category, skill_level, status, seed, created_at)
SELECT 7, p1.id, p2.id, '5taD', 5, 'completa', source.seed, now()
FROM import_pairs source
JOIN players p1 ON p1.email = source.player_one_email
JOIN players p2 ON p2.email = source.player_two_email;

INSERT INTO event_registrations (
    event_id, pair_id, player_id, user_id, identity_key, role, category,
    status, payment_status, checked_in, source, created_at, updated_at
)
SELECT 7, ep.id, p1.id, p1.user_id, 'email:' || lower(p1.email), 'jugador', '5taD',
       'confirmada', 'pendiente', false, 'admin', now(), now()
FROM import_pairs source
JOIN players p1 ON p1.email = source.player_one_email
JOIN event_pairs ep ON ep.event_id=7 AND ep.player_one_id=p1.id;

INSERT INTO event_registrations (
    event_id, pair_id, player_id, user_id, identity_key, role, category,
    status, payment_status, checked_in, source, created_at, updated_at
)
SELECT 7, ep.id, p2.id, p2.user_id, 'email:' || lower(p2.email), 'partner', '5taD',
       'confirmada', 'pendiente', false, 'admin', now(), now()
FROM import_pairs source
JOIN players p2 ON p2.email = source.player_two_email
JOIN event_pairs ep ON ep.event_id=7 AND ep.player_two_id=p2.id;

INSERT INTO payments (event_id, pair_id, amount, status, updated_at)
SELECT 7, ep.id, event.price, 'pendiente', now()
FROM event_pairs ep JOIN events event ON event.id=7
WHERE ep.event_id=7 AND ep.category='5taD';

INSERT INTO player_payments (event_id, pair_id, player_id, amount, status, updated_at)
SELECT 7, ep.id, player.id, event.price, 'pendiente', now()
FROM event_pairs ep
JOIN events event ON event.id=7
JOIN LATERAL (VALUES (ep.player_one_id), (ep.player_two_id)) player(id) ON true
WHERE ep.event_id=7 AND ep.category='5taD';

WITH pairs AS (
    SELECT id, seed FROM event_pairs WHERE event_id=7 AND category='5taD'
),
fixture(group_name, round_number, slot_time, court, seed_one, seed_two) AS (
    VALUES
        ('Grupo A',1,'19:00-19:22','2',101,102), ('Grupo A',1,'19:00-19:22','4',103,104),
        ('Grupo A',2,'19:23-19:45','2',101,103), ('Grupo A',2,'19:23-19:45','4',102,104),
        ('Grupo A',3,'19:45-20:06','2',101,104), ('Grupo A',3,'19:45-20:06','4',102,103),
        ('Grupo B',1,'19:00-19:22','6',105,106), ('Grupo B',1,'19:00-19:22','8',107,108),
        ('Grupo B',2,'19:23-19:45','6',105,107), ('Grupo B',2,'19:23-19:45','8',106,108),
        ('Grupo B',3,'19:45-20:06','6',105,108), ('Grupo B',3,'19:45-20:06','8',106,107),
        ('Grupo C',1,'19:00-19:22','10',109,110), ('Grupo C',1,'19:00-19:22','15',111,112),
        ('Grupo C',2,'19:23-19:45','10',109,111), ('Grupo C',2,'19:23-19:45','15',110,112),
        ('Grupo C',3,'19:45-20:06','10',109,112), ('Grupo C',3,'19:45-20:06','15',110,111)
)
INSERT INTO matches (event_id,pair_one_id,pair_two_id,round_name,court,created_at)
SELECT 7,p1.id,p2.id,'5taD - '||group_name||' - Ronda '||round_number||' - '||slot_time,court,now()
FROM fixture
JOIN pairs p1 ON p1.seed=seed_one
JOIN pairs p2 ON p2.seed=seed_two;

UPDATE events
SET categories='4TaC / 5taD',
    capacity=32,
    description=concat_ws(E'\n', nullif(description,''),
      'Fixture 5taD aplicado desde PadelNaty2series_13June_11canchas.xlsm: canchas 2, 4, 6, 8, 10 y 15; ranking de 19:00 a 20:06.')
WHERE id=7;

COMMIT;
