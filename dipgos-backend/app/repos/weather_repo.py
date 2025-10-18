from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Literal

from psycopg.rows import dict_row

from ..db import pool


@dataclass
class WeatherLocation:
    id: str
    name: str
    lat: float
    lng: float
    entity_type: Literal["project", "contract"]


class WeatherRepo:
    def fetch_projects(self) -> List[WeatherLocation]:
        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute("SET search_path TO dipgos, public")
                cur.execute(
                    """
                    SELECT id, name, lat, lng
                    FROM dipgos.projects
                    WHERE lat IS NOT NULL AND lng IS NOT NULL
                    """,
                )
                rows = cur.fetchall()
        return [
            WeatherLocation(
                id=row["id"],
                name=row["name"],
                lat=float(row["lat"]),
                lng=float(row["lng"]),
                entity_type="project",
            )
            for row in rows
        ]

    def fetch_contracts(self) -> List[WeatherLocation]:
        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute("SET search_path TO dipgos, public")
                cur.execute(
                    """
                    SELECT id, name, lat, lng
                    FROM dipgos.contracts
                    WHERE lat IS NOT NULL AND lng IS NOT NULL
                    """,
                )
                rows = cur.fetchall()
        return [
            WeatherLocation(
                id=row["id"],
                name=row["name"],
                lat=float(row["lat"]),
                lng=float(row["lng"]),
                entity_type="contract",
            )
            for row in rows
        ]

    def fetch_all(self) -> List[WeatherLocation]:
        projects = self.fetch_projects()
        contracts = self.fetch_contracts()
        return [*projects, *contracts]
