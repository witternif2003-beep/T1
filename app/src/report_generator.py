"""Report composition for API and dashboard consumers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .anomaly_engine import AnomalyFinding
from .forensic_scorer import annotate_findings


def build_report(findings: list[AnomalyFinding], pattern_count: int) -> dict[str, Any]:
    ranked_findings = annotate_findings(findings)
    priorities = {"P1": 0, "P2": 0, "P3": 0, "WATCH": 0}
    for finding in findings:
        priorities[finding.priority] = priorities.get(finding.priority, 0) + 1

    verified_count = len(findings)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "verified_data_loaded" if verified_count else "no_verified_data_loaded",
        "summary": {
            "verified_entities": verified_count,
            "patterns_loaded": pattern_count,
            "priorities": priorities,
            "highest_score": round(findings[0].score, 2) if findings else 0,
        },
        "findings": ranked_findings,
        "notice": None
        if verified_count
        else "No verified entity records are loaded. Add records to app/data/entities.json or mount a data directory.",
    }
