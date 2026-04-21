// Live smoke test against ratibot's production CDN.
// Run with: node scripts/smoke.mjs
// Exercises both MVP capabilities — subscription feed + spotlight lookup.

import { getSpotlightAction, RatibotReportFeed } from "../dist/index.js";

const API_BASE = process.env.RATIBOT_API_BASE || "https://d1bn9lkpdxaeev.cloudfront.net";

const runtime = {
  getSetting: (k) => (k === "RATIBOT_API_BASE" ? API_BASE : null),
  getService: () => null,
};

async function main() {
  console.log(`\n== feed: pulling /reports/index.json from ${API_BASE} ==`);
  const feed = new RatibotReportFeed(undefined, { apiBase: API_BASE });
  // First poll establishes the baseline.
  await feed.poll();
  const baseline = [...feed["seen"]];
  console.log(`  baseline: ${baseline.length} reports already published`);
  baseline.slice(0, 5).forEach((u) => console.log(`    - ${u}`));
  if (baseline.length > 5) console.log(`    ... and ${baseline.length - 5} more`);

  console.log(`\n== ecosystem: resolving a mint via /cache/ecosystem.json ==`);
  const res = await fetch(`${API_BASE}/cache/ecosystem.json`);
  const eco = await res.json();
  const tokens = Array.isArray(eco.tokens) ? eco.tokens : [];
  console.log(`  ${tokens.length} tokens in ecosystem`);
  const probe = tokens.find((t) => t.symbol && t.address) ?? tokens[0];
  if (!probe) {
    console.log("  ecosystem empty — can't probe spotlight");
    return;
  }
  console.log(`  probe token: ${probe.symbol} (${probe.address})`);

  console.log(`\n== action: GET_SPOTLIGHT on that mint ==`);
  const message = { content: { text: `Tell me about ${probe.address}` } };
  const out = await getSpotlightAction.handler(runtime, message);
  console.log(`  success: ${out?.success}`);
  console.log(`  text: ${out?.text}`);
  if (out?.data?.url) console.log(`  url: ${API_BASE}${out.data.url}`);
}

main().catch((err) => {
  console.error("smoke failed:", err);
  process.exit(1);
});
