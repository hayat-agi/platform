// Pure function: command-center Alert → AI fusion IngestPayload.
//
// The two schemas were designed independently (see docs/architecture.md
// for the full divergence list). This module is the explicit translation
// layer; isolate the impedance mismatch here so consumers stay clean.

/**
 * @param {object} alert  Mongoose Alert document (or plain object).
 * @param {object|null} healthProfile  Optional snapshot of the source
 *   user's medical profile (medicalConditions / medications / prosthetics
 *   / bloodType). Caller resolves this from the User collection — this
 *   module stays pure and DB-free.
 * @returns {object}      IngestPayload ready to POST to ai-fusion /ingest.
 */
export function alertToIngestPayload(alert, healthProfile = null) {
  const messageId = String(alert._id);
  const text = alert.text ?? alert.payload?.message ?? "";
  // received_at = the time the *backend* accepted the alert (alert.createdAt).
  // We deliberately ignore alert.payload.sentAt because clients send it in
  // wildly different shapes — phones send ISO strings, the gateway firmware
  // sends a millis-since-boot integer-as-string ("3500") which Date()
  // parses as year 3500. Backend receipt time is the only meaningful
  // cross-device wall-clock anyway.
  const receivedAt = (alert.createdAt instanceof Date
    ? alert.createdAt
    : new Date(alert.createdAt ?? Date.now())).toISOString();
  const gatewayId = alert.gateway != null ? String(alert.gateway) : (alert.device_id ?? "unknown");
  const lat = alert.location?.lat ?? 0;
  const lng = alert.location?.lng ?? 0;
  const senderPseudonym = alert.source_user != null ? String(alert.source_user) : `gateway-${gatewayId}`;

  return {
    message_id: messageId,
    text,
    received_at: receivedAt,
    gateway_id: gatewayId,
    gateway_location: { lat, lng },
    sender_pseudonym: senderPseudonym,
    lang: alert.lang ?? "tr",
    health_profile: healthProfile,
  };
}

const URGENCY_TO_SEVERITY = {
  CRITICAL: 1.0,
  HIGH: 0.75,
  MEDIUM: 0.5,
  LOW: 0.25,
};

/**
 * Map AI fusion /ingest response back into the Alert.classification subdoc
 * shape used by command-center MongoDB. Lossy by design — see the audit
 * doc for which fields don't have a clean equivalent.
 *
 * @param {object} ingestResponse  Body returned by POST /ingest.
 * @param {object|null} healthProfile  The snapshot we sent up with the
 *   payload — we echo it back into the Alert so the audit trail survives
 *   user-profile edits AND fusion in-memory wipes.
 * @returns {{ classification: object, incident: string, healthProfile?: object, healthRiskFactors?: array }}
 */
export function ingestResponseToAlertUpdate(ingestResponse, healthProfile = null) {
  const c = ingestResponse.classification ?? {};
  const categories = ingestResponse.incident_categories ?? c.categories ?? [];
  const classifiedAt = c.classified_at ? new Date(c.classified_at) : new Date();
  const update = {
    incident: ingestResponse.incident_id,
    classification: {
      emergency_category: categories[0] ?? "GENERAL",
      severity: URGENCY_TO_SEVERITY[c.urgency] ?? 0.5,
      confidence: c.message_type_confidence ?? c.urgency_confidence ?? 0,
      model_version: c.model_version ?? "unknown",
      classified_at: classifiedAt,
    },
  };
  if (healthProfile) {
    update.healthProfile = healthProfile;
  }
  const factors = ingestResponse.event_health_risk_factors;
  if (Array.isArray(factors) && factors.length > 0) {
    update.healthRiskFactors = factors;
  }
  return update;
}
