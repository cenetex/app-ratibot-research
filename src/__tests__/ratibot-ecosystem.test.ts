import { describe, expect, it, vi } from "vitest";

import { RatibotEcosystem } from "../services/ratibot-ecosystem.js";
import type { EcosystemPayload } from "../types.js";

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const SAMPLE: EcosystemPayload = {
  home_tokens: ["RATI"],
  home_token: "RATI",
  home_holders: 700,
  scanned_at: "2026-04-20T00:00:00Z",
  cached_at: "2026-04-20T01:00:00Z",
  tokens: [
    {
      address: "ADDR1",
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
  ],
};

describe("RatibotEcosystem", () => {
  it("getEcosystem fetches once and caches within TTL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson(SAMPLE));
    const svc = new RatibotEcosystem(undefined, {
      apiBase: "https://cdn.test",
      ttlMs: 60_000,
      fetch: fetchImpl as unknown as typeof fetch,
    });
    const a = await svc.getEcosystem();
    const b = await svc.getEcosystem();
    expect(a).toBe(b);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://cdn.test/cache/ecosystem.json",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("refresh forces a fresh fetch", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => okJson(SAMPLE));
    const svc = new RatibotEcosystem(undefined, {
      apiBase: "https://cdn.test",
      ttlMs: 60_000,
      fetch: fetchImpl as unknown as typeof fetch,
    });
    await svc.getEcosystem();
    await svc.refresh();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent in-flight refreshes into one request", async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchImpl = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve)),
    );
    const svc = new RatibotEcosystem(undefined, {
      apiBase: "https://cdn.test",
      ttlMs: 60_000,
      fetch: fetchImpl as unknown as typeof fetch,
    });
    const p1 = svc.getEcosystem();
    const p2 = svc.refresh();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    resolveFetch(okJson(SAMPLE));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2);
  });

  it("normalizes a sparse payload safely", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({}));
    const svc = new RatibotEcosystem(undefined, {
      apiBase: "https://cdn.test",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    const got = await svc.getEcosystem();
    expect(got.home_tokens).toEqual([]);
    expect(got.tokens).toEqual([]);
    expect(got.home_holders).toBe(0);
  });

  it("throws on non-JSON response (CDN SPA fallback case)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("<html>spa</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    const svc = new RatibotEcosystem(undefined, {
      apiBase: "https://cdn.test",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    await expect(svc.getEcosystem()).rejects.toThrow(/not published yet/);
  });
});
