/**
 * RatibotEcosystem — caches ratibot's `/cache/ecosystem.json` and exposes
 * the parsed payload via `getEcosystem()`. Refreshes lazily (TTL) and on
 * demand via `refresh()`. Read-only against the public CDN.
 */

import { Service, type IAgentRuntime } from "@elizaos/core";

import type { EcosystemPayload } from "../types.js";

export interface EcosystemServiceConfig {
  apiBase?: string;
  ttlMs?: number;
  fetch?: typeof fetch;
}

const DEFAULT_API_BASE = "https://d1bn9lkpdxaeev.cloudfront.net";
const DEFAULT_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

export class RatibotEcosystem extends Service {
  static serviceType = "ratibot-ecosystem";
  capabilityDescription =
    "Cached snapshot of ratibot's $RATI ecosystem rankings (price, liquidity, flow direction).";

  private apiBase: string;
  private ttlMs: number;
  private fetchImpl: typeof fetch;
  private cache: { payload: EcosystemPayload; fetchedAt: number } | null = null;
  private inflight: Promise<EcosystemPayload> | null = null;

  constructor(runtime?: IAgentRuntime, config?: EcosystemServiceConfig) {
    super(runtime);
    const resolved = resolveConfig(runtime, config);
    this.apiBase = resolved.apiBase;
    this.ttlMs = resolved.ttlMs;
    this.fetchImpl = resolved.fetch;
  }

  static async start(runtime: IAgentRuntime): Promise<RatibotEcosystem> {
    const svc = new RatibotEcosystem(runtime);
    // best-effort prime; failures are non-fatal — getEcosystem() will retry
    await svc.refresh().catch(() => undefined);
    return svc;
  }

  async stop(): Promise<void> {
    this.cache = null;
    this.inflight = null;
  }

  async getEcosystem(): Promise<EcosystemPayload> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAt < this.ttlMs) {
      return this.cache.payload;
    }
    return this.refresh();
  }

  /** Snapshot of the last successful fetch, or null if none. */
  peek(): { payload: EcosystemPayload; fetchedAt: number } | null {
    return this.cache;
  }

  async refresh(): Promise<EcosystemPayload> {
    if (this.inflight) return this.inflight;
    this.inflight = this.fetchEcosystem()
      .then((payload) => {
        this.cache = { payload, fetchedAt: Date.now() };
        return payload;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private async fetchEcosystem(): Promise<EcosystemPayload> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(`${this.apiBase}/cache/ecosystem.json`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${this.apiBase}/cache/ecosystem.json`);
      }
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error(`ecosystem.json not published yet (got ${ct || "no content-type"})`);
      }
      const payload = (await res.json()) as Partial<EcosystemPayload>;
      return {
        home_tokens: Array.isArray(payload.home_tokens) ? payload.home_tokens : [],
        home_token: payload.home_token ?? "",
        home_holders: typeof payload.home_holders === "number" ? payload.home_holders : 0,
        scanned_at: payload.scanned_at ?? "",
        cached_at: payload.cached_at ?? "",
        tokens: Array.isArray(payload.tokens) ? payload.tokens : [],
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function resolveConfig(
  runtime: IAgentRuntime | undefined,
  override: EcosystemServiceConfig | undefined,
): { apiBase: string; ttlMs: number; fetch: typeof fetch } {
  const getString = (key: string): string | undefined => {
    const v = runtime?.getSetting?.(key);
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };
  const apiBase = (
    override?.apiBase ??
    getString("RATIBOT_API_BASE") ??
    DEFAULT_API_BASE
  ).replace(/\/$/, "");
  const ttlRaw = override?.ttlMs ?? getString("RATIBOT_ECOSYSTEM_TTL_MS");
  const ttlMs =
    typeof ttlRaw === "number"
      ? ttlRaw
      : ttlRaw
        ? Math.max(5_000, Number(ttlRaw))
        : DEFAULT_TTL_MS;
  return {
    apiBase,
    ttlMs,
    fetch: override?.fetch ?? globalThis.fetch.bind(globalThis),
  };
}
