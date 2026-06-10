from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260610_0007"
down_revision = "20260609_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("fixture_config", sa.JSON(), nullable=True, server_default="{}"))


def downgrade() -> None:
    op.drop_column("events", "fixture_config")
