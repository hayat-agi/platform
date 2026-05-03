# Model deployment & retrain workflow

How to ship a new BERTurk classifier into production without touching code.

## How distribution works

The 442 MB model file (`multitask_v3.pt`) is too large for git. Instead, it lives in a [HuggingFace Hub](https://huggingface.co/) repo (`hayat-agi/classifier`). On first boot, the ai-fusion service downloads the weights into a Docker named volume (`model-cache`). Subsequent restarts use the cached file — no re-download.

```
┌─────────────────┐    pulls on     ┌──────────────┐    cached in    ┌──────────────┐
│  HuggingFace    │  ─ first boot ─ │  ai-fusion   │  ────────────▶  │  model-cache │
│  Hub repo       │                 │  container   │                 │  volume      │
│  hayat-agi/...  │                 │              │  ◀────loads──── │              │
└─────────────────┘                 └──────────────┘                 └──────────────┘
```

Resolution order in [`app/model_loader.py`](https://github.com/hayat-agi/ai/blob/main/hayat-agi-fusion/app/model_loader.py):
1. Local file at `MODEL_PATH` exists → use it.
2. `HF_MODEL_REPO` is set → download from Hub, cache, use it.
3. Neither → log warning, fall back to mock classifier.

## One-time setup

1. **Create the HF Hub repo** (private). Using the modern `hf` CLI (the older `huggingface-cli` also works):
   ```bash
   hf auth login                        # paste a write token
   hf repo create hayat-agi/classifier --repo-type model --private
   ```

2. **Upload the current model** (run once from wherever your `.pt` lives):
   ```bash
   hf upload hayat-agi/classifier multitask_v3.pt  multitask_v3.pt
   hf upload hayat-agi/classifier multitask_v3.json multitask_v3.json
   ```

3. **Distribute a read token** to teammates: `https://huggingface.co/settings/tokens` → New token → "read" scope → copy. Each teammate puts it in their local `.env`:
   ```
   HF_TOKEN=hf_...
   HF_MODEL_REPO=hayat-agi/classifier
   HF_MODEL_FILENAME=multitask_v3.pt
   ```

4. **First boot** — `docker compose up` will spend ~30s downloading on the first run, then cache forever in the `model-cache` volume.

## Retrain → deploy (~5 minutes)

After a Colab retrain produces `multitask_v4.pt` + `multitask_v4.json`:

```bash
# 1. Upload the new files (keeps v3 on Hub for rollback)
hf upload hayat-agi/classifier multitask_v4.pt  multitask_v4.pt
hf upload hayat-agi/classifier multitask_v4.json multitask_v4.json

# 2. Bump the env var (in your local .env, or wherever the prod env lives)
HF_MODEL_FILENAME=multitask_v4.pt

# 3. Restart only the ai-fusion service
docker compose up -d ai-fusion
```

That's it. The first `/ingest` after restart triggers the download (~30s the first time on a new host, cached after).

## Rollback

If v4 misbehaves, revert:
```bash
HF_MODEL_FILENAME=multitask_v3.pt
docker compose up -d ai-fusion
```
Old version is still in the cache volume — no re-download needed.

## Pinning by revision (optional, advanced)

Instead of file-name versioning you can use HF Hub git revisions:

```bash
# After upload, tag the commit
hf repo tag hayat-agi/classifier v4 --revision main
```

```ini
# .env
HF_MODEL_REVISION=v4
```

Useful if you want to publish a "latest stable" pointer that consumers track without changing filename.

## A/B testing two models

Run two ai-fusion containers with different `HF_MODEL_FILENAME` env, route a percentage of `/ingest` traffic to each (nginx, traefik, or a tiny custom gateway). Out of scope for this doc.

## What about CI?

Future work: a GitHub Action in the `ai` repo that triggers when a new `models/multitask_*.json` metadata file is committed → uploads the corresponding `.pt` to HF Hub → opens a PR in `platform` bumping `HF_MODEL_FILENAME` in `.env.example`. Not built yet.
