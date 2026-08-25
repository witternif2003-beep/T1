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


class ReportGenerator:
    """Generate deterministic JSON and Markdown reports from verified findings."""

    def generate_report(self, finding: dict[str, Any], generated_at: str | None = None) -> dict[str, Any]:
        report_time = generated_at or datetime.now(timezone.utc).isoformat()
        entity = finding.get("entity", {})
        forensics = finding.get("forensics", {})
        sar_screen = forensics.get("sar_screen", {})

        return {
            "id": finding.get("id"),
            "summary": f"{finding.get('priority', 'WATCH')} anomaly report for {entity.get('name', 'unknown entity')}",
            "entity": entity,
            "score": finding.get("score"),
            "priority": finding.get("priority"),
            "forensics": forensics,
            "pattern_hits": finding.get("pattern_hits", []),
            "header": {
                "classification": "UNCLASSIFIED / VERIFIED-DATA SCREENING",
                "title": f"ANOMALY {finding.get('id', 'UNKNOWN')} [{finding.get('priority', 'WATCH')}]",
                "term": entity.get("name"),
                "definition": "Deterministic anomaly report generated from verified source telemetry.",
                "timestamp": report_time,
            },
            "anomaly": {
                "id": finding.get("id"),
                "type": sar_screen.get("dominant_category") or finding.get("priority"),
                "date": report_time,
                "verified": True,
                "score": finding.get("score"),
                "priority": finding.get("priority"),
            },
            "details": {
                "entity": entity,
                "metrics": entity.get("metrics", {}),
                "attributes": entity.get("attributes", {}),
                "coordinates": self._coordinates_from_finding(finding),
            },
            "forensic_data": {
                "metric_pattern_hits": finding.get("pattern_hits", []),
                "forensic_vectors": finding.get("forensic_vectors", []),
                "forensic_flags": self._forensic_flags_from_finding(finding),
                "legal_reference_hints": forensics.get("legal_reference_hints", []),
                "sar_screen": sar_screen,
                "disclaimer": "Screening references are informational and are not a legal determination.",
            },
            "chain_of_custody": forensics.get(
                "chain_of_custody",
                {
                    "hash": finding.get("chain_of_custody_hash"),
                    "verified": True,
                    "methodology": "47-vector deterministic forensic scan",
                    "status": "active" if finding.get("score", 0) > 0 else "baseline",
                },
            ),
        }

    def generate_markdown(self, report: dict[str, Any]) -> str:
        header = report["header"]
        anomaly = report["anomaly"]
        details = report["details"]
        forensic_data = report["forensic_data"]
        custody = report["chain_of_custody"]

        vector_lines = [
            f"- {vector['vector_id']} {vector['name']} ({vector['category']}) confidence={vector['confidence']}"
            for vector in forensic_data.get("forensic_vectors", [])
        ] or ["- None"]
        reference_lines = [f"- {reference}" for reference in forensic_data.get("legal_reference_hints", [])] or ["- None"]

        return "\n".join(
            [
                f"# {header['title']}",
                "",
                f"**Classification:** {header['classification']}",
                f"**Generated:** {header['timestamp']}",
                f"**Entity:** {details.get('entity', {}).get('name')}",
                f"**Priority:** {anomaly.get('priority')}",
                f"**Score:** {anomaly.get('score')}",
                "",
                "## Summary",
                header["definition"],
                "",
                "## Forensic Vectors",
                *vector_lines,
                "",
                "## Legal Reference Hints",
                *reference_lines,
                "",
                "## Chain of Custody",
                f"- Hash: `{custody.get('hash')}`",
                f"- Verified: {custody.get('verified')}",
                f"- Methodology: {custody.get('methodology')}",
                f"- Status: {custody.get('status')}",
                "",
                f"> {forensic_data.get('disclaimer')}",
                "",
            ]
        )

    def _coordinates_from_finding(self, finding: dict[str, Any]) -> list[dict[str, str]]:
        coordinates: list[dict[str, str]] = []
        for vector in finding.get("forensic_vectors", []):
            for coordinate in vector.get("coordinates", []):
                if coordinate not in coordinates:
                    coordinates.append(coordinate)
        return coordinates

    def _forensic_flags_from_finding(self, finding: dict[str, Any]) -> list[str]:
        flags: list[str] = []
        for vector in finding.get("forensic_vectors", []):
            for flag in vector.get("forensic_flags", []):
                if flag not in flags:
                    flags.append(flag)
        return flags
