from collections.abc import Generator

import pytest


@pytest.fixture(scope="session", autouse=True)
def db() -> Generator[None, None, None]:
    """Feature unit tests use fake repositories, so they skip the Postgres session in the root conftest."""
    yield None
