"""Standalone anomaly surge detector web app."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
from tempfile import NamedTemporaryFile
from typing import Any

from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from src.anomaly_engine import run_scan
from src.data_ingestion import (
    DataValidationError,
    load_entities,
    load_patterns,
    normalize_entity,
)
from src.report_generator import build_report
from src.realtime_telemetry import RealtimeTelemetry, telemetry_snapshot, telemetry_stream


DATA_DIR = Path(os.environ.get("APP_DATA_DIR", BASE_DIR / "data")).resolve()
realtime_telemetry = RealtimeTelemetry()


def create_app() -> Flask:
    app = Flask(__name__, static_folder=str(BASE_DIR / "static"), static_url_path="/static")
    app.config["JSON_SORT_KEYS"] = False
    cors_origins = _configured_cors_origins()
    if cors_origins:
        CORS(app, resources={r"/api/*": {"origins": cors_origins}})

    @app.after_request
    def apply_security_headers(response: Response) -> Response:
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "img-src 'self' data:; connect-src 'self' ws: wss:; "
            "base-uri 'self'; frame-ancestors 'none'",
        )
        if request.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.errorhandler(DataValidationError)
    def handle_validation_error(exc: DataValidationError):
        return jsonify({"ok": False, "error": str(exc), "type": "data_validation_error"}), 400

    @app.errorhandler(404)
    def handle_not_found(_exc):
        return jsonify({"ok": False, "error": "not found"}), 404

    @app.errorhandler(500)
    def handle_server_error(_exc):
        return jsonify({"ok": False, "error": "internal server error"}), 500

    @app.get("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/healthz")
    @app.get("/api/health")
    def health():
        entities, patterns = _load_runtime_data()
        return jsonify(
            {
                "ok": True,
                "status": "online",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "data": {
                    "verified_entities": len(entities),
                    "patterns_loaded": len(patterns),
                    "data_dir": str(DATA_DIR),
                },
            }
        )

    @app.get("/api/entities")
    def get_entities():
        entities = load_entities(DATA_DIR)
        return jsonify(
            {
                "ok": True,
                "count": len(entities),
                "entities": [entity.to_public_dict() for entity in entities],
            }
        )

    @app.post("/api/entities")
    def replace_entities():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            raise DataValidationError("request body must be a JSON object")

        raw_entities = payload.get("entities")
        if not isinstance(raw_entities, list):
            raise DataValidationError("entities must be an array")

        entities = [normalize_entity(entity) for entity in raw_entities]
        _write_entities(entities)
        return jsonify(
            {
                "ok": True,
                "count": len(entities),
                "entities": [entity.to_public_dict() for entity in entities],
            }
        )

    @app.get("/api/patterns")
    def get_patterns():
        patterns = load_patterns(DATA_DIR)
        return jsonify(
            {
                "ok": True,
                "count": len(patterns),
                "patterns": [pattern.to_public_dict() for pattern in patterns],
            }
        )

    @app.get("/api/scan")
    def scan():
        report = _build_report_payload()
        return jsonify(
            {
                **report,
                "ok": True,
                "status": "success",
                "data_status": report["status"],
                "count": len(report["findings"]),
                "anomalies": report["findings"][:50],
            }
        )

    @app.get("/api/anomaly/<anomaly_id>")
    def get_anomaly(anomaly_id: str):
        report = _find_anomaly_report(anomaly_id)
        if report is None:
            return jsonify({"ok": False, "status": "error", "message": "anomaly not found"}), 404
        return jsonify({"ok": True, "status": "success", "report": report})

    @app.get("/api/statistics")
    def get_statistics():
        return jsonify({"ok": True, "status": "success", "statistics": _build_statistics_payload()})

    @app.get("/api/reports/latest")
    def latest_report():
        return jsonify({"ok": True, "report": _build_report_payload()})

    @app.get("/api/telemetry")
    def telemetry():
        entities, patterns = _load_runtime_data()
        return jsonify({"ok": True, "telemetry": telemetry_snapshot(len(entities), len(patterns))})

    @app.get("/api/telemetry/stream")
    def stream_telemetry():
        def snapshot_factory() -> dict[str, Any]:
            try:
                entities, patterns = _load_runtime_data()
                return telemetry_snapshot(len(entities), len(patterns))
            except DataValidationError as exc:
                snapshot = telemetry_snapshot(0, 0)
                snapshot["service"]["state"] = "data_error"
                snapshot["error"] = str(exc)
                return snapshot

        response = Response(telemetry_stream(snapshot_factory), mimetype="text/event-stream")
        response.headers["Cache-Control"] = "no-cache"
        response.headers["X-Accel-Buffering"] = "no"
        return response

    return app


def configure_socketio(app: Flask) -> SocketIO:
    socketio = SocketIO(
        app,
        async_mode="threading",
        cors_allowed_origins=_configured_cors_origins(),
    )

    @socketio.on("connect")
    def handle_connect():
        app.logger.info("SocketIO client connected: %s", request.sid)
        emit(
            "connection_status",
            {
                "status": "connected",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "statistics": _build_statistics_payload(),
            },
        )

    @socketio.on("subscribe_anomalies")
    def handle_subscribe():
        # Emit the current verified snapshot immediately. The app does not
        # fabricate real-time findings when no verified data has been loaded.
        report = _build_report_payload()
        emit(
            "anomaly_snapshot",
            {
                "status": report["status"],
                "count": len(report["findings"]),
                "anomalies": report["findings"][:50],
                "timestamp": report["generated_at"],
            },
        )
        anomaly_event = realtime_telemetry.generate_anomaly(report)
        if anomaly_event:
            emit("new_anomaly", anomaly_event)

    @socketio.on("request_scan")
    def handle_request_scan():
        emit("scan_result", _build_report_payload())

    @socketio.on("disconnect")
    def handle_disconnect():
        app.logger.info("SocketIO client disconnected: %s", request.sid)

    return socketio


def _load_runtime_data():
    return load_entities(DATA_DIR), load_patterns(DATA_DIR)


def _build_report_payload() -> dict[str, Any]:
    entities, patterns = _load_runtime_data()
    findings = run_scan(entities, patterns)
    report = build_report(findings, len(patterns))
    for finding in report["findings"]:
        finding["id"] = _stable_anomaly_id(finding)
    return report


def _build_statistics_payload() -> dict[str, Any]:
    report = _build_report_payload()
    return realtime_telemetry.get_statistics(report)


def _find_anomaly_report(anomaly_id: str) -> dict[str, Any] | None:
    report = _build_report_payload()
    for finding in report["findings"]:
        if finding["id"].lower() == anomaly_id.lower() or finding["entity"]["id"] == anomaly_id:
            return {
                "id": finding["id"],
                "summary": f"{finding['priority']} anomaly report for {finding['entity']['name']}",
                "entity": finding["entity"],
                "score": finding["score"],
                "priority": finding["priority"],
                "forensics": finding["forensics"],
                "timeline": [finding["entity"]["observed_at"], report["generated_at"]],
                "pattern_hits": finding["pattern_hits"],
                "recommendations": _recommendations_for_finding(finding),
            }
    return None


def _stable_anomaly_id(finding: dict[str, Any]) -> str:
    entity = finding.get("entity", {})
    fingerprint = "|".join(
        [
            str(entity.get("id", "")),
            str(entity.get("observed_at", "")),
            str(finding.get("priority", "")),
            str(finding.get("score", "")),
        ]
    )
    digest = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()[:12].upper()
    return f"ANOM-{digest}"


def _recommendations_for_finding(finding: dict[str, Any]) -> list[str]:
    if finding["priority"] == "P1":
        return [
            "Validate source telemetry against the original public record.",
            "Escalate to the designated analyst queue for immediate review.",
            "Preserve the current entity metrics and pattern-hit trace.",
        ]
    if finding["priority"] in {"P2", "P3"}:
        return [
            "Review the strongest contributing pattern hit.",
            "Refresh verified telemetry before taking external action.",
        ]
    return ["Continue monitoring until verified metrics cross an escalation threshold."]


def _configured_cors_origins() -> list[str] | str | None:
    raw_origins = os.environ.get("APP_CORS_ORIGINS", "").strip()
    if not raw_origins:
        return None
    if raw_origins == "*":
        return "*"
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


def _write_entities(entities) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    target = DATA_DIR / "entities.json"
    payload = {
        "schema_version": "1.0",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "entities": [entity.to_public_dict() for entity in entities],
    }

    with NamedTemporaryFile("w", encoding="utf-8", dir=DATA_DIR, delete=False) as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
        temp_name = handle.name
    Path(temp_name).replace(target)


app = create_app()
socketio = configure_socketio(app)


if __name__ == "__main__":
    host = os.environ.get("APP_HOST", "0.0.0.0")
    port = int(os.environ.get("APP_PORT", "8080"))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    socketio.run(app, host=host, port=port, debug=debug, allow_unsafe_werkzeug=True)
