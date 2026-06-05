FROM python:3.10

ENV PYTHONUNBUFFERED=1

# Install uv
# Ref: https://docs.astral.sh/uv/guides/integration/docker/#installing-uv
COPY --from=ghcr.io/astral-sh/uv:0.9.26 /uv /uvx /bin/

# Compile bytecode
# Ref: https://docs.astral.sh/uv/guides/integration/docker/#compiling-bytecode
ENV UV_COMPILE_BYTECODE=1

# uv Cache
# Ref: https://docs.astral.sh/uv/guides/integration/docker/#caching
ENV UV_LINK_MODE=copy

WORKDIR /app/

# Place executables in the environment at the front of the path
# Ref: https://docs.astral.sh/uv/guides/integration/docker/#using-the-environment
ENV PATH="/app/.venv/bin:$PATH"

# Copy workspace and package metadata for dependency resolution
COPY pyproject.toml uv.lock /app/
COPY backend/pyproject.toml /app/backend/

# Install dependencies
# Ref: https://docs.astral.sh/uv/guides/integration/docker/#intermediate-layers
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-workspace --package app

COPY ./backend/scripts /app/backend/scripts

COPY ./backend/alembic.ini /app/backend/

COPY ./backend/app /app/backend/app

# Sync the project (installs the workspace package itself)
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --package app

WORKDIR /app/backend/

RUN adduser --disabled-password --gecos "" --uid 1001 appuser \
    && chown -R appuser:appuser /app
USER 1001

CMD ["fastapi", "run", "--workers", "4", "app/main.py"]
