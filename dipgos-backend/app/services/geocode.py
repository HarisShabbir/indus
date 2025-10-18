from __future__ import annotations

import logging
from functools import lru_cache
from typing import Optional, Tuple

from geopy.exc import GeocoderServiceError
from geopy.geocoders import Nominatim

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _geolocator() -> Nominatim:
    # User agent required per Nominatim usage policy.
    return Nominatim(user_agent="dipgos-backend")


def geocode_address(address: str, *, country_codes: Optional[str] = "pk") -> Optional[Tuple[float, float]]:
    if not address:
        return None

    try:
        geo = _geolocator().geocode(address, country_codes=country_codes, timeout=10)
    except GeocoderServiceError:  # pragma: no cover - network issues
        logger.warning("Failed to geocode address '%s'", address, exc_info=True)
        return None

    if geo is None:
        logger.info("No geocoding match returned for '%s'", address)
        return None

    return float(geo.latitude), float(geo.longitude)


