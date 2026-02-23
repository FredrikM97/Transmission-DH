# Transmission-DH

Automated torrent cleanup for [Transmission](https://transmissionbt.com/).  
Removes torrents based on seed ratio, age (TTL) and dead-torrent detection.

## Features

- **Ratio limit** – remove when upload ratio reaches threshold
- **Hard TTL** – remove any torrent older than N hours
- **Dead-torrent detection** – remove incomplete torrents that stall
- **Label filtering** – only process torrents with specific labels
- **Tracker exclusions** – skip torrents from specific trackers
- **Dry-run mode** – preview removals without deleting
- **Zero production dependencies** – 14KB bundled ESM

## Setup

### Docker

```bash
docker compose up -d
```

Edit `docker-compose.yml` to configure.

### Local

```bash
npm install
TRANSMISSION_URL=http://localhost:9091/transmission/rpc npm run dev
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `TRANSMISSION_URL` | `http://localhost:9091/transmission/rpc` | RPC endpoint |
| `TRANSMISSION_AUTH` | – | Optional `username:password` |
| `ALLOWED_LABELS` | `radarr,sonarr` | Labels to process |
| `EXCLUDED_TRACKERS` | – | Trackers to skip |
| `MAX_RATIO` | `2.0` | Remove when ratio ≥ this |
| `DEAD_RETENTION_HOURS` | `12` | Hours before removing incomplete torrents |
| `MAX_AGE_HOURS` | `120` | Hard TTL in hours |
| `SCHEDULE` | `0 0 * * *` | Cron expression (UTC); empty = run once and exit |
| `LOG_LEVEL` | `info` | Logging level |
| `DRY_RUN` | `false` | Preview without deleting |