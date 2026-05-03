// Fusion forwarder — bridges command-center MongoDB to the AI fusion service.
//
// Responsibilities:
//   1. Poll the `alerts` collection for documents where classification.classified_at is null.
//   2. Transform each Alert into the AI service's IngestPayload shape.
//   3. POST to `${AI_FUSION_URL}/ingest` and capture the response.
//   4. Write the returned ClassificationResult + incident_id back to the Alert.
//
// This module is intentionally a scaffold: the polling loop is wired but the
// transform, POST, and writeback are TODO. They land in subsequent commits.

import { MongoClient } from "mongodb";
import "dotenv/config";
import { alertToIngestPayload, ingestResponseToAlertUpdate } from "./transform.js";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017/hayat-agi";
const AI_FUSION_URL = process.env.AI_FUSION_URL ?? "http://localhost:8000";
const FUSION_INGEST_TOKEN = process.env.FUSION_INGEST_TOKEN ?? "";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000);
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 25);

const client = new MongoClient(MONGO_URI);

async function postToFusion(payload) {
  const headers = { "Content-Type": "application/json" };
  if (FUSION_INGEST_TOKEN) headers["Authorization"] = `Bearer ${FUSION_INGEST_TOKEN}`;
  const res = await fetch(`${AI_FUSION_URL}/ingest`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`ai-fusion /ingest returned ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function processAlert(alerts, alert) {
  const payload = alertToIngestPayload(alert);
  const response = await postToFusion(payload);
  const update = ingestResponseToAlertUpdate(response);
  await alerts.updateOne({ _id: alert._id }, { $set: update });
  return response.incident_id;
}

async function pollOnce(alerts) {
  const cursor = alerts
    .find({ "classification.classified_at": null })
    .limit(BATCH_SIZE);

  let processed = 0;
  let failed = 0;
  for await (const alert of cursor) {
    try {
      const incidentId = await processAlert(alerts, alert);
      processed += 1;
      console.log(`[forwarder] alert ${alert._id} -> incident ${incidentId}`);
    } catch (err) {
      failed += 1;
      console.error(`[forwarder] alert ${alert._id} failed:`, err.message);
    }
  }
  if (failed > 0) console.warn(`[forwarder] ${failed} alerts failed this round`);
  return processed;
}

async function main() {
  console.log(`[forwarder] connecting to ${MONGO_URI}`);
  await client.connect();
  const db = client.db();
  const alerts = db.collection("alerts");
  console.log(`[forwarder] polling every ${POLL_INTERVAL_MS}ms, AI=${AI_FUSION_URL}`);

  // Graceful shutdown.
  let stopping = false;
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, async () => {
      if (stopping) return;
      stopping = true;
      console.log(`[forwarder] received ${sig}, shutting down`);
      await client.close();
      process.exit(0);
    });
  }

  while (!stopping) {
    try {
      const n = await pollOnce(alerts);
      if (n > 0) console.log(`[forwarder] processed ${n} alerts`);
    } catch (err) {
      console.error("[forwarder] poll error:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("[forwarder] fatal:", err);
  process.exit(1);
});
