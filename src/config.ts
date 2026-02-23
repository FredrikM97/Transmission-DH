const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type Auth = { readonly username: string; readonly password: string };

export type Config = {
  readonly transmissionUrl: string;
  readonly transmissionAuth: Auth | undefined;
  readonly allowedLabels: readonly string[];
  readonly excludedTrackers: readonly string[];
  readonly maxRatio: number;
  readonly deadRetentionHours: number;
  readonly maxAgeHours: number;
  readonly logLevel: LogLevel;
  readonly dryRun: boolean;
  readonly schedule: string | undefined;
};

export function loadConfig(): Config {
  const e = process.env;
  return Object.freeze({
    transmissionUrl: e.TRANSMISSION_URL!,
    transmissionAuth: e.TRANSMISSION_AUTH ? parseAuth(e.TRANSMISSION_AUTH) : undefined,
    allowedLabels: Object.freeze(e.ALLOWED_LABELS!.split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean)),
    excludedTrackers: Object.freeze(e.EXCLUDED_TRACKERS!.split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean)),
    maxRatio: +e.MAX_RATIO!,
    deadRetentionHours: +e.DEAD_RETENTION_HOURS!,
    maxAgeHours: +e.MAX_AGE_HOURS!,
    logLevel: e.LOG_LEVEL as LogLevel,
    dryRun: e.DRY_RUN === "true" || e.DRY_RUN === "1",
    schedule: e.SCHEDULE || undefined,
  });
}

function parseAuth(value: string): Auth {
  const colonIndex = value.indexOf(":");
  if (colonIndex === -1) throw new Error("TRANSMISSION_AUTH must be in format: username:password");
  return { username: value.substring(0, colonIndex), password: value.substring(colonIndex + 1) };
}
