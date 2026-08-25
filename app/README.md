# Standalone Anomaly Surge Detector

This directory contains a standalone Flask web app with:

- validated JSON ingestion
- deterministic anomaly scoring
- forensic report output
- static dashboard UI
- live server-sent telemetry
- Docker packaging

The app does not ship mock findings. `data/entities.json` starts empty, and
the dashboard reports `no_verified_data_loaded` until trusted records are added.

## Run locally

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open `http://localhost:8080`.

## Run with Docker

```bash
docker build -t anomaly-surge-detector .
docker run --rm -p 8080:8080 anomaly-surge-detector
```

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
      "tags": ["verified"]
    }
  ]
}
```

All records are validated before they are written to `data/entities.json`.
