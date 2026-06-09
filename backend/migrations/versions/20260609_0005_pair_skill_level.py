from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260609_0005"
down_revision = "20260606_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "event_pairs",
        sa.Column("skill_level", sa.Integer(), nullable=False, server_default="5"),
    )


def downgrade() -> None:
    op.drop_column("event_pairs", "skill_level")
