# Schema

Canonical schemas shared across all Hayat Ağı components. **This directory is the single source of truth.**

## Files

| File | Owns |
|---|---|
| `category_schema.json` | 3-head classifier output: message type, urgency, 11 categories with thresholds + team routing + scoring formula. |

## Why this lives in `platform`

Previously the schema lived only in [`ai/schemas/`](https://github.com/hayat-agi/ai/tree/main/schemas), which made it invisible to mobile and command-center. Each component then re-encoded the same enums by hand (Pydantic in `ai`, Mongoose strings in `command-center`, Dart classes in `mobile`), causing silent drift — see `docs/architecture.md` for the integration audit.

By keeping the canonical file here and generating typed bindings into each language, we get one place to change and machine-checked consistency everywhere.

## Sync strategy

Today the file is **manually copied** from `ai/schemas/category_schema.json`. To prevent drift while CI is being set up:

- Treat **this copy** as authoritative.
- When edited, mirror the change into `ai/schemas/` until automation catches up.

## Planned automation

- `generated/python/` — Pydantic models via `datamodel-codegen`, consumed by `ai`
- `generated/typescript/` — TS types via `json-schema-to-typescript`, consumed by `command-center` (frontend + backend)
- `generated/dart/` — Dart classes via `json_serializable` or hand-rolled, consumed by `mobile`
- GitHub Action triggered on `schema/*.json` changes: regenerate bindings, open PRs in dependent repos.
