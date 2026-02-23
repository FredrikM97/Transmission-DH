export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export type Auth = { readonly username: string; readonly password: string };

export type Config = {
  readonly transmissionUrl: URL;
  readonly transmissionAuth: Auth | undefined;
  readonly allowedLabels: readonly string[];
  readonly excludedTrackers: readonly string[];
  readonly maxRatio: number;
  readonly deadRetentionHours: number;
  readonly maxAgeHours: number;
  readonly logLevel: LogLevel;
  readonly logPretty: boolean;
  readonly dryRun: boolean;
  readonly schedule: string | undefined;
};

// Parsers
const parseUrl = (value?: string): URL => {
  try {
    return new URL(value ?? "http://localhost:9091/transmission/rpc");
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }
};

const parseAuth = (value?: string): Auth | undefined => {
  if (!value) return undefined;
  const [username, ...rest] = value.split(":");
  if (!username) throw new Error("Invalid auth: missing username");
  return { username, password: rest.join(":") };
};

const parseList = (value?: string): readonly string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return Object.freeze(parsed.map((s) => String(s).trim().toLowerCase()).filter(Boolean));
    }
  } catch {
    // Not JSON, parse as space/comma-separated
  }
  const sep = value.includes(",") ? "," : " ";
  return Object.freeze(value.split(sep).map((s) => s.trim().toLowerCase()).filter(Boolean));
};

const parseNum = (value?: string, fallback = 0): number => {
  const n = value ? Number(value) : fallback;
  if (isNaN(n) || n <= 0) throw new Error(`Invalid number: ${value}`);
  return n;
};

const parseBool = (value?: string): boolean => {
  if (!value) return false;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(`Invalid boolean: ${value}`);
};

const parseLevel = (value?: string): LogLevel => {
  if (!value) return "info";
  const levels = ["fatal", "error", "warn", "info", "debug", "trace"] as const;
  if (!levels.includes(value as LogLevel)) throw new Error(`Invalid log level: ${value}`);
  return value as LogLevel;
};

export function loadConfig(): Config {
  return Object.freeze({
    transmissionUrl: parseUrl(process.env.TRANSMISSION_URL),
    transmissionAuth: parseAuth(process.env.TRANSMISSION_AUTH),
    allowedLabels: parseList(process.env.ALLOWED_LABELS) || ["radarr", "sonarr"],
    excludedTrackers: parseList(process.env.EXCLUDED_TRACKERS),
    maxRatio: parseNum(process.env.MAX_RATIO, 2.0),
    deadRetentionHours: parseNum(process.env.DEAD_RETENTION_HOURS, 12),
    maxAgeHours: parseNum(process.env.MAX_AGE_HOURS, 120),
    logLevel: parseLevel(process.env.LOG_LEVEL),
    logPretty: parseBool(process.env.LOG_PRETTY),
    dryRun: parseBool(process.env.DRY_RUN),
    schedule: process.env.SCHEDULE,
  });
}
