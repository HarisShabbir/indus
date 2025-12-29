from __future__ import annotations

import pytest

from app.db import close_pool, initialize_database, open_pool


@pytest.fixture(scope="session", autouse=True)
def _bootstrap_database():
    open_pool()
    try:
        initialize_database()
    except Exception:
        close_pool()
        raise
    yield
    close_pool()
