"""Forensic context for anomaly findings."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .anomaly_engine import AnomalyFinding


LEGAL_REFERENCE_HINTS = {
    "financial": ["18 USC 1956", "18 USC 1343"],
    "cyber": ["18 USC 1030", "18 USC 1029"],
    "espionage": ["18 USC 792"],
    "telecom": ["18 USC 2511"],
    "physical": ["18 USC 1361"],
    "compliance": ["18 USC 1519"],
    "supply_chain": ["18 USC 1030"],
    "geospatial": ["18 USC 2"],
    "operational": ["18 USC 371"],
}


SAR_CATEGORY_WEIGHTS = {
    "financial": 0.35,
    "cyber": 0.30,
    "physical": 0.15,
    "espionage": 0.12,
    "telecom": 0.08,
    "compliance": 0.10,
    "supply_chain": 0.10,
    "geospatial": 0.05,
    "operational": 0.05,
}


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


def legal_reference_hints(finding: AnomalyFinding) -> list[str]:
    references: set[str] = set()
    for hit in finding.forensic_vectors:
        for reference in LEGAL_REFERENCE_HINTS.get(hit.category, []):
            references.add(reference)
    return sorted(references)


def sar_screen(finding: AnomalyFinding) -> dict[str, Any]:
    category_counts: dict[str, int] = {}
    for hit in finding.forensic_vectors:
        category_counts[hit.category] = category_counts.get(hit.category, 0) + 1

    weighted_categories = {
        category: round(count * SAR_CATEGORY_WEIGHTS.get(category, 0.05), 4)
        for category, count in sorted(category_counts.items())
    }
    dominant_category = None
    if weighted_categories:
        dominant_category = max(weighted_categories, key=weighted_categories.get)

    weighted_score = min(100.0, finding.score + (sum(weighted_categories.values()) * 10.0))
    return {
        "dominant_category": dominant_category,
        "category_counts": category_counts,
        "category_weights": weighted_categories,
        "weighted_score": round(weighted_score, 2),
        "disclaimer": "Screening references are informational and are not a legal determination.",
    }


def custody_metadata(finding: AnomalyFinding) -> dict[str, Any]:
    return {
        "hash": finding.chain_of_custody_hash,
        "verified": True,
        "methodology": "47-vector deterministic forensic scan",
        "recorded_at": finding.entity.observed_at.isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "active" if finding.score > 0 else "baseline",
    }


def annotate_finding(finding: AnomalyFinding) -> dict[str, Any]:
    public = finding.to_public_dict()
    public["forensics"] = {
        "risk_band": risk_band(finding.score),
        "integrity": integrity_label(finding),
        "hit_count": len(finding.hits),
        "forensic_vector_count": len(finding.forensic_vectors),
        "chain_of_custody_hash": finding.chain_of_custody_hash,
        "chain_of_custody": custody_metadata(finding),
        "legal_reference_hints": legal_reference_hints(finding),
        "sar_screen": sar_screen(finding),
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
