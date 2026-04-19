import { afterEach, describe, expect, it, vi } from "vitest";

import { getSpotlightAction } from "../actions/getSpotlight.js";
import type { ReportIndexEntry } from "../types.js";

type AnyRuntime = Parameters<typeof getSpotlightAction.handler>[0];

function mkRuntime(base = "https://cdn.test"): AnyRuntime {
  return {
    getSetting: (k: string) => (k === "RATIBOT_API_BASE" ? base : null),
    getService: () => null,
  } as unknown as AnyRuntime;
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const MINT = "BnszRWbsXQPmcgN8qHa9g1XVTRRbW2wC8qR9qHNk9Kf5";

const ECOSYSTEM = {
  tokens: [
    { address: MINT, symbol: "LLM", name: "Large Language Model" },
    { address: "other-mint", symbol: "OTHER" },
  ],
};

function spotlight(url: string): ReportIndexEntry {
  return {
    date: "2026-04-19",
    type: "spotlight",
    title: "Token Spotlight: LLM",
    url,
    size_bytes: 12345,
    generated_at: "2026-04-19T00:00:00Z",
  };
}

const msg = { content: { text: `What about ${MINT}?` } } as Parameters<
  typeof getSpotlightAction.handler
>[1];

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("GET_SPOTLIGHT", () => {
  it("validate() passes when the message contains a mint", async () => {
    const runtime = mkRuntime();
    const ok = await getSpotlightAction.validate(runtime, msg);
    expect(ok).toBe(true);
  });

  it("validate() fails when no mint is present", async () => {
    const runtime = mkRuntime();
    const empty = { content: { text: "hello" } } as typeof msg;
    const ok = await getSpotlightAction.validate(runtime, empty);
    expect(ok).toBe(false);
  });

  it("returns the matching spotlight URL when one is published", async () => {
    const mockFetch = vi.fn((url: string) => {
      if (url.endsWith("/cache/ecosystem.json"))
        return Promise.resolve(okJson(ECOSYSTEM));
      if (url.endsWith("/reports/index.json"))
        return Promise.resolve(
          okJson({
            reports: [
              spotlight("/reports/spotlight/2026-04-19-LLM.pdf"),
              spotlight("/reports/spotlight/2026-04-18-other.pdf"),
            ],
          }),
        );
      return Promise.resolve(new Response("nope", { status: 404 }));
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const runtime = mkRuntime();
    const res = await getSpotlightAction.handler(runtime, msg);
    expect(res?.success).toBe(true);
    expect(res?.text).toContain("Token Spotlight: LLM");
    expect(res?.text).toContain("-LLM.pdf");
  });

  it("reports cleanly when no spotlight exists for that mint", async () => {
    const mockFetch = vi.fn((url: string) => {
      if (url.endsWith("/cache/ecosystem.json"))
        return Promise.resolve(okJson(ECOSYSTEM));
      if (url.endsWith("/reports/index.json"))
        return Promise.resolve(
          okJson({
            reports: [spotlight("/reports/spotlight/2026-04-18-OTHER.pdf")],
          }),
        );
      return Promise.resolve(new Response("nope", { status: 404 }));
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const runtime = mkRuntime();
    const res = await getSpotlightAction.handler(runtime, msg);
    expect(res?.success).toBe(false);
    expect(res?.text).toMatch(/No spotlight published/);
  });

  it("rejects HTML SPA-fallback responses as 'not published yet'", async () => {
    const mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const runtime = mkRuntime();
    const res = await getSpotlightAction.handler(runtime, msg);
    expect(res?.success).toBe(false);
    expect(res?.error).toMatch(/not published yet/);
  });
});
