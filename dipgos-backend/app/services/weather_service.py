from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Tuple
from urllib.error import URLError
from urllib.request import urlopen

from ..repos.weather_repo import WeatherLocation

WEATHER_CODE_MAP: Dict[int, Tuple[str, str]] = {
    0: ("Clear", "sunny"),
    1: ("Mainly clear", "sunny-interval"),
    2: ("Partly cloudy", "partly-cloudy"),
    3: ("Overcast", "cloudy"),
    45: ("Fog", "fog"),
    48: ("Depositing rime fog", "fog"),
    51: ("Light drizzle", "drizzle"),
    53: ("Moderate drizzle", "drizzle"),
    55: ("Dense drizzle", "drizzle"),
    56: ("Light freezing drizzle", "freezing-drizzle"),
    57: ("Dense freezing drizzle", "freezing-drizzle"),
    61: ("Light rain", "rain"),
    63: ("Moderate rain", "rain"),
    65: ("Heavy rain", "rain"),
    66: ("Light freezing rain", "freezing-rain"),
    67: ("Heavy freezing rain", "freezing-rain"),
    71: ("Light snow", "snow"),
    73: ("Moderate snow", "snow"),
    75: ("Heavy snow", "snow"),
    77: ("Snow grains", "snow"),
    80: ("Rain showers", "rain"),
    81: ("Heavy showers", "rain"),
    82: ("Violent rain", "rain"),
    85: ("Light snow showers", "snow"),
    86: ("Heavy snow showers", "snow"),
    95: ("Thunderstorm", "storm"),
    96: ("Thunder w/ hail", "storm"),
    99: ("Thunder w/ heavy hail", "storm"),
}


def _resolve_weather_info(code: int | None) -> Tuple[str, str]:
    if code is None:
        return "Unavailable", "na"
    return WEATHER_CODE_MAP.get(code, ("Conditions unavailable", "na"))


def fetch_weather_for_location(location: WeatherLocation) -> Dict[str, object]:
    url = (
        "https://api.open-meteo.com/v1/forecast?latitude="
        f"{location.lat}&longitude={location.lng}&current=temperature_2m,weather_code,wind_speed_10m"
    )
    try:
        with urlopen(url, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
        current = payload.get("current", {})
        temperature = current.get("temperature_2m")
        weather_code = current.get("weather_code")
        wind_speed = current.get("wind_speed_10m")
        observed_at_raw = current.get("time")
        observed_at = None
        if isinstance(observed_at_raw, str):
            try:
                observed_at = datetime.fromisoformat(observed_at_raw.replace("Z", "+00:00"))
            except ValueError:
                observed_at = datetime.now(timezone.utc)
        description, icon = _resolve_weather_info(weather_code)
        return {
            "id": location.id,
            "name": location.name,
            "lat": location.lat,
            "lng": location.lng,
            "entity_type": location.entity_type,
            "temperature_c": temperature,
            "wind_speed_kph": wind_speed,
            "weather_code": weather_code,
            "weather_description": description,
            "icon": icon,
            "observed_at": observed_at or datetime.now(timezone.utc),
            "source": "open-meteo",
        }
    except (URLError, TimeoutError, json.JSONDecodeError, ValueError):
        description, icon = _resolve_weather_info(None)
        return {
            "id": location.id,
            "name": location.name,
            "lat": location.lat,
            "lng": location.lng,
            "entity_type": location.entity_type,
            "temperature_c": None,
            "wind_speed_kph": None,
            "weather_code": None,
            "weather_description": description,
            "icon": icon,
            "observed_at": datetime.now(timezone.utc),
            "source": "fallback",
        }


def build_weather_summary(locations: Iterable[WeatherLocation]) -> Dict[str, object]:
    projects: List[Dict[str, object]] = []
    contracts: List[Dict[str, object]] = []

    for location in locations:
        report = fetch_weather_for_location(location)
        if location.entity_type == "project":
            projects.append(report)
        else:
            contracts.append(report)

    return {
        "generated_at": datetime.now(timezone.utc),
        "projects": projects,
        "contracts": contracts,
    }
