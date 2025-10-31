from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable, List, Literal

from psycopg.rows import dict_row

from ..data import fallback_contracts, fallback_projects
from ..db import pool


logger = logging.getLogger(__name__)


@dataclass
class WeatherLocation:
    id: str
    name: str
    lat: float
    lng: float
    entity_type: Literal["project", "contract"]


class WeatherRepo:
    @staticmethod
    def _project_locations_from_rows(rows: Iterable[dict]) -> List[WeatherLocation]:
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

    @staticmethod
    def _contract_locations_from_rows(rows: Iterable[dict]) -> List[WeatherLocation]:
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

    @staticmethod
    def _fallback_projects() -> List[WeatherLocation]:
        records = fallback_projects()
        return [
            WeatherLocation(
                id=record["id"],
                name=record["name"],
                lat=float(record["lat"]),
                lng=float(record["lng"]),
                entity_type="project",
            )
            for record in records
            if record.get("lat") is not None and record.get("lng") is not None
        ]

    @staticmethod
    def _fallback_contracts() -> List[WeatherLocation]:
        locations: List[WeatherLocation] = []
        for project in fallback_projects():
            for contract in fallback_contracts(project["id"]):
                lat = contract.get("lat")
                lng = contract.get("lng")
                if lat is None or lng is None:
                    continue
                locations.append(
                    WeatherLocation(
                        id=contract["id"],
                        name=contract["name"],
                        lat=float(lat),
                        lng=float(lng),
                        entity_type="contract",
                    )
                )
        return locations

    def fetch_projects(self) -> List[WeatherLocation]:
        try:
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
            return self._project_locations_from_rows(rows)
        except Exception as exc:  # pragma: no cover - defensive fallback
            logger.warning("Falling back to fixture projects for weather data: %s", exc)
            return self._fallback_projects()

    def fetch_contracts(self) -> List[WeatherLocation]:
        try:
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
            return self._contract_locations_from_rows(rows)
        except Exception as exc:  # pragma: no cover - defensive fallback
            logger.warning("Falling back to fixture contracts for weather data: %s", exc)
            return self._fallback_contracts()

    def fetch_all(self) -> List[WeatherLocation]:
        projects = self.fetch_projects()
        contracts = self.fetch_contracts()
        return [*projects, *contracts]
