from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260609_0006"
down_revision = "20260609_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("status", sa.String(length=19), nullable=False, server_default="registration_open"),
    )
    op.add_column(
        "event_registrations",
        sa.Column("checked_in", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("event_registrations", "checked_in")
    op.drop_column("events", "status")
