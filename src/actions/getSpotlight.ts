/**
 * GET_SPOTLIGHT — fetch an existing spotlight report from ratibot's CDN.
 *
 * Lookup chain:
 *   1. Resolve the mint to a symbol via `${apiBase}/cache/ecosystem.json`.
 *   2. Scan `${apiBase}/reports/index.json` for the most recent spotlight
 *      entry whose URL matches `-{symbol}.pdf`.
 */

import type {
  Action,
  ActionResult,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "@elizaos/core";

import type { ReportIndexEntry } from "../types.js";

const MINT_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/;

const DEFAULT_API_BASE = "https://d1bn9lkpdxaeev.cloudfront.net";

const FETCH_TIMEOUT_MS = 10_000;

interface EcosystemPayload {
  tokens?: Array<{ address?: string; symbol?: string; name?: string }>;
}

interface ReportIndexPayload {
  reports?: ReportIndexEntry[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    // ratibot's CDN serves the dashboard HTML as a SPA fallback for missing
    // keys (CloudFront `Error from cloudfront` -> index.html), so a 200 with
    // text/html means the underlying JSON has not been published yet.
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      throw new Error(`${url}: not published yet (got ${ct || "no content-type"})`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchReportIndex(
  apiBase: string,
): Promise<ReportIndexEntry[]> {
  const payload = await fetchJson<ReportIndexPayload>(
    `${apiBase}/reports/index.json`,
  );
  return Array.isArray(payload.reports) ? payload.reports : [];
}

async function resolveMintToSymbol(
  mint: string,
  apiBase: string,
): Promise<string | null> {
  const payload = await fetchJson<EcosystemPayload>(
    `${apiBase}/cache/ecosystem.json`,
  );
  const tokens = Array.isArray(payload.tokens) ? payload.tokens : [];
  const match = tokens.find((t) => t.address === mint);
  return match?.symbol?.trim() || null;
}

async function findSpotlightForMint(
  mint: string,
  apiBase: string,
): Promise<ReportIndexEntry | null> {
  const symbol = await resolveMintToSymbol(mint, apiBase);
  if (!symbol) return null;

  // ratibot publishes spotlights at /reports/spotlight/{date}-{symbol}.pdf
  // (see ratibot/reporting/agent_dispatch.py:178). Index is newest-first.
  const symbolLower = symbol.toLowerCase();
  const reports = await fetchReportIndex(apiBase);
  return (
    reports.find(
      (r) =>
        r.type === "spotlight" &&
        typeof r.url === "string" &&
        r.url.toLowerCase().endsWith(`-${symbolLower}.pdf`),
    ) || null
  );
}

export const getSpotlightAction: Action = {
  name: "GET_SPOTLIGHT",
  similes: [
    "TOKEN_SPOTLIGHT",
    "TOKEN_RESEARCH_REPORT",
    "GET_TOKEN_REPORT",
    "FETCH_SPOTLIGHT",
  ],
  description:
    "Return the PDF URL of ratibot's published spotlight report for a Solana token mint, if one has been published.",

  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    return (message.content.text ?? "").match(MINT_REGEX) !== null;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: unknown,
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const text = message.content.text ?? "";
    const match = text.match(MINT_REGEX);
    if (!match) {
      return { success: false, error: "no mint in message" };
    }
    const mint = match[0];

    const apiBaseSetting = runtime.getSetting("RATIBOT_API_BASE");
    const apiBase =
      typeof apiBaseSetting === "string" && apiBaseSetting
        ? apiBaseSetting
        : DEFAULT_API_BASE;

    try {
      const existing = await findSpotlightForMint(mint, apiBase);
      if (existing) {
        const text = `Spotlight available: ${existing.title}\n${apiBase}${existing.url}`;
        callback?.({ text, action: "GET_SPOTLIGHT", data: existing });
        return { success: true, text, data: { ...existing } };
      }

      const text = `No spotlight published for ${mint.slice(0, 8)}... yet.`;
      callback?.({ text, action: "GET_SPOTLIGHT" });
      return { success: false, text };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const text = `Spotlight lookup failed for ${mint.slice(0, 8)}...: ${errMsg}`;
      callback?.({ text, action: "GET_SPOTLIGHT" });
      return { success: false, text, error: errMsg };
    }
  },

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "What do you know about BnszRWbs..." },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Spotlight available: Token Spotlight: LLM",
          action: "GET_SPOTLIGHT",
        },
      },
    ],
  ],
};
