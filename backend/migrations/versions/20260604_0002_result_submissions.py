from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260604_0002"
down_revision = "20260603_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "match_result_submissions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("match_id", sa.Integer(), nullable=False),
        sa.Column("submitted_by_user_id", sa.Integer(), nullable=False),
        sa.Column("pair_one_score", sa.Integer(), nullable=False),
        sa.Column("pair_two_score", sa.Integer(), nullable=False),
        sa.Column("status", sa.Enum("pendiente", "confirmado", "conflicto", "descartado", name="resultsubmissionstatus"), nullable=False),
        sa.Column("note", sa.String(length=240), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["match_id"], ["matches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["submitted_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("match_id", "submitted_by_user_id", name="uq_result_submission_match_user"),
    )
    op.create_index(op.f("ix_match_result_submissions_id"), "match_result_submissions", ["id"], unique=False)
    op.create_index(op.f("ix_match_result_submissions_event_id"), "match_result_submissions", ["event_id"], unique=False)
    op.create_index(op.f("ix_match_result_submissions_match_id"), "match_result_submissions", ["match_id"], unique=False)
    op.create_index(op.f("ix_match_result_submissions_submitted_by_user_id"), "match_result_submissions", ["submitted_by_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_match_result_submissions_submitted_by_user_id"), table_name="match_result_submissions")
    op.drop_index(op.f("ix_match_result_submissions_match_id"), table_name="match_result_submissions")
    op.drop_index(op.f("ix_match_result_submissions_event_id"), table_name="match_result_submissions")
    op.drop_index(op.f("ix_match_result_submissions_id"), table_name="match_result_submissions")
    op.drop_table("match_result_submissions")
    op.execute("DROP TYPE IF EXISTS resultsubmissionstatus")
