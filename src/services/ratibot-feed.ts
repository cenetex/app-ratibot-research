/**
 * RatibotReportFeed — subscribe to new entries in ratibot's published
 * report index. Polls `/reports/index.json` on an interval and emits
 * each never-before-seen entry to registered listeners.
 *
 * First poll establishes a baseline (existing reports are not replayed);
 * only reports that appear on subsequent polls are emitted. Dedup key
 * is the report `url`.
 */

import { Service, type IAgentRuntime } from "@elizaos/core";

import type { ReportIndexEntry } from "../types.js";

export interface ReportFeedConfig {
  apiBase?: string;
  pollIntervalMs?: number;
  types?: ReportIndexEntry["type"][];
  fetch?: typeof fetch;
}

type Listener = (entry: ReportIndexEntry) => void;

const DEFAULT_API_BASE = "https://d1bn9lkpdxaeev.cloudfront.net";
const DEFAULT_POLL_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

export class RatibotReportFeed extends Service {
  static serviceType = "ratibot-report-feed";
  capabilityDescription =
    "Subscribe to new ratibot research reports as they are published.";

  private apiBase: string;
  private pollIntervalMs: number;
  private types: Set<ReportIndexEntry["type"]> | null;
  private fetchImpl: typeof fetch;
  private listeners = new Set<Listener>();
  private seen = new Set<string>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;
  private baselineEstablished = false;

  constructor(runtime?: IAgentRuntime, config?: ReportFeedConfig) {
    super(runtime);
    const resolved = resolveConfig(runtime, config);
    this.apiBase = resolved.apiBase;
    this.pollIntervalMs = resolved.pollIntervalMs;
    this.types = resolved.types;
    this.fetchImpl = resolved.fetch;
  }

  static async start(runtime: IAgentRuntime): Promise<RatibotReportFeed> {
    const feed = new RatibotReportFeed(runtime);
    await feed.poll().catch(() => {
      // baseline failure is non-fatal — subsequent polls will retry
    });
    feed.timer = setInterval(() => {
      feed.poll().catch(() => {
        // transient CDN failures shouldn't break the loop
      });
    }, feed.pollIntervalMs);
    return feed;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.listeners.clear();
  }

  onReport(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async poll(): Promise<void> {
    if (this.stopped) return;
    const entries = await this.fetchIndex();
    const filtered = this.types
      ? entries.filter((e) => this.types!.has(e.type))
      : entries;

    if (!this.baselineEstablished) {
      for (const e of filtered) this.seen.add(e.url);
      this.baselineEstablished = true;
      return;
    }

    // Emit oldest-first so listeners receive events in publication order.
    const fresh = filtered.filter((e) => !this.seen.has(e.url)).reverse();
    for (const e of fresh) {
      this.seen.add(e.url);
      for (const listener of this.listeners) listener(e);
    }
  }

  private async fetchIndex(): Promise<ReportIndexEntry[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(`${this.apiBase}/reports/index.json`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return [];
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) return [];
      const payload = (await res.json()) as { reports?: ReportIndexEntry[] };
      return Array.isArray(payload.reports) ? payload.reports : [];
    } finally {
      clearTimeout(timeout);
    }
  }
}

function resolveConfig(
  runtime: IAgentRuntime | undefined,
  override: ReportFeedConfig | undefined,
): {
  apiBase: string;
  pollIntervalMs: number;
  types: Set<ReportIndexEntry["type"]> | null;
  fetch: typeof fetch;
} {
  const getString = (key: string): string | undefined => {
    const v = runtime?.getSetting?.(key);
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };

  const apiBase = (
    override?.apiBase ??
    getString("RATIBOT_API_BASE") ??
    DEFAULT_API_BASE
  ).replace(/\/$/, "");

  const intervalRaw =
    override?.pollIntervalMs ?? getString("RATIBOT_POLL_INTERVAL_MS");
  const pollIntervalMs =
    typeof intervalRaw === "number"
      ? intervalRaw
      : intervalRaw
        ? Math.max(5_000, Number(intervalRaw))
        : DEFAULT_POLL_MS;

  const typesRaw =
    override?.types ??
    getString("RATIBOT_SUBSCRIPTION_TYPES")?.split(",").map((s) => s.trim()) ??
    null;
  const types = typesRaw?.length
    ? (new Set(typesRaw) as Set<ReportIndexEntry["type"]>)
    : null;

  return {
    apiBase,
    pollIntervalMs,
    types,
    fetch: override?.fetch ?? globalThis.fetch.bind(globalThis),
  };
}
