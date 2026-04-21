import { afterEach, describe, expect, it, vi } from "vitest";

import { handleAppRoutes, type RouteContext } from "../routes.js";
import { RatibotEcosystem } from "../services/ratibot-ecosystem.js";
import { RatibotReportFeed } from "../services/ratibot-feed.js";
import type { EcosystemPayload, ReportIndexEntry } from "../types.js";

const REPORTS: ReportIndexEntry[] = [
  {
    date: "2026-04-19",
    type: "weekly",
    title: "Weekly Report — 2026-04-19",
    url: "/reports/weekly/2026-04-19.pdf",
    size_bytes: 389_389,
    generated_at: "2026-04-19T23:18:12Z",
  },
  {
    date: "2026-04-15",
    type: "spotlight",
    title: "Token Spotlight: USDC",
    url: "/reports/spotlight/2026-04-15-usdc.pdf",
    size_bytes: 120_000,
    generated_at: "2026-04-15T10:00:00Z",
  },
];

const ECOSYSTEM: EcosystemPayload = {
  home_tokens: ["RATI"],
  home_token: "RATI-MINT",
  home_holders: 700,
  scanned_at: "2026-04-20T00:00:00Z",
  cached_at: "2026-04-20T01:00:00Z",
  tokens: [
    {
      address: "USDC-ADDR",
      symbol: "USDC",
      name: "USD Coin",
      overlap_percent: 10,
      overlap_holders: 4,
      price_usd: 1,
      liquidity_usd: 500_000_000,
      flow_direction: "accumulating",
      flow_score: 0.5,
      rank: 1,
    },
    {
      address: "PENGU-ADDR",
      symbol: "PENGU",
      name: "Pudgy Penguins",
      overlap_percent: 7.5,
      overlap_holders: 3,
      price_usd: 0.0075,
      liquidity_usd: 2_454_524,
      flow_direction: "new",
      flow_score: 0.5,
      rank: 2,
    },
  ],
};

function mkRes() {
  const headers: Record<string, string> = {};
  const removed: string[] = [];
  let body: string | undefined;
  let statusCode = 0;
  return {
    res: {
      get statusCode() { return statusCode; },
      set statusCode(v: number) { statusCode = v; },
      setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; },
      getHeader(name: string) { return headers[name.toLowerCase()]; },
      removeHeader(name: string) {
        removed.push(name.toLowerCase());
        delete headers[name.toLowerCase()];
      },
      end(b?: string) { body = b; },
    },
    headers,
    removed,
    get body() { return body; },
    get status() { return statusCode; },
  };
}

function mkCtx(method: string, pathname: string, runtime: unknown, res: any, bodyJson?: unknown): RouteContext {
  return {
    method,
    pathname,
    url: new URL(`http://localhost${pathname}`),
    runtime,
    res,
    error: vi.fn((r: any, message: string, status?: number) => {
      r.statusCode = status ?? 500;
      r.end(JSON.stringify({ error: message }));
    }),
    json: vi.fn((r: any, data: unknown, status?: number) => {
      r.statusCode = status ?? 200;
      r.setHeader("Content-Type", "application/json");
      r.end(JSON.stringify(data));
    }),
    readJsonBody: vi.fn(async () => bodyJson ?? {}),
  };
}

interface FetchMockOpts {
  reports?: ReportIndexEntry[] | "throw";
  ecosystem?: EcosystemPayload | "throw";
}

function mockGlobalFetch(opts: FetchMockOpts) {
  const fetchImpl = vi.fn(async (input: any) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.endsWith("/reports/index.json")) {
      if (opts.reports === "throw") throw new Error("reports network down");
      return new Response(JSON.stringify({ reports: opts.reports ?? REPORTS }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/cache/ecosystem.json")) {
      if (opts.ecosystem === "throw") throw new Error("ecosystem network down");
      return new Response(JSON.stringify(opts.ecosystem ?? ECOSYSTEM), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchImpl);
  return fetchImpl;
}

function mkRuntime(opts: { withEcosystemService?: boolean } = {}) {
  let ecoService: RatibotEcosystem | null = null;
  if (opts.withEcosystemService) {
    ecoService = new RatibotEcosystem(undefined, {
      apiBase: "https://cdn.test",
      fetch: (async () =>
        new Response(JSON.stringify(ECOSYSTEM), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as any,
    });
  }
  return {
    agentId: "agent-007",
    character: { name: "Kyro" },
    getSetting: (k: string) => (k === "RATIBOT_API_BASE" ? "https://cdn.test" : undefined),
    getService: <T>(type: string) => {
      if (type === RatibotEcosystem.serviceType) return ecoService as unknown as T;
      if (type === RatibotReportFeed.serviceType) return null as unknown as T;
      return null as unknown as T;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("handleAppRoutes — viewer", () => {
  it("serves HTML with frame-ancestors CSP and removes X-Frame-Options", async () => {
    const r = mkRes();
    r.res.setHeader("X-Frame-Options", "DENY");
    const ctx = mkCtx("GET", "/api/apps/ratibot-research/viewer", mkRuntime(), r.res);
    expect(await handleAppRoutes(ctx)).toBe(true);
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(r.headers["content-security-policy"]).toMatch(/frame-ancestors/);
    expect(r.removed).toContain("x-frame-options");
    expect(r.body).toContain("Ratibot Research");
    expect(r.body).toContain("Kyro");
  });

  it("returns false on unknown paths", async () => {
    const r = mkRes();
    const ctx = mkCtx("GET", "/api/apps/ratibot-research/wat", mkRuntime(), r.res);
    expect(await handleAppRoutes(ctx)).toBe(false);
  });
});

describe("handleAppRoutes — proxies", () => {
  it("GET /reports proxies the CDN", async () => {
    mockGlobalFetch({});
    const r = mkRes();
    const ctx = mkCtx("GET", "/api/apps/ratibot-research/reports", mkRuntime(), r.res);
    await handleAppRoutes(ctx);
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body!);
    expect(body.reports).toHaveLength(REPORTS.length);
  });

  it("GET /reports returns 502 on upstream failure", async () => {
    mockGlobalFetch({ reports: "throw" });
    const r = mkRes();
    const ctx = mkCtx("GET", "/api/apps/ratibot-research/reports", mkRuntime(), r.res);
    await handleAppRoutes(ctx);
    expect(r.status).toBe(502);
  });

  it("GET /ecosystem prefers cached service when registered", async () => {
    const fetchImpl = mockGlobalFetch({ ecosystem: "throw" });
    const r = mkRes();
    const ctx = mkCtx("GET", "/api/apps/ratibot-research/ecosystem", mkRuntime({ withEcosystemService: true }), r.res);
    await handleAppRoutes(ctx);
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body!);
    expect(body.tokens[0].symbol).toBe("USDC");
    // global fetch should NOT have been called for ecosystem — service has its own fetch
    const fetchUrls = fetchImpl.mock.calls.map((c: any[]) => c[0]);
    expect(fetchUrls.every((u: string) => !u.includes("ecosystem.json"))).toBe(true);
  });
});

describe("handleAppRoutes — spotlight by mint", () => {
  it("returns the matching spotlight entry", async () => {
    mockGlobalFetch({});
    const r = mkRes();
    const ctx = mkCtx("GET", "/api/apps/ratibot-research/spotlight/USDC-ADDR", mkRuntime(), r.res);
    await handleAppRoutes(ctx);
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body!);
    expect(body.found).toBe(true);
    expect(body.symbol).toBe("USDC");
    expect(body.href).toBe("https://cdn.test/reports/spotlight/2026-04-15-usdc.pdf");
  });

  it("404 when mint isn't in the ecosystem", async () => {
    mockGlobalFetch({});
    const r = mkRes();
    const ctx = mkCtx("GET", "/api/apps/ratibot-research/spotlight/UNKNOWN", mkRuntime(), r.res);
    await handleAppRoutes(ctx);
    expect(r.status).toBe(404);
    const body = JSON.parse(r.body!);
    expect(body.found).toBe(false);
  });

  it("404 when the symbol resolves but no spotlight exists", async () => {
    mockGlobalFetch({});
    const r = mkRes();
    const ctx = mkCtx("GET", "/api/apps/ratibot-research/spotlight/PENGU-ADDR", mkRuntime(), r.res);
    await handleAppRoutes(ctx);
    expect(r.status).toBe(404);
    expect(JSON.parse(r.body!).symbol).toBe("PENGU");
  });
});

describe("handleAppRoutes — session", () => {
  it("GET /session/:id returns a running viewer state with telemetry", async () => {
    mockGlobalFetch({});
    const r = mkRes();
    const ctx = mkCtx("GET", "/api/apps/ratibot-research/session/abc", mkRuntime(), r.res);
    await handleAppRoutes(ctx);
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body!);
    expect(body.appName).toBe("@cenetex/plugin-ratibot-research");
    expect(body.mode).toBe("viewer");
    expect(body.status).toBe("running");
    expect(body.telemetry.reportCount).toBe(REPORTS.length);
    expect(body.telemetry.tokenCount).toBe(ECOSYSTEM.tokens.length);
    expect(body.telemetry.homeToken).toBe(ECOSYSTEM.home_token);
    expect(body.telemetry.topTokens).toHaveLength(2);
  });

  it("GET /session/:id returns degraded when both upstreams fail", async () => {
    mockGlobalFetch({ reports: "throw", ecosystem: "throw" });
    const r = mkRes();
    const ctx = mkCtx("GET", "/api/apps/ratibot-research/session/abc", mkRuntime(), r.res);
    await handleAppRoutes(ctx);
    const body = JSON.parse(r.body!);
    expect(body.status).toBe("degraded");
  });

  it("POST /session/:id/command echoes a suggestion and returns refreshed state", async () => {
    mockGlobalFetch({});
    const r = mkRes();
    const ctx = mkCtx(
      "POST",
      "/api/apps/ratibot-research/session/abc/command",
      mkRuntime(),
      r.res,
      { type: "suggestion", prompt: "Show latest weekly" },
    );
    await handleAppRoutes(ctx);
    const body = JSON.parse(r.body!);
    expect(body.success).toBe(true);
    expect(body.message).toContain("Show latest weekly");
    expect(body.session.status).toBe("running");
  });
});
