import type { Logger } from "pino";
import type { Auth } from "./config.js";

export interface RawTorrent {
  id: number;
  name: string;
  percentDone: number;
  uploadRatio: number;
  addedDate: number;
  downloadDir: string;
  labels: string[];
  error: number;
  errorString: string;
  trackers: ReadonlyArray<{ announce: string; id: number; scrape: string; tier: number }>;
}

interface RPCResponse<T> {
  result: string;
  arguments?: T;
}

interface TorrentGetResponse {
  torrents: Array<{
    id: number;
    name: string;
    percentDone: number;
    uploadRatio: number;
    addedDate: number;
    downloadDir: string;
    labels: string[];
    error: number;
    errorString: string;
    trackers: Array<{ announce: string; id: number; scrape: string; tier: number }>;
  }>;
}

/**
 * Custom Transmission RPC client without external dependencies.
 * Communicates directly with the Transmission RPC API.
 */
export class TransmissionClient {
  private url: URL;
  private auth?: Auth;
  private sessionId: string | null = null;
  private logger: Logger;

  constructor(
    urlString: string,
    logger: Logger,
    auth?: Auth
  ) {
    this.url = new URL(urlString);
    this.auth = auth;
    this.logger = logger;
  }

  /** Encodes credentials to Base64 for Basic Auth. */
  private toBase64(input: string): string {
    return Buffer.from(input, "utf-8").toString("base64");
  }

  /** Creates Basic Auth header if credentials are provided. */
  private getAuthHeader(): string | undefined {
    if (this.auth?.username || this.auth?.password) {
      const credentials = `${this.auth?.username || ""}:${this.auth?.password || ""}`;
      return `Basic ${this.toBase64(credentials)}`;
    }
    return undefined;
  }

  /** Makes an RPC request to the Transmission server. */
  private async rpc<T>(
    method: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args?: { [key: string]: any },
    retryCount: number = 0,
  ): Promise<T> {
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("Accept", "application/json");

    const authHeader = this.getAuthHeader();
    if (authHeader) {
      headers.set("Authorization", authHeader);
    }

    if (this.sessionId) {
      headers.set("X-Transmission-Session-Id", this.sessionId);
    }

    const body = JSON.stringify({ method, arguments: args });

    try {
      const response = await fetch(this.url.toString(), {
        method: "POST",
        headers,
        body,
      });

      // Handle 409 Conflict - session ID negotiation
      if (response.status === 409 || response.headers.has("X-Transmission-Session-Id")) {
        const newSessionId = response.headers.get("X-Transmission-Session-Id");
        if (newSessionId) {
          this.sessionId = newSessionId;
        }
        if (response.status === 409) {
          if (retryCount >= 2) {
            throw new Error("Failed to negotiate Transmission session after multiple attempts (409).");
          }
          return this.rpc(method, args, retryCount + 1);
        }
      }

      if (!response.ok) {
        throw new Error(`API request failed: [${response.status}] ${response.statusText}`);
      }

      const json = (await response.json()) as RPCResponse<T>;

      if (json.result !== "success") {
        throw new Error(`RPC error: ${json.result}`);
      }

      return json.arguments as T;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Transmission RPC call failed: ${message}`);
    }
  }

  async getTorrents(): Promise<RawTorrent[]> {
    // Retry up to 30 times (30 seconds with 1-second delays) for service discovery
    for (let attempt = 1; attempt <= 30; attempt++) {
      try {
        const response = await this.rpc<TorrentGetResponse>("torrent-get", {
          fields: [
            "id",
            "name",
            "percentDone",
            "uploadRatio",
            "addedDate",
            "downloadDir",
            "labels",
            "error",
            "errorString",
            "trackers",
          ],
        });

        const torrents: RawTorrent[] = (response.torrents || []).map((t) => ({
          id: t.id,
          name: t.name,
          percentDone: t.percentDone || 0,
          uploadRatio: t.uploadRatio || 0,
          addedDate: t.addedDate || 0,
          downloadDir: t.downloadDir || "",
          labels: t.labels || [],
          error: t.error || 0,
          errorString: t.errorString || "",
          trackers: (t.trackers || []).map((tr) => ({
            announce: tr.announce || "",
            id: tr.id || 0,
            scrape: tr.scrape || "",
            tier: tr.tier || 0,
          })),
        }));

        if (attempt > 1) {
          this.logger.info(`✓ Connected to Transmission (attempt ${attempt}): ${torrents.length} torrents`);
        } else {
          this.logger.info(`✓ Fetched ${torrents.length} torrent(s)`);
        }
        return torrents;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          message.includes("ENOTFOUND") ||
          message.includes("ECONNREFUSED") ||
          message.includes("Connect timeout") ||
          message.includes("getaddrinfo ENOTFOUND") ||
          message.includes("fetch failed") ||
          message.includes("ECONNRESET")
        ) {
          if (attempt === 1) {
            this.logger.info(`⏳ Connecting to Transmission (${this.url.toString()})...`);
          } else if (attempt < 30) {
            // Silent retry
            await new Promise((r) => setTimeout(r, 1000));
            continue;
          } else if (attempt === 30) {
            this.logger.error(`✗ Connection failed after 30 attempts`);
          }
        }
        if (attempt >= 30) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error("Failed to connect to Transmission after 30 attempts");
  }

  async removeTorrents(ids: number[], deleteLocalData = true): Promise<void> {
    await this.rpc<void>("torrent-remove", {
      ids,
      "delete-local-data": deleteLocalData,
    });
  }
}
