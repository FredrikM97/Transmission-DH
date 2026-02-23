# Transmission-DH

Automated torrent cleanup for [Transmission](https://transmissionbt.com/).  
Removes torrents based on seed ratio, age (TTL) and dead-torrent detection.
Runs on a configurable cron schedule inside Docker.

## Features

- **Ratio limit** – remove when upload ratio reaches a threshold
- **Hard TTL** – remove any torrent older than N hours regardless of status
- **Dead-torrent detection** – remove incomplete torrents that have stalled past a retention window
- **Label filtering** – only process torrents belonging to specific labels (e.g. `radarr`, `sonarr`)
- **Tracker exclusions** – skip torrents from specific tracker hosts
- **Dry-run mode** – evaluate rules without deleting anything
- **Structured logging** via [pino](https://getpino.io)

## Project structure

```
src/
  config.ts              Env-var parsing → camelCase Config type
  transmission/
    client.ts            Transmission RPC client + raw types
  handler.ts             Domain types + removal logic
  index.ts               Entry point and cron scheduler
```

## Quick start with Docker Compose

```bash
cp .env.example .env        # review and adjust
docker compose up -d
docker compose logs -f transmission-dh
```

The `SCHEDULE` variable in `docker-compose.yml` controls how often the
handler runs (standard 5-field cron, UTC).  Set it to an empty string to
run once and exit.

## Running locally

```bash
cp .env.example .env
npm install
npm run dev          # uses tsx, picks up .env automatically
```

## Configuration

All options are set through environment variables (see `.env.example`).

| Variable | Default | Description |
|---|---|---|
| `TRANSMISSION_URL` | `http://localhost:9091/transmission/rpc` | RPC endpoint |
| `TRANSMISSION_AUTH` | – | Optional `username:password` |
| `ALLOWED_LABELS` | `radarr,sonarr` | Comma-separated labels to process |
| `EXCLUDED_TRACKERS` | – | Comma-separated tracker hostnames to skip |
| `MAX_RATIO` | `2.0` | Remove when upload ratio ≥ this value |
| `DEAD_RETENTION_HOURS` | `12` | Hours before an incomplete torrent is removed |
| `MAX_AGE_HOURS` | `120` | Hard TTL in hours |
| `SCHEDULE` | `0 * * * *` | cron expression (UTC); empty = run once |
| `LOG_LEVEL` | `info` | `fatal` / `error` / `warn` / `info` / `debug` / `trace` |
| `LOG_PRETTY` | `true` | Pretty-print logs (disable in production) |
| `DRY_RUN` | `false` | Preview removals without deleting |
