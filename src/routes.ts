import type {
  IAgentRuntime,
  PluginAppBridgeLaunchContext,
  PluginAppBridgeRunContext,
  PluginAppLaunchDiagnostic,
  PluginAppSessionState,
} from "@elizaos/core";

import { RatibotReportFeed } from "./services/ratibot-feed.js";
import { RatibotEcosystem } from "./services/ratibot-ecosystem.js";
import type { EcosystemPayload, ReportIndexEntry } from "./types.js";
import { renderViewerHtml, VIEWER_FRAME_ANCESTORS_DIRECTIVE } from "./viewer.js";

const APP_NAME = "@cenetex/plugin-ratibot-research";
const APP_DISPLAY_NAME = "Ratibot Research";
const APP_ROUTE_PREFIX = "/api/apps/ratibot-research";
const VIEWER_PATH = `${APP_ROUTE_PREFIX}/viewer`;
const DEFAULT_CDN_BASE = "https://d1bn9lkpdxaeev.cloudfront.net";
const FETCH_TIMEOUT_MS = 10_000;

export interface RouteContext {
  method: string;
  pathname: string;
  url?: URL;
  runtime: unknown | null;
  res: unknown;
  error: (response: unknown, message: string, status?: number) => void;
  json: (response: unknown, data: unknown, status?: number) => void;
  readJsonBody: () => Promise<unknown>;
}

function getRuntime(value: unknown): IAgentRuntime | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { getService?: unknown };
  if (typeof candidate.getService !== "function") return null;
  return candidate as unknown as IAgentRuntime;
}

function getCdnBase(runtime: IAgentRuntime | null): string {
  const fromSetting =
    typeof runtime?.getSetting === "function"
      ? runtime.getSetting("RATIBOT_API_BASE")
      : undefined;
  const v =
    typeof fromSetting === "string" && fromSetting.length > 0
      ? fromSetting
      : DEFAULT_CDN_BASE;
  return v.replace(/\/$/, "");
}

function getCharacterName(runtime: IAgentRuntime | null): string {
  const character = (runtime as { character?: { name?: string } } | null)?.character;
  return character?.name ?? "Eliza Agent";
}

function getSessionId(runtime: IAgentRuntime | null): string {
  const agentId = (runtime as { agentId?: string } | null)?.agentId;
  return agentId ? `ratibot-research:${agentId}` : "ratibot-research:anonymous";
}

function tryGetEcosystem(runtime: IAgentRuntime | null): RatibotEcosystem | null {
  if (!runtime) return null;
  try {
    return (
      runtime.getService<RatibotEcosystem>(RatibotEcosystem.serviceType) ?? null
    );
  } catch {
    return null;
  }
}

function tryGetFeed(runtime: IAgentRuntime | null): RatibotReportFeed | null {
  if (!runtime) return null;
  try {
    return (
      runtime.getService<RatibotReportFeed>(RatibotReportFeed.serviceType) ?? null
    );
  } catch {
    return null;
  }
}

async function fetchJsonUpstream<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      throw new Error(`${url}: not JSON (got ${ct || "no content-type"})`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

interface ReportsCountByType {
  spotlight: number;
  weekly: number;
  daily: number;
  trade: number;
}

function countByType(reports: ReportIndexEntry[]): ReportsCountByType {
  const counts: ReportsCountByType = { spotlight: 0, weekly: 0, daily: 0, trade: 0 };
  for (const r of reports) {
    if (r.type in counts) counts[r.type as keyof ReportsCountByType] += 1;
  }
  return counts;
}

function buildSessionState(args: {
  runtime: IAgentRuntime | null;
  reports: ReportIndexEntry[] | null;
  ecosystem: EcosystemPayload | null;
  status: "running" | "degraded";
  summary: string;
}): PluginAppSessionState {
  const { runtime, reports, ecosystem, status, summary } = args;
  const counts = countByType(reports ?? []);
  const latest = reports?.[0];

  const telemetry: Record<string, unknown> = {
    cdnBase: getCdnBase(runtime),
    reportCount: reports?.length ?? 0,
    countsByType: { ...counts },
  };
  if (latest) {
    telemetry.latestReport = {
      type: latest.type,
      title: latest.title,
      url: latest.url,
      date: latest.date,
      generated_at: latest.generated_at,
    };
  }
  if (ecosystem) {
    telemetry.homeToken = ecosystem.home_token;
    telemetry.homeHolders = ecosystem.home_holders;
    telemetry.tokenCount = ecosystem.tokens.length;
    telemetry.topTokens = ecosystem.tokens.slice(0, 5).map((t) => ({
      rank: t.rank,
      symbol: t.symbol,
      price_usd: t.price_usd,
      flow_direction: t.flow_direction,
    }));
  }

  return {
    sessionId: getSessionId(runtime),
    appName: APP_NAME,
    mode: "viewer",
    status,
    displayName: APP_DISPLAY_NAME,
    agentId: (runtime as { agentId?: string } | null)?.agentId,
    canSendCommands: true,
    summary,
    suggestedPrompts: [
      "Show me the latest weekly report.",
      "Find a spotlight for a Solana mint.",
      "Refresh the ecosystem rankings.",
    ],
    telemetry: telemetry as PluginAppSessionState["telemetry"],
  };
}

function sendHtmlResponse(res: unknown, html: string): void {
  const response = res as {
    end: (body?: string) => void;
    setHeader: (name: string, value: string) => void;
    statusCode: number;
    removeHeader?: (name: string) => void;
    getHeader?: (name: string) => number | string | string[] | undefined;
  };
  response.statusCode = 200;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.removeHeader?.("X-Frame-Options");
  const existingCsp = response.getHeader?.("Content-Security-Policy");
  const normalized =
    typeof existingCsp === "string"
      ? existingCsp.trim()
      : Array.isArray(existingCsp)
        ? existingCsp.join("; ").trim()
        : "";
  const nextCsp = /\bframe-ancestors\b/i.test(normalized)
    ? normalized
    : normalized.length > 0
      ? `${normalized}; ${VIEWER_FRAME_ANCESTORS_DIRECTIVE}`
      : VIEWER_FRAME_ANCESTORS_DIRECTIVE;
  response.setHeader("Content-Security-Policy", nextCsp);
  response.end(html);
}

function parseSessionId(pathname: string): string | null {
  const m = pathname.match(/^\/api\/apps\/ratibot-research\/session\/([^/]+)(?:\/.*)?$/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function parseSessionSubroute(pathname: string): "command" | null {
  return pathname.endsWith("/command") ? "command" : null;
}

async function loadSessionData(
  runtime: IAgentRuntime | null,
): Promise<{
  reports: ReportIndexEntry[] | null;
  ecosystem: EcosystemPayload | null;
  status: "running" | "degraded";
  summary: string;
}> {
  const cdnBase = getCdnBase(runtime);
  const ecoService = tryGetEcosystem(runtime);

  const reportsP = fetchJsonUpstream<{ reports?: ReportIndexEntry[] }>(
    `${cdnBase}/reports/index.json`,
  )
    .then((p) => (Array.isArray(p.reports) ? p.reports : []))
    .catch(() => null);

  const ecoP = ecoService
    ? ecoService.getEcosystem().catch(() => null)
    : fetchJsonUpstream<EcosystemPayload>(`${cdnBase}/cache/ecosystem.json`).catch(
        () => null,
      );

  const [reports, ecosystem] = await Promise.all([reportsP, ecoP]);

  if (!reports && !ecosystem) {
    return {
      reports: null,
      ecosystem: null,
      status: "degraded",
      summary: "Ratibot CDN unreachable. Check RATIBOT_API_BASE.",
    };
  }

  const counts = countByType(reports ?? []);
  const summaryParts = [
    `${reports?.length ?? 0} reports`,
    ecosystem
      ? `${ecosystem.tokens.length} tokens · ${ecosystem.home_holders} $RATI holders`
      : "ecosystem: unavailable",
  ];
  if (counts.spotlight) summaryParts.push(`${counts.spotlight} spotlights`);

  return {
    reports,
    ecosystem,
    status: "running",
    summary: summaryParts.join(" · "),
  };
}

export async function resolveLaunchSession(
  ctx: PluginAppBridgeLaunchContext,
): Promise<PluginAppSessionState | null> {
  const runtime = getRuntime(ctx.runtime);
  const { reports, ecosystem, status, summary } = await loadSessionData(runtime);
  return buildSessionState({ runtime, reports, ecosystem, status, summary });
}

export async function refreshRunSession(
  ctx: PluginAppBridgeRunContext,
): Promise<PluginAppSessionState | null> {
  return resolveLaunchSession(ctx);
}

export async function collectLaunchDiagnostics(
  ctx: PluginAppBridgeRunContext,
): Promise<PluginAppLaunchDiagnostic[]> {
  const diagnostics: PluginAppLaunchDiagnostic[] = [];
  if (ctx.session?.status === "degraded") {
    diagnostics.push({
      code: "ratibot-cdn-unreachable",
      severity: "warning",
      message:
        ctx.session.summary ??
        "Couldn't reach ratibot CDN. Reports and ecosystem data will be empty.",
    });
  }
  return diagnostics;
}

export async function handleAppRoutes(ctx: RouteContext): Promise<boolean> {
  const runtime = getRuntime(ctx.runtime);
  const cdnBase = getCdnBase(runtime);

  // Viewer
  if (ctx.method === "GET" && ctx.pathname === VIEWER_PATH) {
    sendHtmlResponse(
      ctx.res,
      renderViewerHtml({
        agentName: getCharacterName(runtime),
        sessionId: getSessionId(runtime),
        apiBase: APP_ROUTE_PREFIX,
        cdnBase,
      }),
    );
    return true;
  }

  // Reports proxy
  if (ctx.method === "GET" && ctx.pathname === `${APP_ROUTE_PREFIX}/reports`) {
    try {
      const body = await fetchJsonUpstream<unknown>(`${cdnBase}/reports/index.json`);
      ctx.json(ctx.res, body);
    } catch (err) {
      ctx.error(
        ctx.res,
        err instanceof Error ? err.message : "reports fetch failed",
        502,
      );
    }
    return true;
  }

  // Ecosystem proxy (prefer cached service if available)
  if (ctx.method === "GET" && ctx.pathname === `${APP_ROUTE_PREFIX}/ecosystem`) {
    try {
      const ecoService = tryGetEcosystem(runtime);
      const body = ecoService
        ? await ecoService.getEcosystem()
        : await fetchJsonUpstream<unknown>(`${cdnBase}/cache/ecosystem.json`);
      ctx.json(ctx.res, body);
    } catch (err) {
      ctx.error(
        ctx.res,
        err instanceof Error ? err.message : "ecosystem fetch failed",
        502,
      );
    }
    return true;
  }

  // Spotlight lookup by mint
  const spotlightMatch = ctx.pathname.match(
    /^\/api\/apps\/ratibot-research\/spotlight\/([^/]+)$/,
  );
  if (ctx.method === "GET" && spotlightMatch) {
    const mint = decodeURIComponent(spotlightMatch[1]!);
    try {
      const [ecosystem, reportsPayload] = await Promise.all([
        fetchJsonUpstream<{ tokens?: Array<{ address?: string; symbol?: string }> }>(
          `${cdnBase}/cache/ecosystem.json`,
        ),
        fetchJsonUpstream<{ reports?: ReportIndexEntry[] }>(
          `${cdnBase}/reports/index.json`,
        ),
      ]);
      const symbol = ecosystem.tokens?.find((t) => t.address === mint)?.symbol?.trim();
      if (!symbol) {
        ctx.json(ctx.res, { found: false, reason: "mint not in ratibot ecosystem" }, 404);
        return true;
      }
      const symbolLower = symbol.toLowerCase();
      const entry = (reportsPayload.reports ?? []).find(
        (r) => r.type === "spotlight" && r.url.toLowerCase().endsWith(`-${symbolLower}.pdf`),
      );
      if (!entry) {
        ctx.json(
          ctx.res,
          { found: false, reason: "no spotlight published for this token yet", symbol },
          404,
        );
        return true;
      }
      ctx.json(ctx.res, { found: true, symbol, report: { ...entry }, href: `${cdnBase}${entry.url}` });
    } catch (err) {
      ctx.error(
        ctx.res,
        err instanceof Error ? err.message : "spotlight lookup failed",
        502,
      );
    }
    return true;
  }

  // Session routes
  const sessionId = parseSessionId(ctx.pathname);
  if (!sessionId) return false;
  const subroute = parseSessionSubroute(ctx.pathname);

  if (ctx.method === "GET" && !subroute) {
    const { reports, ecosystem, status, summary } = await loadSessionData(runtime);
    ctx.json(ctx.res, buildSessionState({ runtime, reports, ecosystem, status, summary }));
    return true;
  }

  if (ctx.method === "POST" && subroute === "command") {
    const body = (await ctx.readJsonBody().catch(() => ({}))) as
      | { type?: string; mint?: string; prompt?: string }
      | null;

    if (body?.type === "refresh") {
      const ecoService = tryGetEcosystem(runtime);
      if (ecoService) await ecoService.refresh().catch(() => undefined);
      const feed = tryGetFeed(runtime);
      if (feed) await feed.poll().catch(() => undefined);
      const data = await loadSessionData(runtime);
      ctx.json(ctx.res, {
        success: true,
        message: "Refreshed.",
        session: buildSessionState({ runtime, ...data }),
      });
      return true;
    }

    const data = await loadSessionData(runtime);
    ctx.json(ctx.res, {
      success: true,
      message: `Suggestion noted: ${body?.prompt ?? body?.type ?? "unknown"}`,
      session: buildSessionState({ runtime, ...data }),
    });
    return true;
  }

  return false;
}
