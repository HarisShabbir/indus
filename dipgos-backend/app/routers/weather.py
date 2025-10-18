from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..repos.weather_repo import WeatherRepo
from ..services.weather_service import build_weather_summary

router = APIRouter(prefix="/api", tags=["weather"])


def get_repo() -> WeatherRepo:
    return WeatherRepo()


class WeatherPoint(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    entityType: Literal["project", "contract"] = Field(alias="entity_type")
    temperatureC: Optional[float] = Field(default=None, alias="temperature_c")
    windSpeedKph: Optional[float] = Field(default=None, alias="wind_speed_kph")
    weatherCode: Optional[int] = Field(default=None, alias="weather_code")
    weatherDescription: Optional[str] = Field(default=None, alias="weather_description")
    icon: str
    observedAt: datetime = Field(alias="observed_at")
    source: Literal["open-meteo", "fallback"]


class WeatherSummary(BaseModel):
    generatedAt: datetime = Field(alias="generated_at")
    projects: List[WeatherPoint]
    contracts: List[WeatherPoint]


@router.get("/weather", response_model=WeatherSummary)
def weather_summary(repo: WeatherRepo = Depends(get_repo)) -> WeatherSummary:
    locations = repo.fetch_all()
    summary = build_weather_summary(locations)
    return WeatherSummary.model_validate(summary)
