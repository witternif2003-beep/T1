# Standalone Anomaly Surge Detector

This directory contains a standalone Flask web app with:

- validated JSON ingestion
- deterministic anomaly scoring
- 47 deterministic forensic text vectors for verified public attributes
- forensic report output
- static dashboard UI
- live server-sent telemetry
- Docker packaging

The app does not ship mock findings. `data/entities.json` starts empty, and
the dashboard reports `no_verified_data_loaded` until trusted records are added.

## Runtime versions

- Python 3.14.7
- Flask 3.1.3
- Flask-Cors 6.0.5
- Flask-SocketIO 5.6.1
- Gunicorn 26.2.0
- simple-websocket 1.1.0

`requirements.txt` pins the direct runtime dependencies. `requirements.lock`
pins the full latest resolved deployment set and is the file used by Docker and
CI.

## Run locally

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.lock
python app.py
```

Open `http://localhost:8080`.

## Run with Docker

```bash
docker build -t anomaly-surge-detector .
docker run --rm -p 8080:8080 anomaly-surge-detector
```

## Deployment build

The `Standalone App Build` GitHub Actions workflow installs the locked latest
runtime stack, runs dependency advisory checks, smoke-tests the Flask and
SocketIO APIs, validates the Gunicorn entrypoint, and uploads
`standalone-anomaly-app.tar.gz` as a deployable artifact.

## Load verified records

POST a complete replacement entity set to `/api/entities`:

```json
{
  "entities": [
    {
      "id": "source-system:entity-id",
      "name": "Verified Entity Name",
      "category": "network",
      "source": {
        "name": "Trusted Sensor",
        "url": "https://example.com/source-record"
      },
      "observed_at": "2026-08-25T02:10:00Z",
      "metrics": {
        "acceleration_index": 2.4,
        "deviation_sigma": 3.8,
        "source_confidence": 0.91,
        "impact_score": 82
      },
      "attributes": {
        "public_record_note": "Replace this with verified public-source text."
      },
      "tags": ["verified"]
    }
  ]
}
```

All records are validated before they are written to `data/entities.json`.
Optional `attributes` fields are scanned by the forensic-vector engine. Reports
include vector hits and a chain-of-custody hash, but the app never creates
simulated anomaly records.
