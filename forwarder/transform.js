// Pure function: command-center Alert → AI fusion IngestPayload.
//
// The two schemas were designed independently (see docs/architecture.md
// for the full divergence list). This module is the explicit translation
// layer; isolate the impedance mismatch here so consumers stay clean.

/**
 * @param {object} alert  Mongoose Alert document (or plain object).
 * @returns {object}      IngestPayload ready to POST to ai-fusion /ingest.
 */
export function alertToIngestPayload(alert) {
  const messageId = String(alert._id);
  const text = alert.text ?? alert.payload?.message ?? "";
  const sentAt = alert.payload?.sentAt ?? alert.createdAt ?? new Date();
  const receivedAt = sentAt instanceof Date ? sentAt.toISOString() : new Date(sentAt).toISOString();
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
    health_profile: null,
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
 * @returns {{ classification: object, incident: string }}
 */
export function ingestResponseToAlertUpdate(ingestResponse) {
  const c = ingestResponse.classification ?? {};
  const categories = ingestResponse.incident_categories ?? c.categories ?? [];
  const classifiedAt = c.classified_at ? new Date(c.classified_at) : new Date();
  return {
    incident: ingestResponse.incident_id,
    classification: {
      emergency_category: categories[0] ?? "GENERAL",
      severity: URGENCY_TO_SEVERITY[c.urgency] ?? 0.5,
      confidence: c.message_type_confidence ?? c.urgency_confidence ?? 0,
      model_version: c.model_version ?? "unknown",
      classified_at: classifiedAt,
    },
  };
}
