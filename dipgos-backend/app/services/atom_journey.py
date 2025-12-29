from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from psycopg.rows import dict_row

from ..db import pool

VALID_STATUSES = ('warehouse', 'in_transit', 'on_site', 'engaged')


def record_journey_event(*, atom_id: str, status: str, ts: str | None) -> dict:
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")
    timestamp = datetime.fromisoformat(ts) if ts else datetime.now(timezone.utc)

    atom_uuid = uuid.UUID(atom_id)
    with pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT 1 FROM dipgos.atoms WHERE id = %s", (atom_uuid,))
            if not cur.fetchone():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atom not found")
            cur.execute(
                """
                INSERT INTO dipgos.atom_journey(atom_id, status, ts)
                VALUES (%s,%s,%s)
                """,
                (atom_uuid, status, timestamp),
            )
        conn.commit()
    return {"atomId": atom_id, "status": status, "ts": timestamp.isoformat()}

