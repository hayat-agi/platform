#!/usr/bin/env bash
# Nightly MongoDB backup for the Hayat Ağı stack.
#
# Runs `mongodump` inside the hayat-agi-mongo container, gzip-archives the
# `hayat-agi` database, copies the archive to the host, and prunes archives
# older than RETENTION_DAYS.
#
# Schedule via crontab (every night at 03:00 local time):
#   0 3 * * * /home/ubuntu/hayat-agi-platform/scripts/backup-mongo.sh
#
# Restore example:
#   sudo docker cp dump_20260516_030001.gz hayat-agi-mongo:/tmp/restore.gz
#   sudo docker exec hayat-agi-mongo mongorestore --archive=/tmp/restore.gz --gzip --drop
#
# Environment overrides:
#   BACKUP_DIR        — destination on host (default ~/mongo-backups)
#   RETENTION_DAYS    — prune older than N days (default 14)
#   MONGO_CONTAINER   — container name (default hayat-agi-mongo)
#   MONGO_DB          — database name (default hayat-agi)
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/mongo-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
MONGO_CONTAINER="${MONGO_CONTAINER:-hayat-agi-mongo}"
MONGO_DB="${MONGO_DB:-hayat-agi}"
LOG_FILE="${LOG_FILE:-$HOME/backup-mongo.log}"

ts=$(date +%Y%m%d_%H%M%S)
iso=$(date -Iseconds)
archive_name="dump_${MONGO_DB}_${ts}.gz"
in_container="/tmp/${archive_name}"
on_host="${BACKUP_DIR}/${archive_name}"

mkdir -p "${BACKUP_DIR}"

log() { echo "[$(date -Iseconds)] $*" | tee -a "${LOG_FILE}"; }

log "backup start db=${MONGO_DB} container=${MONGO_CONTAINER} dest=${on_host}"

# Take the dump inside the container. --archive + --gzip emits a single
# compressed BSON stream we can ship as one file.
if ! sudo docker exec "${MONGO_CONTAINER}" \
      mongodump --quiet --db "${MONGO_DB}" \
                --archive="${in_container}" --gzip; then
  log "FATAL mongodump failed"
  exit 1
fi

# Copy out to host.
if ! sudo docker cp "${MONGO_CONTAINER}:${in_container}" "${on_host}"; then
  log "FATAL docker cp failed"
  sudo docker exec "${MONGO_CONTAINER}" rm -f "${in_container}" || true
  exit 1
fi

# Clean up inside the container.
sudo docker exec "${MONGO_CONTAINER}" rm -f "${in_container}" || true

# Verify the host file actually got bytes.
size_bytes=$(stat -c %s "${on_host}" 2>/dev/null || stat -f %z "${on_host}" 2>/dev/null || echo 0)
if [ "${size_bytes}" -lt 100 ]; then
  log "FATAL archive suspiciously small (${size_bytes} bytes): ${on_host}"
  exit 1
fi

# Prune old archives (retention window).
deleted=$(find "${BACKUP_DIR}" -name "dump_${MONGO_DB}_*.gz" -mtime "+${RETENTION_DAYS}" -delete -print | wc -l)

log "backup ok size=${size_bytes}B archive=${on_host} pruned=${deleted}"
