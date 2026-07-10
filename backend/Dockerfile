FROM python:3.10

ENV PYTHONUNBUFFERED=1

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.9.26 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

WORKDIR /app/

ENV PATH="/app/.venv/bin:$PATH"

# Copy all files needed for dependency resolution
COPY pyproject.toml uv.lock /app/
COPY backend/pyproject.toml /app/backend/

# Install dependencies (no workspace package yet, just deps)
RUN uv sync --frozen --no-install-workspace --package app

# Copy application code
COPY ./backend/scripts /app/backend/scripts
COPY ./backend/alembic.ini /app/backend/
COPY ./backend/app /app/backend/app

# Install the workspace package itself
RUN uv sync --frozen --package app

WORKDIR /app/backend/

# Run as non-root
RUN adduser --disabled-password --gecos "" --uid 1001 appuser \
    && chown -R appuser:appuser /app
USER 1001

CMD ["fastapi", "run", "--workers", "2", "app/main.py"]
