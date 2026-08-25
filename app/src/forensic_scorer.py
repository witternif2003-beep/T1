"""Forensic context for anomaly findings."""

from __future__ import annotations

from typing import Any

from .anomaly_engine import AnomalyFinding


def integrity_label(finding: AnomalyFinding) -> str:
    if finding.confidence >= 0.8 and finding.observed_age_seconds <= 900:
        return "high"
    if finding.confidence >= 0.5 and finding.observed_age_seconds <= 3600:
        return "medium"
    return "low"


def risk_band(score: float) -> str:
    if score >= 85:
        return "critical"
    if score >= 70:
        return "elevated"
    if score >= 55:
        return "watch"
    return "baseline"


def annotate_finding(finding: AnomalyFinding) -> dict[str, Any]:
    public = finding.to_public_dict()
    public["forensics"] = {
        "risk_band": risk_band(finding.score),
        "integrity": integrity_label(finding),
        "hit_count": len(finding.hits),
        "forensic_vector_count": len(finding.forensic_vectors),
        "chain_of_custody_hash": finding.chain_of_custody_hash,
        "top_factor": finding.hits[0].name if finding.hits else None,
        "data_lineage": {
            "source_name": finding.entity.source_name,
            "source_url": finding.entity.source_url,
            "observed_at": finding.entity.observed_at.isoformat(),
        },
    }
    return public


def annotate_findings(findings: list[AnomalyFinding]) -> list[dict[str, Any]]:
    return [annotate_finding(finding) for finding in findings]
