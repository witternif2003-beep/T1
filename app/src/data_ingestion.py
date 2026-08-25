"""Validated JSON ingestion for verified entity telemetry.

The app intentionally does not synthesize fallback entities. If no valid
records exist in the configured data file, API callers receive an empty result
with diagnostics explaining that verified data must be loaded first.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any


class DataValidationError(ValueError):
    """Raised when a JSON dataset cannot be trusted for scoring."""


@dataclass(frozen=True)
class EntityRecord:
    """A normalized entity record accepted by the scoring engine."""

    entity_id: str
    name: str
    category: str
    source_name: str
    source_url: str | None
    observed_at: datetime
    metrics: dict[str, float]
    tags: list[str] = field(default_factory=list)
    attributes: dict[str, str] = field(default_factory=dict)

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "id": self.entity_id,
            "name": self.name,
            "category": self.category,
            "source": {
                "name": self.source_name,
                "url": self.source_url,
            },
            "observed_at": self.observed_at.isoformat(),
            "metrics": self.metrics,
            "tags": self.tags,
            "attributes": self.attributes,
        }


@dataclass(frozen=True)
class PatternDefinition:
    """A validated anomaly pattern definition."""

    pattern_id: str
    name: str
    metric: str
    comparator: str
    threshold: float
    weight: float
    description: str

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "id": self.pattern_id,
            "name": self.name,
            "metric": self.metric,
            "comparator": self.comparator,
            "threshold": self.threshold,
            "weight": self.weight,
            "description": self.description,
        }


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_utc_datetime(value: Any, field_name: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise DataValidationError(f"{field_name} must be a non-empty ISO timestamp")

    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise DataValidationError(f"{field_name} must be a valid ISO timestamp") from exc

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def load_json_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise DataValidationError(f"required data file missing: {path}")
    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except json.JSONDecodeError as exc:
        raise DataValidationError(f"invalid JSON in {path}: {exc.msg}") from exc
    if not isinstance(payload, dict):
        raise DataValidationError(f"{path} must contain a JSON object")
    return payload


def _require_string(payload: dict[str, Any], field_name: str) -> str:
    value = payload.get(field_name)
    if not isinstance(value, str) or not value.strip():
        raise DataValidationError(f"{field_name} must be a non-empty string")
    return value.strip()


def _normalize_source(source: Any) -> tuple[str, str | None]:
    if isinstance(source, str) and source.strip():
        return source.strip(), None
    if not isinstance(source, dict):
        raise DataValidationError("source must be a string or object")
    name = _require_string(source, "name")
    url = source.get("url")
    if url is not None and (not isinstance(url, str) or not url.startswith(("https://", "http://"))):
        raise DataValidationError("source.url must be an absolute HTTP(S) URL")
    return name, url


def _normalize_metrics(metrics: Any) -> dict[str, float]:
    if not isinstance(metrics, dict) or not metrics:
        raise DataValidationError("metrics must be a non-empty object")

    normalized: dict[str, float] = {}
    for key, value in metrics.items():
        if not isinstance(key, str) or not key.strip():
            raise DataValidationError("metric names must be non-empty strings")
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise DataValidationError(f"metric {key} must be numeric")
        normalized[key.strip()] = float(value)
    return normalized


def _normalize_tags(tags: Any) -> list[str]:
    if tags is None:
        return []
    if not isinstance(tags, list):
        raise DataValidationError("tags must be an array when provided")
    normalized: list[str] = []
    for tag in tags:
        if not isinstance(tag, str) or not tag.strip():
            raise DataValidationError("tags must be non-empty strings")
        normalized.append(tag.strip())
    return normalized


def _normalize_attributes(attributes: Any) -> dict[str, str]:
    if attributes is None:
        return {}
    if not isinstance(attributes, dict):
        raise DataValidationError("attributes must be an object when provided")

    normalized: dict[str, str] = {}
    for key, value in attributes.items():
        if not isinstance(key, str) or not key.strip():
            raise DataValidationError("attribute names must be non-empty strings")
        if not isinstance(value, str) or not value.strip():
            raise DataValidationError(f"attribute {key} must be a non-empty string")
        normalized[key.strip()] = value.strip()
    return normalized


def normalize_entity(raw_entity: Any) -> EntityRecord:
    if not isinstance(raw_entity, dict):
        raise DataValidationError("entity records must be objects")

    source_name, source_url = _normalize_source(raw_entity.get("source"))
    return EntityRecord(
        entity_id=_require_string(raw_entity, "id"),
        name=_require_string(raw_entity, "name"),
        category=_require_string(raw_entity, "category"),
        source_name=source_name,
        source_url=source_url,
        observed_at=parse_utc_datetime(raw_entity.get("observed_at"), "observed_at"),
        metrics=_normalize_metrics(raw_entity.get("metrics")),
        tags=_normalize_tags(raw_entity.get("tags")),
        attributes=_normalize_attributes(raw_entity.get("attributes")),
    )


def normalize_pattern(raw_pattern: Any) -> PatternDefinition:
    if not isinstance(raw_pattern, dict):
        raise DataValidationError("pattern records must be objects")

    comparator = _require_string(raw_pattern, "comparator")
    if comparator not in {"gte", "lte"}:
        raise DataValidationError("pattern comparator must be 'gte' or 'lte'")

    threshold = raw_pattern.get("threshold")
    weight = raw_pattern.get("weight")
    if isinstance(threshold, bool) or not isinstance(threshold, (int, float)):
        raise DataValidationError("pattern threshold must be numeric")
    if isinstance(weight, bool) or not isinstance(weight, (int, float)) or weight <= 0:
        raise DataValidationError("pattern weight must be a positive number")

    return PatternDefinition(
        pattern_id=_require_string(raw_pattern, "id"),
        name=_require_string(raw_pattern, "name"),
        metric=_require_string(raw_pattern, "metric"),
        comparator=comparator,
        threshold=float(threshold),
        weight=float(weight),
        description=_require_string(raw_pattern, "description"),
    )


def load_entities(data_dir: Path) -> list[EntityRecord]:
    payload = load_json_file(data_dir / "entities.json")
    entities = payload.get("entities", [])
    if not isinstance(entities, list):
        raise DataValidationError("entities must be an array")
    return [normalize_entity(entity) for entity in entities]


def load_patterns(data_dir: Path) -> list[PatternDefinition]:
    payload = load_json_file(data_dir / "anomaly_patterns.json")
    patterns = payload.get("patterns", [])
    if not isinstance(patterns, list) or not patterns:
        raise DataValidationError("patterns must be a non-empty array")
    return [normalize_pattern(pattern) for pattern in patterns]
