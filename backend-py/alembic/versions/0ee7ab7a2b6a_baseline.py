"""baseline

Revision ID: 0ee7ab7a2b6a
Revises: 
Create Date: 2026-06-20 17:48:41.968725

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0ee7ab7a2b6a'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Baseline marker.

    The schema already exists (created by the Node/Sequelize migrations) and the
    SQLAlchemy models match it exactly — autogenerate found no differences. This
    revision is intentionally empty; the DB is `alembic stamp`-ed to it so future
    schema changes go through Alembic. We deliberately do NOT drop the
    'SequelizeMeta' table, which the Node stack still uses.
    """
    pass


def downgrade() -> None:
    pass
