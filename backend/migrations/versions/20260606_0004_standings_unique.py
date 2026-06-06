from __future__ import annotations

from alembic import op


revision = "20260606_0004"
down_revision = "20260604_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            """
            DELETE FROM standings stale
            USING standings keeper
            WHERE stale.event_id = keeper.event_id
              AND stale.pair_id = keeper.pair_id
              AND stale.id > keeper.id
            """
        )
        op.execute(
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'uq_standings_event_pair'
                ) THEN
                    ALTER TABLE standings
                    ADD CONSTRAINT uq_standings_event_pair UNIQUE (event_id, pair_id);
                END IF;
            END $$;
            """
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE standings DROP CONSTRAINT IF EXISTS uq_standings_event_pair")
