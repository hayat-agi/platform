# fusion-forwarder

Node service that bridges the command-center MongoDB to the AI fusion service.

## Why

The command-center backend creates `Alert` documents in MongoDB when citizens send disaster events from the mobile app. The AI fusion service (FastAPI) classifies messages and clusters them into incidents — but the two services don't talk to each other. This forwarder is the missing link.

## Flow

1. Poll MongoDB for `alerts` documents where `classification.classified_at == null`.
2. Transform each Alert into the AI service's `IngestPayload` shape.
3. `POST ${AI_FUSION_URL}/ingest`.
4. Write the returned `ClassificationResult` and `incident_id` back into the Alert.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `MONGO_URI` | `mongodb://localhost:27017/hayat-agi` | MongoDB connection string |
| `AI_FUSION_URL` | `http://localhost:8000` | Base URL of the AI fusion service |
| `POLL_INTERVAL_MS` | `5000` | Poll interval in milliseconds |
| `BATCH_SIZE` | `25` | Max alerts processed per poll |

## Status

Scaffold only — polling loop is wired, but transform / POST / writeback are TODO and will land in subsequent commits.

## Local run (without docker)

```bash
cd forwarder
npm install
MONGO_URI=mongodb://localhost:27017/hayat-agi \
AI_FUSION_URL=http://localhost:8000 \
npm start
```
