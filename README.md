# Hayat Ağı — Platform

Integration glue for the **Hayat Ağı (Life Network)** disaster communication system: a post-earthquake mesh network that lets citizens send emergency reports when cellular infrastructure fails.

This repo holds the cross-cutting pieces that don't belong to any single component: the shared schema, local-dev orchestration, the AI ↔ command-center bridge, end-to-end tests, and deployment configs.

## Repos

| Repo | Stack | Role |
|---|---|---|
| [`ai`](https://github.com/hayat-agi/ai) | Python, FastAPI, PyTorch, BERTurk | 3-head Turkish classifier + incident clustering + scoring |
| [`mobile`](https://github.com/hayat-agi/mobile) | Flutter, Dart | Citizen app, BLE peripheral client, disaster mode |
| [`command-center`](https://github.com/hayat-agi/command-center) | Node/Express + MongoDB + React/Vite | Web admin & citizen panel, gateway management, live map |
| [`mesh-core`](https://github.com/hayat-agi/mesh-core) | Arduino / ESP32 + EByte SX1262 | LoRa mesh routing protocol — long-range backhaul |
| [`platform`](https://github.com/hayat-agi/platform) | this repo | Glue: schema, compose, forwarder, e2e, deploy |

## Status

🚧 Work in progress. The components were built independently and are being integrated. End-to-end flow is not wired yet — see [`docs/architecture.md`](docs/architecture.md) for the current state.

## Quick start

Local-dev orchestration is being set up. Once `docker-compose.yml` lands, a single `docker compose up` will bring up Mongo + AI fusion (mock mode) + command-center backend + frontend.

## Team

Berkay Aktaş · Alin Kısakürek · Arzu Tuğçe Koca · Berat Mert Gökkaya
