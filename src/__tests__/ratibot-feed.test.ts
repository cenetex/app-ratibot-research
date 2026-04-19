import { beforeEach, describe, expect, it, vi } from "vitest";

import { RatibotReportFeed } from "../services/ratibot-feed.js";
import type { ReportIndexEntry } from "../types.js";

function entry(partial: Partial<ReportIndexEntry>): ReportIndexEntry {
  return {
    date: "2026-04-19",
    type: "spotlight",
    title: "Token Spotlight: SAMPLE",
    url: "/reports/spotlight/2026-04-19-SAMPLE.pdf",
    size_bytes: 12345,
    generated_at: "2026-04-19T00:00:00Z",
    ...partial,
  };
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("RatibotReportFeed", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("first poll establishes a baseline without emitting existing reports", async () => {
    const existing = [entry({ url: "/a.pdf" }), entry({ url: "/b.pdf" })];
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(okJson({ reports: existing }));
    const feed = new RatibotReportFeed(undefined, {
      apiBase: "https://cdn.test",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    const seen: ReportIndexEntry[] = [];
    feed.onReport((e) => seen.push(e));

    await feed.poll();

    expect(seen).toHaveLength(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://cdn.test/reports/index.json",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("emits only entries added after baseline, oldest-first", async () => {
    const baseline = [entry({ url: "/a.pdf" })];
    const updated = [
      // index is newest-first on the CDN; ratibot prepends new entries
      entry({ url: "/c.pdf", date: "2026-04-21" }),
      entry({ url: "/b.pdf", date: "2026-04-20" }),
      entry({ url: "/a.pdf", date: "2026-04-19" }),
    ];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okJson({ reports: baseline }))
      .mockResolvedValueOnce(okJson({ reports: updated }));

    const feed = new RatibotReportFeed(undefined, {
      apiBase: "https://cdn.test",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    const seen: ReportIndexEntry[] = [];
    feed.onReport((e) => seen.push(e));

    await feed.poll();
    await feed.poll();

    expect(seen.map((e) => e.url)).toEqual(["/b.pdf", "/c.pdf"]);
  });

  it("dedupes — a repeated entry is only emitted once", async () => {
    const after = [entry({ url: "/new.pdf" }), entry({ url: "/a.pdf" })];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okJson({ reports: [entry({ url: "/a.pdf" })] }))
      .mockResolvedValueOnce(okJson({ reports: after }))
      .mockResolvedValueOnce(okJson({ reports: after }));

    const feed = new RatibotReportFeed(undefined, {
      apiBase: "https://cdn.test",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    const seen: ReportIndexEntry[] = [];
    feed.onReport((e) => seen.push(e));

    await feed.poll();
    await feed.poll();
    await feed.poll();

    expect(seen.map((e) => e.url)).toEqual(["/new.pdf"]);
  });

  it("applies the type filter", async () => {
    const first = [entry({ url: "/a.pdf", type: "spotlight" })];
    const second = [
      entry({ url: "/w.pdf", type: "weekly" }),
      entry({ url: "/s.pdf", type: "spotlight" }),
      entry({ url: "/a.pdf", type: "spotlight" }),
    ];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okJson({ reports: first }))
      .mockResolvedValueOnce(okJson({ reports: second }));

    const feed = new RatibotReportFeed(undefined, {
      apiBase: "https://cdn.test",
      fetch: fetchImpl as unknown as typeof fetch,
      types: ["spotlight"],
    });
    const seen: ReportIndexEntry[] = [];
    feed.onReport((e) => seen.push(e));

    await feed.poll();
    await feed.poll();

    expect(seen.map((e) => e.url)).toEqual(["/s.pdf"]);
  });

  it("swallows non-JSON CDN responses (SPA fallback) without poisoning state", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("<html>fallback</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(okJson({ reports: [entry({ url: "/a.pdf" })] }));

    const feed = new RatibotReportFeed(undefined, {
      apiBase: "https://cdn.test",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    const seen: ReportIndexEntry[] = [];
    feed.onReport((e) => seen.push(e));

    await feed.poll(); // treated as empty baseline
    await feed.poll(); // /a.pdf is new relative to the empty baseline
    expect(seen.map((e) => e.url)).toEqual(["/a.pdf"]);
  });

  it("swallows non-2xx CDN responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(okJson({ reports: [entry({ url: "/a.pdf" })] }));

    const feed = new RatibotReportFeed(undefined, {
      apiBase: "https://cdn.test",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    await feed.poll();
    const seen: ReportIndexEntry[] = [];
    feed.onReport((e) => seen.push(e));
    await feed.poll();
    expect(seen.map((e) => e.url)).toEqual(["/a.pdf"]);
  });

  it("stop() halts further emissions and frees listeners", async () => {
    const first = [entry({ url: "/a.pdf" })];
    const second = [entry({ url: "/b.pdf" }), entry({ url: "/a.pdf" })];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(okJson({ reports: first }))
      .mockResolvedValueOnce(okJson({ reports: second }));

    const feed = new RatibotReportFeed(undefined, {
      apiBase: "https://cdn.test",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    const seen: ReportIndexEntry[] = [];
    feed.onReport((e) => seen.push(e));
    await feed.poll();
    await feed.stop();
    await feed.poll();
    expect(seen).toHaveLength(0);
  });

  it("trims trailing slash from apiBase", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ reports: [] }));
    const feed = new RatibotReportFeed(undefined, {
      apiBase: "https://cdn.test/",
      fetch: fetchImpl as unknown as typeof fetch,
    });
    await feed.poll();
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://cdn.test/reports/index.json",
      expect.anything(),
    );
  });
});
