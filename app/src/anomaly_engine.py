"""Deterministic anomaly scoring engine."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from .data_ingestion import EntityRecord, PatternDefinition


@dataclass(frozen=True)
class PatternHit:
    pattern_id: str
    name: str
    metric: str
    value: float
    threshold: float
    comparator: str
    contribution: float
    description: str

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "pattern_id": self.pattern_id,
            "name": self.name,
            "metric": self.metric,
            "value": self.value,
            "threshold": self.threshold,
            "comparator": self.comparator,
            "contribution": round(self.contribution, 4),
            "description": self.description,
        }


@dataclass(frozen=True)
class AnomalyFinding:
    entity: EntityRecord
    score: float
    priority: str
    confidence: float
    observed_age_seconds: int
    hits: list[PatternHit]

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "entity": self.entity.to_public_dict(),
            "score": round(self.score, 2),
            "priority": self.priority,
            "confidence": round(self.confidence, 3),
            "observed_age_seconds": self.observed_age_seconds,
            "pattern_hits": [hit.to_public_dict() for hit in self.hits],
        }


def _metric_value(entity: EntityRecord, metric: str, now: datetime) -> float | None:
    if metric == "observed_age_seconds":
        return max(0.0, (now - entity.observed_at).total_seconds())
    return entity.metrics.get(metric)


def _pattern_ratio(value: float, pattern: PatternDefinition) -> float:
    if pattern.comparator == "gte":
        if value < pattern.threshold:
            return 0.0
        return min(value / pattern.threshold, 2.0) / 2.0

    if value > pattern.threshold:
        return 0.0
    if pattern.threshold <= 0:
        return 1.0
    return min(pattern.threshold / max(value, 1.0), 2.0) / 2.0


def _priority(score: float) -> str:
    if score >= 85:
        return "P1"
    if score >= 70:
        return "P2"
    if score >= 55:
        return "P3"
    return "WATCH"


def score_entity(
    entity: EntityRecord,
    patterns: list[PatternDefinition],
    now: datetime | None = None,
) -> AnomalyFinding:
    current_time = now or datetime.now(timezone.utc)
    total_weight = sum(pattern.weight for pattern in patterns)
    hits: list[PatternHit] = []
    weighted_score = 0.0
    available_patterns = 0

    for pattern in patterns:
        value = _metric_value(entity, pattern.metric, current_time)
        if value is None:
            continue

        available_patterns += 1
        ratio = _pattern_ratio(value, pattern)
        if ratio <= 0:
            continue

        contribution = ratio * pattern.weight
        weighted_score += contribution
        hits.append(
            PatternHit(
                pattern_id=pattern.pattern_id,
                name=pattern.name,
                metric=pattern.metric,
                value=value,
                threshold=pattern.threshold,
                comparator=pattern.comparator,
                contribution=contribution,
                description=pattern.description,
            )
        )

    confidence = available_patterns / max(len(patterns), 1)
    raw_score = 100.0 * (weighted_score / max(total_weight, 1.0))
    score = max(0.0, min(100.0, raw_score * confidence))
    age_seconds = max(0, int((current_time - entity.observed_at).total_seconds()))

    return AnomalyFinding(
        entity=entity,
        score=score,
        priority=_priority(score),
        confidence=confidence,
        observed_age_seconds=age_seconds,
        hits=sorted(hits, key=lambda hit: hit.contribution, reverse=True),
    )


def run_scan(
    entities: list[EntityRecord],
    patterns: list[PatternDefinition],
    now: datetime | None = None,
) -> list[AnomalyFinding]:
    findings = [score_entity(entity, patterns, now=now) for entity in entities]
    return sorted(findings, key=lambda finding: finding.score, reverse=True)
