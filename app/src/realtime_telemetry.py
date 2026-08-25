"""Runtime telemetry helpers and SSE event generation."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import platform
import time
from typing import Any, Iterator


START_TIME = time.monotonic()


class RealtimeTelemetry:
    """Verified-data realtime telemetry without synthetic anomaly injection."""

    def __init__(self) -> None:
        self.event_counter = 0
        self.batch_counter = 0

    def get_statistics(self, report: dict[str, Any]) -> dict[str, Any]:
        self.batch_counter += 1
        findings = report.get("findings", [])
        active_findings = [finding for finding in findings if finding.get("score", 0) > 0]
        severity_total = sum(float(finding.get("score", 0)) for finding in active_findings)
        top_finding = active_findings[0] if active_findings else None
        severity_breakdown: dict[str, int] = {}
        for finding in findings:
            risk_band = finding.get("forensics", {}).get("risk_band", "unknown")
            severity_breakdown[risk_band] = severity_breakdown.get(risk_band, 0) + 1

        return {
            "total_entities": report.get("summary", {}).get("verified_entities", 0),
            "total_anomalies": len(active_findings),
            "anomalies_today": len(active_findings),
            "batches_processed": self.batch_counter,
            "active_alerts": len([finding for finding in active_findings if finding.get("priority") in {"P1", "P2"}]),
            "avg_severity": round(severity_total / len(active_findings), 2) if active_findings else 0,
            "top_entity": top_finding.get("entity", {}).get("name") if top_finding else None,
            "severity_breakdown": severity_breakdown,
            "priorities": report.get("summary", {}).get("priorities", {}),
            "highest_score": report.get("summary", {}).get("highest_score", 0),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def generate_anomaly(self, report: dict[str, Any]) -> dict[str, Any] | None:
        findings = [finding for finding in report.get("findings", []) if finding.get("score", 0) > 0]
        if not findings:
            return None

        self.event_counter += 1
        finding = findings[0]
        entity = finding.get("entity", {})
        forensics = finding.get("forensics", {})
        sar_screen = forensics.get("sar_screen", {})
        dominant_category = sar_screen.get("dominant_category") or finding.get("priority", "WATCH")

        return {
            "id": finding.get("id") or f"AIP-S0-{self.event_counter:06d}",
            "sequence": self.event_counter,
            "type": dominant_category,
            "severity": finding.get("score", 0),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "entity_id": entity.get("id"),
            "entity_name": entity.get("name"),
            "coordinates": _coordinates_from_finding(finding),
            "summary": f"{finding.get('priority', 'WATCH')} verified anomaly for {entity.get('name', 'unknown entity')}",
            "forensic_flags": _forensic_flags_from_finding(finding),
            "chain_of_custody_hash": finding.get("chain_of_custody_hash"),
        }


def _coordinates_from_finding(finding: dict[str, Any]) -> list[dict[str, str]]:
    coordinates: list[dict[str, str]] = []
    for vector in finding.get("forensic_vectors", []):
        for coordinate in vector.get("coordinates", []):
            if coordinate not in coordinates:
                coordinates.append(coordinate)
    return coordinates[:3]


def _forensic_flags_from_finding(finding: dict[str, Any]) -> list[str]:
    flags: list[str] = []
    for vector in finding.get("forensic_vectors", []):
        for flag in vector.get("forensic_flags", []):
            if flag not in flags:
                flags.append(flag)
    return flags


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
