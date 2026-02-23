import path from "path";
import type { Logger } from "pino";
import { TransmissionClient, type RawTorrent } from "./client.js";
import type { Config } from "./config.js";

export interface Torrent {
  id: number;
  name: string;
  percentDone: number;
  uploadRatio: number;
  ageHours: number;
  label: string;
  downloadDir: string;
  trackerUrls: string[];
  error: number;
  errorString: string;
}

export enum RemovalReason {
  Ratio = "ratio",
  Ttl = "ttl",
  Dead = "dead",
}

export interface RemovalCandidate {
  torrent: Torrent;
  reason: RemovalReason;
}

export class Handler {
  private client: TransmissionClient;

  constructor(
    client: TransmissionClient,
    private readonly config: Config,
    private readonly logger: Logger
  ) {
    this.client = client;
  }

  async run(): Promise<void> {
    let torrents: RawTorrent[];
    try {
      this.logger.info(`📡 Attempting to fetch torrents from ${this.config.transmissionUrl.toString()}...`);
      torrents = await this.retryGetTorrents();
      this.logger.info(`✓ Connected to Transmission: ${torrents.length} torrents`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`✗ Failed to connect: ${message}`);
      throw err;
    }

    const hydrated = torrents.map((t) => this.hydrate(t));
    const byLabel = hydrated.filter((t) => this.isAllowedLabel(t));
    const eligible = byLabel.filter((t) => !this.hasExcludedTracker(t));

    this.logger.info(`Filtering: ${torrents.length} total → ${byLabel.length} by label → ${eligible.length} eligible`);

    const candidates = eligible.flatMap((t) => this.evaluate(t));

    if (candidates.length === 0) {
      this.logger.info("No torrents to remove");
      return;
    }

    this.logger.info(`Found ${candidates.length} candidate(s) for removal:`);
    for (const c of candidates) {
      this.logger.info(`  [${c.reason.toUpperCase()}] ${c.torrent.name}`);
    }

    await this.performRemoval(candidates.map((c) => c.torrent.id));
  }

  private async retryGetTorrents(): Promise<RawTorrent[]> {
    return this.client.getTorrents();
  }


  /** Removes torrents by ID, or logs a dry-run message if configured. */
  private async performRemoval(ids: number[]): Promise<void> {
    if (this.config.dryRun) {
      this.logger.warn(
        { count: ids.length },
        "DRY_RUN enabled – skipping removal"
      );
      return;
    }

    await this.client.removeTorrents(ids, true);
    this.logger.info({ removed: ids.length }, "Torrents removed");
  }

  private formatRemovalReason(candidate: RemovalCandidate): string {
    const { torrent, reason } = candidate;

    switch (reason) {
      case RemovalReason.Ratio:
        return `Ratio ${torrent.uploadRatio.toFixed(2)} ≥ ${this.config.maxRatio}`;
      case RemovalReason.Dead:
        return `Incomplete (${torrent.percentDone.toFixed(1)}%) for ${torrent.ageHours.toFixed(1)}h (threshold: ${this.config.deadRetentionHours}h)`;
      case RemovalReason.Ttl:
        return `Age ${torrent.ageHours.toFixed(1)}h exceeds TTL of ${this.config.maxAgeHours}h`;
    }
  }

  private hydrate(raw: RawTorrent): Torrent {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ageHours = (nowSeconds - raw.addedDate) / 3600;

    const label =
      raw.labels && raw.labels.length > 0
        ? raw.labels[0]
        : path.basename(raw.downloadDir || "");

    return {
      id: raw.id,
      name: raw.name,
      percentDone: (raw.percentDone || 0) * 100,
      uploadRatio: raw.uploadRatio || 0,
      ageHours,
      label,
      downloadDir: raw.downloadDir || "",
      trackerUrls: (raw.trackers || []).map((t) => t.announce || ""),
      error: raw.error || 0,
      errorString: raw.errorString || "",
    };
  }

  private isAllowedLabel(torrent: Torrent): boolean {
    const label = torrent.label.toLowerCase();
    return this.config.allowedLabels.includes(label);
  }

  private hasExcludedTracker(torrent: Torrent): boolean {
    if (this.config.excludedTrackers.length === 0) return false;

    for (const url of torrent.trackerUrls) {
      const host = new URL(url).hostname.toLowerCase();
      if (this.config.excludedTrackers.some((t) => host.includes(t))) {
        return true;
      }
    }
    return false;
  }

  private evaluate(torrent: Torrent): RemovalCandidate[] {
    const result = this.checkRatioRule(torrent) || 
                   this.checkDeadRule(torrent) || 
                   this.checkTtlRule(torrent);

    return result ? [result] : [];
  }

  private checkRatioRule(torrent: Torrent): RemovalCandidate | null {
    if (torrent.uploadRatio === -1 || torrent.uploadRatio < this.config.maxRatio) {
      return null;
    }

    return {
      torrent,
      reason: RemovalReason.Ratio,
    };
  }

  private checkDeadRule(torrent: Torrent): RemovalCandidate | null {
    const isIncomplete = torrent.percentDone < 100;
    const isPastDeadRetention = torrent.ageHours >= this.config.deadRetentionHours;

    if (!isIncomplete || !isPastDeadRetention) {
      return null;
    }

    return {
      torrent,
      reason: RemovalReason.Dead,
    };
  }

  private checkTtlRule(torrent: Torrent): RemovalCandidate | null {
    if (torrent.ageHours < this.config.maxAgeHours) {
      return null;
    }

    return {
      torrent,
      reason: RemovalReason.Ttl,
    };
  }
}
