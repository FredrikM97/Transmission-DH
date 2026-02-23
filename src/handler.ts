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
  private isFirstRun = true;

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
    
    // Display all torrents summary only on first run
    if (this.isFirstRun) {
      this.displayTorrentsSummary(hydrated);
      this.logger.info("───────────────────────────────────────────────────────────────────────────────");
      this.isFirstRun = false;
    }
    
    const byLabel = hydrated.filter((t) => this.isAllowedLabel(t));
    const eligible = byLabel.filter((t) => !this.hasExcludedTracker(t));

    this.logger.info(`Filtering: ${torrents.length} total → ${byLabel.length} by label → ${eligible.length} eligible`);

    const candidates = eligible.flatMap((t) => this.evaluate(t));

    if (candidates.length === 0) {
      this.logger.info("No torrents to remove");
      return;
    }

    this.logger.info("───────────────────────────────────────────────────────────────────────────────");
    this.logger.info(`Found ${candidates.length} candidate(s) for removal:`);
    for (const c of candidates) {
      this.logger.info(`[${c.reason.toUpperCase()}] ${c.torrent.name}`);
    }

    await this.performRemoval(candidates.map((c) => c.torrent.id));
  }

  private async retryGetTorrents(): Promise<RawTorrent[]> {
    return this.client.getTorrents();
  }


  private async performRemoval(ids: number[]): Promise<void> {
    if (this.config.dryRun) {
      this.logger.warn(`DRY_RUN enabled – skipping removal of ${ids.length} torrent(s)`);
      return;
    }

    await this.client.removeTorrents(ids, true);
    this.logger.info(`Torrents removed: ${ids.length}`);
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

  private displayTorrentsSummary(torrents: Torrent[]): void {
    if (torrents.length === 0) {
      return;
    }

    const maxNameLength = 60;
    const rows = torrents.map((t) => ({
      status: t.percentDone === 100 ? "Done" : "Active",
      ratio: t.uploadRatio === -1 ? "N/A" : t.uploadRatio.toFixed(2),
      age: `${Math.round(t.ageHours)}h`,
      label: t.label,
      name: t.name.length > maxNameLength ? t.name.substring(0, maxNameLength - 3) + "..." : t.name,
    }));

    const statusWidth = Math.max(6, ...rows.map((r) => r.status.length));
    const ratioWidth = Math.max(5, ...rows.map((r) => r.ratio.length));
    const ageWidth = Math.max(3, ...rows.map((r) => r.age.length));
    const labelWidth = Math.max(5, ...rows.map((r) => r.label.length));

    const headerStatus = "Status".padEnd(statusWidth);
    const headerRatio = "Ratio".padStart(ratioWidth);
    const headerAge = "Age".padStart(ageWidth);
    const headerLabel = "Label".padEnd(labelWidth);
    this.logger.info(`${headerStatus}  ${headerRatio}  ${headerAge}  ${headerLabel}  Name`);
    
    const totalWidth = statusWidth + ratioWidth + ageWidth + labelWidth + 50;
    this.logger.info(`${"-".repeat(totalWidth)}`);

    for (const row of rows) {
      const colStatus = row.status.padEnd(statusWidth);
      const colRatio = row.ratio.padStart(ratioWidth);
      const colAge = row.age.padStart(ageWidth);
      const colLabel = row.label.padEnd(labelWidth);
      this.logger.info(`${colStatus}  ${colRatio}  ${colAge}  ${colLabel}  ${row.name}`);
    }
  }
}
