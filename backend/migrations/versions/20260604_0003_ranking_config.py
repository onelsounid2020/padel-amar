from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260604_0003"
down_revision = "20260604_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("ranking_config", sa.JSON(), nullable=True, server_default="{}"))


def downgrade() -> None:
    op.drop_column("events", "ranking_config")
