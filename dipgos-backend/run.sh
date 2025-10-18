#!/usr/bin/env bash
export PYTHONUNBUFFERED=1
# Allow overriding port via $PORT
PORT="${PORT:-8000}"
# Run the FastAPI app with autoreload
./.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --reload
