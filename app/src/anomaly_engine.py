"""Deterministic anomaly scoring engine."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import re
from typing import Any

from .data_ingestion import EntityRecord, PatternDefinition


FORENSIC_FLAG_PATTERNS: dict[str, tuple[str, ...]] = {
    "unauthorized_access": ("unauthorized", "breach", "intrusion", "privilege escalation"),
    "financial_anomaly": ("wire", "transfer", "offshore", "account", "invoice"),
    "cyber_intrusion": ("malware", "ransomware", "credential", "injection", "exfiltration"),
    "espionage_activity": ("intelligence", "reconnaissance", "surveillance", "exfil"),
    "telecom_intercept": ("intercept", "wiretap", "subcarrier", "imei", "bssid"),
    "physical_breach": ("trespass", "forced entry", "tailgate", "perimeter"),
    "insider_threat": ("insider", "compromised", "admin override", "credential reuse"),
    "foreign_entity_involvement": ("foreign", "offshore", "international", "shell company"),
}


FORENSIC_VECTOR_PATTERNS: tuple[tuple[str, str, str, str], ...] = (
    ("FV-001", "High-value wire transfer", "financial", r"\$[\d,]+(?:\.\d+)?[KMB]?\s+(?:wire|transfer|payment)"),
    ("FV-002", "Offshore transfer language", "financial", r"(?:offshore|cayman|bvi|panama)\s+(?:account|transfer|holding|entity)"),
    ("FV-003", "Structured payment reference", "financial", r"(?:memo|reference|note)\s*[:#-]?\s*(?:port|security|consulting|facilitation)"),
    ("FV-004", "Shell entity indicator", "financial", r"(?:shell|holding|nominee)\s+(?:company|llc|entity|trust)"),
    ("FV-005", "Campaign finance proximity", "financial", r"(?:pac|campaign|committee)\s+.{0,40}\$[\d,]+(?:\.\d+)?[KMB]?"),
    ("FV-006", "Rapid invoice escalation", "financial", r"(?:invoice|payable)\s+.{0,40}(?:urgent|expedite|same day|immediate)"),
    ("FV-007", "Round-dollar anomaly", "financial", r"\$[1-9]\d{2,}(?:,000){1,}(?:\.00)?"),
    ("FV-008", "Sanctions geography indicator", "financial", r"(?:sanctioned|embargo|restricted)\s+(?:jurisdiction|counterparty|region)"),
    ("FV-009", "Beneficial owner opacity", "financial", r"(?:beneficial owner|ubo|nominee)\s+.{0,40}(?:unknown|hidden|redacted)"),
    ("FV-010", "SWIFT reference", "financial", r"(?:swift|mt\d{3})\s+[A-Z0-9]{8,11}"),
    ("FV-011", "Credential exposure", "cyber", r"(?:password|credential|secret|token|api key)\s+.{0,30}(?:exposed|leaked|shared|dumped)"),
    ("FV-012", "Administrative override", "cyber", r"(?:admin|root|superuser)\s+.{0,30}(?:override|bypass|disable|unlock)"),
    ("FV-013", "Remote access abuse", "cyber", r"(?:ssh|rdp|vpn|telnet|smb)\s+.{0,40}(?:credential|bruteforce|unauthorized|spray)"),
    ("FV-014", "Database injection", "cyber", r"(?:sql|nosql|mongodb|postgresql|oracle)\s+.{0,40}(?:injection|dump|exfiltrate|exfiltration)"),
    ("FV-015", "Industrial control abuse", "cyber", r"(?:scada|plc|hmi|terminal)\s+.{0,40}(?:override|lock|hijack|compromise)"),
    ("FV-016", "Malware event", "cyber", r"(?:malware|ransomware|loader|beacon)\s+.{0,40}(?:detected|executed|callback|persistence)"),
    ("FV-017", "Data exfiltration", "cyber", r"(?:exfiltrate|exfiltration|data dump|archive)\s+.{0,40}(?:external|foreign|unknown|dropbox|paste)"),
    ("FV-018", "Privilege escalation", "cyber", r"(?:privilege escalation|kernel exploit|sudoers|domain admin)"),
    ("FV-019", "MFA fatigue", "cyber", r"(?:mfa|2fa|push)\s+.{0,40}(?:fatigue|bombing|repeated|unexpected)"),
    ("FV-020", "Impossible travel", "cyber", r"(?:impossible travel|geo velocity|new country login)"),
    ("FV-021", "Encrypted messenger transfer", "espionage", r"(?:wechat|qq|telegram|signal|whatsapp)\s+.{0,40}(?:encrypt|decrypt|send|receive|payload)"),
    ("FV-022", "Research facility leakage", "espionage", r"(?:laboratory|research|facility|wind tunnel)\s+.{0,40}(?:fragment|sample|data|exfil)"),
    ("FV-023", "UAV surveillance", "espionage", r"(?:drone|uav|relay|repeater)\s+.{0,40}(?:loitering|surveillance|intercept|recon)"),
    ("FV-024", "Classified marking proximity", "espionage", r"(?:classified|restricted|controlled)\s+.{0,40}(?:copied|photographed|transmitted|removed)"),
    ("FV-025", "Foreign tasking language", "espionage", r"(?:handler|tasking|dead drop|asset)\s+.{0,40}(?:foreign|external|encrypted)"),
    ("FV-026", "Telecom identifier", "telecom", r"(?:imei|imsi|mac|ssid|bssid)\s*[:#-]?\s*[0-9A-Fa-f]{2}(?::|-)?[0-9A-Fa-f]{2}(?::|-)?[0-9A-Fa-f]{2}"),
    ("FV-027", "Hidden carrier signal", "telecom", r"(?:uhf|vhf|fm|am|subcarrier|carrier)\s+.{0,40}(?:hidden|embedded|encrypted|burst)"),
    ("FV-028", "Cell-site anomaly", "telecom", r"(?:cell site|tower|base station)\s+.{0,40}(?:spoof|rogue|stingray|downgrade)"),
    ("FV-029", "SIM swap indicator", "telecom", r"(?:sim swap|port out|number transfer)\s+.{0,40}(?:unauthorized|fraud|unexpected)"),
    ("FV-030", "Packet capture indicator", "telecom", r"(?:packet capture|pcap|sniffer)\s+.{0,40}(?:credential|session|intercept)"),
    ("FV-031", "Compliance hold bypass", "compliance", r"(?:legal hold|retention|audit)\s+.{0,40}(?:bypass|delete|purge|disable)"),
    ("FV-032", "Policy exception abuse", "compliance", r"(?:policy exception|waiver)\s+.{0,40}(?:urgent|retroactive|undocumented)"),
    ("FV-033", "Segregation-of-duties break", "compliance", r"(?:sod|segregation of duties)\s+.{0,40}(?:override|conflict|violation)"),
    ("FV-034", "Access review failure", "compliance", r"(?:access review|recertification)\s+.{0,40}(?:failed|overdue|ignored)"),
    ("FV-035", "Audit log tamper", "compliance", r"(?:audit log|event log|trail)\s+.{0,40}(?:tamper|deleted|disabled|missing)"),
    ("FV-036", "Vendor concentration risk", "supply_chain", r"(?:single source|sole supplier|vendor concentration)\s+.{0,40}(?:critical|outage|dependency)"),
    ("FV-037", "Compromised vendor access", "supply_chain", r"(?:vendor|supplier|contractor)\s+.{0,40}(?:credential|compromised|unauthorized|breach)"),
    ("FV-038", "Unsigned artifact", "supply_chain", r"(?:unsigned|unverified)\s+.{0,40}(?:artifact|binary|package|image)"),
    ("FV-039", "Dependency confusion", "supply_chain", r"(?:dependency confusion|typosquat|package hijack|namespace takeover)"),
    ("FV-040", "Build pipeline tamper", "supply_chain", r"(?:ci|cd|pipeline|build)\s+.{0,40}(?:tamper|secret|unauthorized|poison)"),
    ("FV-041", "Perimeter breach", "physical", r"(?:perimeter|fence|gate|badge)\s+.{0,40}(?:breach|forced|tailgate|trespass)"),
    ("FV-042", "Camera obstruction", "physical", r"(?:camera|cctv|sensor)\s+.{0,40}(?:covered|disabled|obstructed|offline)"),
    ("FV-043", "Badge anomaly", "physical", r"(?:badge|access card)\s+.{0,40}(?:cloned|shared|after hours|denied)"),
    ("FV-044", "Secure room access", "physical", r"(?:secure room|data center|vault)\s+.{0,40}(?:unauthorized|forced|propped)"),
    ("FV-045", "Coordinate-bearing report", "geospatial", r"\b\d{1,2}\.\d{4,6}\s*(?:N|S)?\s*,\s*\d{1,3}\.\d{4,6}\s*(?:E|W)?\b"),
    ("FV-046", "High-risk time window", "operational", r"(?:after hours|weekend|holiday)\s+.{0,40}(?:transfer|access|change|deployment)"),
    ("FV-047", "Emergency-change abuse", "operational", r"(?:emergency change|break glass|hotfix)\s+.{0,40}(?:unapproved|undocumented|failed)"),
)

assert len(FORENSIC_VECTOR_PATTERNS) == 47


@dataclass(frozen=True)
class ForensicVectorHit:
    vector_id: str
    name: str
    category: str
    source: str
    matches: list[str]
    confidence: float
    forensic_flags: list[str]
    coordinates: list[dict[str, str]]

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "vector_id": self.vector_id,
            "name": self.name,
            "category": self.category,
            "source": self.source,
            "matches": self.matches[:3],
            "confidence": round(self.confidence, 3),
            "forensic_flags": self.forensic_flags,
            "coordinates": self.coordinates[:3],
        }


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
    forensic_vectors: list[ForensicVectorHit]
    chain_of_custody_hash: str

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "entity": self.entity.to_public_dict(),
            "score": round(self.score, 2),
            "priority": self.priority,
            "confidence": round(self.confidence, 3),
            "observed_age_seconds": self.observed_age_seconds,
            "pattern_hits": [hit.to_public_dict() for hit in self.hits],
            "forensic_vectors": [hit.to_public_dict() for hit in self.forensic_vectors],
            "chain_of_custody_hash": self.chain_of_custody_hash,
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


def _entity_text_fields(entity: EntityRecord) -> dict[str, str]:
    fields = {
        "id": entity.entity_id,
        "name": entity.name,
        "category": entity.category,
        "source_name": entity.source_name,
        "tags": " ".join(entity.tags),
    }
    if entity.source_url:
        fields["source_url"] = entity.source_url
    for key, value in entity.attributes.items():
        fields[f"attribute.{key}"] = value
    return {key: value for key, value in fields.items() if value}


def _extract_coordinates(text: str) -> list[dict[str, str]]:
    coordinate_pattern = re.compile(
        r"\b(?P<lat>\d{1,2}\.\d{4,6})\s*(?P<lat_dir>[NS])?\s*,\s*"
        r"(?P<lon>\d{1,3}\.\d{4,6})\s*(?P<lon_dir>[EW])?\b",
        re.IGNORECASE,
    )
    coordinates: list[dict[str, str]] = []
    for match in coordinate_pattern.finditer(text):
        lat = match.group("lat")
        lon = match.group("lon")
        if match.group("lat_dir"):
            lat = f"{lat}{match.group('lat_dir').upper()}"
        if match.group("lon_dir"):
            lon = f"{lon}{match.group('lon_dir').upper()}"
        coordinates.append({"lat": lat, "lon": lon})
    return coordinates


def _match_forensic_flags(text: str) -> list[str]:
    flags: list[str] = []
    for flag, patterns in FORENSIC_FLAG_PATTERNS.items():
        if any(re.search(re.escape(pattern), text, re.IGNORECASE) for pattern in patterns):
            flags.append(flag)
    return flags


def scan_forensic_vectors(entity: EntityRecord) -> list[ForensicVectorHit]:
    hits: list[ForensicVectorHit] = []
    text_fields = _entity_text_fields(entity)

    for source, text in text_fields.items():
        coordinates = _extract_coordinates(text)
        flags = _match_forensic_flags(text)
        for vector_id, name, category, pattern in FORENSIC_VECTOR_PATTERNS:
            matches = [match.group(0) for match in re.finditer(pattern, text, re.IGNORECASE)]
            if not matches:
                continue
            confidence = min(0.99, 0.72 + (0.03 * min(len(matches), 5)) + (0.02 * len(flags)))
            hits.append(
                ForensicVectorHit(
                    vector_id=vector_id,
                    name=name,
                    category=category,
                    source=source,
                    matches=matches,
                    confidence=confidence,
                    forensic_flags=flags,
                    coordinates=coordinates,
                )
            )

    return sorted(hits, key=lambda hit: (hit.confidence, hit.vector_id), reverse=True)


def _forensic_score_boost(forensic_vectors: list[ForensicVectorHit]) -> float:
    if not forensic_vectors:
        return 0.0
    flag_count = sum(len(hit.forensic_flags) for hit in forensic_vectors)
    coordinate_count = sum(1 for hit in forensic_vectors if hit.coordinates)
    confidence_total = sum(hit.confidence for hit in forensic_vectors)
    return min(25.0, (confidence_total * 4.0) + (flag_count * 1.5) + (coordinate_count * 2.0))


def _chain_of_custody_hash(entity: EntityRecord, forensic_vectors: list[ForensicVectorHit]) -> str:
    payload = {
        "entity": entity.to_public_dict(),
        "forensic_vectors": [hit.to_public_dict() for hit in forensic_vectors],
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


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
    forensic_vectors = scan_forensic_vectors(entity)
    forensic_confidence = min(1.0, 0.5 + (0.05 * len(forensic_vectors))) if forensic_vectors else 0.0
    confidence = max(confidence, forensic_confidence)
    score = max(0.0, min(100.0, (raw_score * confidence) + _forensic_score_boost(forensic_vectors)))
    age_seconds = max(0, int((current_time - entity.observed_at).total_seconds()))

    return AnomalyFinding(
        entity=entity,
        score=score,
        priority=_priority(score),
        confidence=confidence,
        observed_age_seconds=age_seconds,
        hits=sorted(hits, key=lambda hit: hit.contribution, reverse=True),
        forensic_vectors=forensic_vectors,
        chain_of_custody_hash=_chain_of_custody_hash(entity, forensic_vectors),
    )


def run_scan(
    entities: list[EntityRecord],
    patterns: list[PatternDefinition],
    now: datetime | None = None,
) -> list[AnomalyFinding]:
    findings = [score_entity(entity, patterns, now=now) for entity in entities]
    return sorted(findings, key=lambda finding: finding.score, reverse=True)
