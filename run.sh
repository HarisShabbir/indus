#!/usr/bin/env bash
set -euo pipefail

export PYTHONUNBUFFERED=1

# Allow overriding port via $PORT
PORT="${PORT:-8000}"

# Prefer python3 but fall back to python if available
PYTHON_BIN="$(command -v python3 || command -v python || true)"
if [[ -z "$PYTHON_BIN" ]]; then
  echo "Error: python3/python not found on PATH" >&2
  exit 127
fi

# Run the FastAPI app with autoreload
"$PYTHON_BIN" -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --reload
