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
    ('Grupo A', 1, 'Nathy',  'Tuto',    'amar-20260613-4tac-a1-1@local.invalid', 'amar-20260613-4tac-a1-2@local.invalid'),
    ('Grupo A', 2, 'Marco',  'Rusol',   'amar-20260613-4tac-a2-1@local.invalid', 'amar-20260613-4tac-a2-2@local.invalid'),
    ('Grupo A', 3, 'Caro',   'Pablo',   'amar-20260613-4tac-a3-1@local.invalid', 'amar-20260613-4tac-a3-2@local.invalid'),
    ('Grupo A', 4, 'Lya',    'Tano',    'amar-20260613-4tac-a4-1@local.invalid', 'amar-20260613-4tac-a4-2@local.invalid'),
    ('Grupo B', 5, 'Paulit', 'Cris',    'amar-20260613-4tac-b1-1@local.invalid', 'amar-20260613-4tac-b1-2@local.invalid'),
    ('Grupo B', 6, 'Vero',   'Orlando', 'amar-20260613-4tac-b2-1@local.invalid', 'amar-20260613-4tac-b2-2@local.invalid'),
    ('Grupo B', 7, 'Tita',   'Gonzalo', 'amar-20260613-4tac-b3-1@local.invalid', 'amar-20260613-4tac-b3-2@local.invalid'),
    ('Grupo B', 8, 'Vero',   'Juvenal', 'amar-20260613-4tac-b4-1@local.invalid', 'amar-20260613-4tac-b4-2@local.invalid'),
    ('Grupo C', 9, 'Onel',   'Vero K',  'amar-20260613-4tac-c1-1@local.invalid', 'amar-20260613-4tac-c1-2@local.invalid'),
    ('Grupo C', 10, 'Juan',  'Marisol', 'amar-20260613-4tac-c2-1@local.invalid', 'amar-20260613-4tac-c2-2@local.invalid'),
    ('Grupo C', 11, 'Coni',  'Edu',     'amar-20260613-4tac-c3-1@local.invalid', 'amar-20260613-4tac-c3-2@local.invalid'),
    ('Grupo C', 12, 'Ivan',  'Lore',    'amar-20260613-4tac-c4-1@local.invalid', 'amar-20260613-4tac-c4-2@local.invalid');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM events
        WHERE id = 7
          AND date = DATE '2026-06-13'
          AND schedule LIKE '15:30%'
    ) THEN
        RAISE EXCEPTION 'No se encontro el evento esperado de la tarde (id 7)';
    END IF;
END $$;

INSERT INTO players (name, email, phone, category, preferred_side, created_at)
SELECT source.name, source.email, NULL, '4TaC', 'indiferente', now()
FROM (
    SELECT player_one_name AS name, player_one_email AS email FROM import_pairs
    UNION ALL
    SELECT player_two_name, player_two_email FROM import_pairs
) AS source
WHERE NOT EXISTS (SELECT 1 FROM players WHERE players.email = source.email);

INSERT INTO event_pairs (event_id, player_one_id, player_two_id, category, skill_level, status, seed, created_at)
SELECT
    7,
    player_one.id,
    player_two.id,
    '4TaC',
    5,
    'completa',
    source.seed,
    now()
FROM import_pairs AS source
JOIN players AS player_one ON player_one.email = source.player_one_email
JOIN players AS player_two ON player_two.email = source.player_two_email
WHERE NOT EXISTS (
    SELECT 1
    FROM event_pairs existing
    WHERE existing.event_id = 7
      AND existing.player_one_id = player_one.id
      AND existing.player_two_id = player_two.id
);

INSERT INTO event_registrations (
    event_id, pair_id, player_id, user_id, identity_key, role, category,
    status, payment_status, checked_in, source, created_at, updated_at
)
SELECT 7, pair.id, player_one.id, player_one.user_id, 'email:' || lower(player_one.email),
       'jugador', '4TaC', 'confirmada', 'pendiente', false, 'admin', now(), now()
FROM import_pairs source
JOIN players player_one ON player_one.email = source.player_one_email
JOIN players player_two ON player_two.email = source.player_two_email
JOIN event_pairs pair ON pair.event_id = 7 AND pair.player_one_id = player_one.id AND pair.player_two_id = player_two.id
ON CONFLICT DO NOTHING;

INSERT INTO event_registrations (
    event_id, pair_id, player_id, user_id, identity_key, role, category,
    status, payment_status, checked_in, source, created_at, updated_at
)
SELECT 7, pair.id, player_two.id, player_two.user_id, 'email:' || lower(player_two.email),
       'partner', '4TaC', 'confirmada', 'pendiente', false, 'admin', now(), now()
FROM import_pairs source
JOIN players player_one ON player_one.email = source.player_one_email
JOIN players player_two ON player_two.email = source.player_two_email
JOIN event_pairs pair ON pair.event_id = 7 AND pair.player_one_id = player_one.id AND pair.player_two_id = player_two.id
ON CONFLICT DO NOTHING;

INSERT INTO payments (event_id, pair_id, amount, status, updated_at)
SELECT 7, pair.id, event.price, 'pendiente', now()
FROM import_pairs source
JOIN players player_one ON player_one.email = source.player_one_email
JOIN players player_two ON player_two.email = source.player_two_email
JOIN event_pairs pair ON pair.event_id = 7 AND pair.player_one_id = player_one.id AND pair.player_two_id = player_two.id
JOIN events event ON event.id = 7
WHERE NOT EXISTS (SELECT 1 FROM payments WHERE payments.event_id = 7 AND payments.pair_id = pair.id);

INSERT INTO player_payments (event_id, pair_id, player_id, amount, status, updated_at)
SELECT 7, pair.id, player.id, event.price, 'pendiente', now()
FROM import_pairs source
JOIN players player_one ON player_one.email = source.player_one_email
JOIN players player_two ON player_two.email = source.player_two_email
JOIN event_pairs pair ON pair.event_id = 7 AND pair.player_one_id = player_one.id AND pair.player_two_id = player_two.id
JOIN LATERAL (VALUES (player_one.id), (player_two.id)) AS player(id) ON true
JOIN events event ON event.id = 7
ON CONFLICT DO NOTHING;

WITH assignments AS (
    SELECT jsonb_object_agg(pair.id::text, to_jsonb(source.group_name)) AS value
    FROM import_pairs source
    JOIN players player_one ON player_one.email = source.player_one_email
    JOIN players player_two ON player_two.email = source.player_two_email
    JOIN event_pairs pair ON pair.event_id = 7 AND pair.player_one_id = player_one.id AND pair.player_two_id = player_two.id
)
UPDATE events
SET categories = CASE WHEN trim(coalesce(categories, '')) = '' THEN '4TaC' ELSE categories END,
    fixture_config = (
        coalesce(fixture_config::jsonb, '{}'::jsonb)
        || jsonb_build_object(
            'planner_category', '4TaC',
            'planner_group_count', 3,
            'planner_group_assignments',
                coalesce(fixture_config::jsonb -> 'planner_group_assignments', '{}'::jsonb)
                || jsonb_build_object('4TaC', assignments.value)
        )
    )::json
FROM assignments
WHERE events.id = 7;

COMMIT;
