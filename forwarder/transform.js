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
