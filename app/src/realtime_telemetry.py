"""Runtime telemetry helpers and SSE event generation."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import platform
import time
from typing import Any, Iterator


START_TIME = time.monotonic()


def telemetry_snapshot(entity_count: int, pattern_count: int) -> dict[str, Any]:
    uptime_seconds = int(time.monotonic() - START_TIME)
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": uptime_seconds,
        "runtime": {
            "python": platform.python_version(),
            "platform": platform.platform(),
        },
        "data": {
            "verified_entities": entity_count,
            "patterns_loaded": pattern_count,
        },
        "service": {
            "name": "standalone-anomaly-surge-detector",
            "state": "online",
        },
    }


def sse_format(event_name: str, payload: dict[str, Any]) -> str:
    return f"event: {event_name}\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"


def telemetry_stream(snapshot_factory, interval_seconds: int = 5) -> Iterator[str]:
    while True:
        yield sse_format("telemetry", snapshot_factory())
        time.sleep(interval_seconds)
