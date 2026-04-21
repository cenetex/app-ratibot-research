const VIEWER_FRAME_ANCESTORS_DIRECTIVE =
  "frame-ancestors 'self' http://localhost:* http://127.0.0.1:* " +
  "http://[::1]:* http://[0:0:0:0:0:0:0:1]:* https://localhost:* " +
  "https://127.0.0.1:* https://[::1]:* https://[0:0:0:0:0:0:0:1]:* " +
  "electrobun: capacitor: capacitor-electron: app: tauri: file:";

export { VIEWER_FRAME_ANCESTORS_DIRECTIVE };

export interface ViewerRenderOptions {
  agentName: string;
  sessionId: string;
  apiBase: string;
  cdnBase: string;
}

export function renderViewerHtml(opts: ViewerRenderOptions): string {
  const safeAgent = escapeHtml(opts.agentName);
  const safeSession = encodeURIComponent(opts.sessionId);
  const safeApi = encodeURIComponent(opts.apiBase);
  const safeCdn = encodeURIComponent(opts.cdnBase);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ratibot Research — ${safeAgent}</title>
<style>
  :root {
    color-scheme: dark;
    --bg-0: #080706;
    --bg-1: #110f0d;
    --panel: rgba(18, 17, 14, 0.86);
    --panel-border: rgba(245, 239, 223, 0.12);
    --ink: #f5efdf;
    --muted: #cfc3ad;
    --faint: #8e846f;
    --ore: #f1b566;
    --signal: #80ffd5;
    --up: #80ffd5;
    --new: #f1b566;
    --down: #ff8fa3;
    --line: rgba(245, 239, 223, 0.08);
  }
  html, body {
    margin: 0;
    padding: 0;
    background:
      radial-gradient(circle at 16% 18%, rgba(241,181,102,0.12), transparent 30%),
      radial-gradient(circle at 84% 80%, rgba(128,255,213,0.08), transparent 35%),
      var(--bg-0);
    color: var(--ink);
    font-family: "IBM Plex Sans Condensed", "Arial Narrow", system-ui, -apple-system, sans-serif;
    font-size: 13px;
    line-height: 1.45;
    min-height: 100vh;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--panel-border);
    background: linear-gradient(180deg, rgba(241,181,102,0.06), transparent);
  }
  header .brand {
    font-weight: 600;
    font-size: 15px;
    color: var(--ore);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  header .agent { color: var(--muted); font-size: 12px; }
  header .home {
    margin-left: auto;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 11px;
    color: var(--signal);
  }
  main {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) minmax(320px, 1.4fr);
    gap: 14px;
    padding: 14px;
  }
  @media (max-width: 800px) {
    main { grid-template-columns: 1fr; }
  }
  .panel {
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-radius: 10px;
    padding: 12px 14px;
    min-height: 160px;
  }
  .panel h2 {
    margin: 0 0 10px;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ore);
    font-weight: 600;
  }
  .filters {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .filters button {
    border: 1px solid var(--panel-border);
    background: rgba(241,181,102,0.05);
    color: var(--muted);
    padding: 3px 9px;
    border-radius: 999px;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .filters button.active {
    background: rgba(241,181,102,0.18);
    color: var(--ore);
    border-color: rgba(241,181,102,0.4);
  }
  ul.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 60vh; overflow-y: auto; }
  ul.list li {
    padding: 7px 10px;
    border-radius: 6px;
    background: rgba(245,239,223,0.03);
    border: 1px solid var(--line);
  }
  ul.list li.empty { color: var(--faint); text-align: center; }
  ul.list a {
    color: var(--ink);
    text-decoration: none;
    display: block;
  }
  ul.list a:hover .title { color: var(--ore); }
  .row-title { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .badge {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid var(--line);
  }
  .badge.spotlight { color: var(--signal); border-color: rgba(128,255,213,0.35); }
  .badge.weekly { color: var(--ore); border-color: rgba(241,181,102,0.35); }
  .badge.daily { color: var(--muted); }
  .badge.trade { color: var(--down); border-color: rgba(255,143,163,0.35); }
  .row-meta { color: var(--faint); font-size: 11px; margin-top: 2px; font-family: "IBM Plex Mono", ui-monospace, monospace; }
  table.tokens {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  table.tokens th {
    text-align: left;
    padding: 6px 8px;
    color: var(--faint);
    font-weight: 500;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--line);
  }
  table.tokens td {
    padding: 7px 8px;
    border-bottom: 1px solid var(--line);
    font-variant-numeric: tabular-nums;
  }
  table.tokens td.num { text-align: right; font-family: "IBM Plex Mono", ui-monospace, monospace; }
  table.tokens td.sym { font-weight: 600; color: var(--ore); }
  table.tokens td.addr {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    color: var(--faint);
    font-size: 10px;
  }
  table.tokens tr:hover td { background: rgba(241,181,102,0.04); }
  .flow.accumulating { color: var(--up); }
  .flow.new { color: var(--new); }
  .flow.distributing { color: var(--down); }
  .err-banner {
    margin: 0 14px;
    padding: 9px 12px;
    border-radius: 6px;
    background: rgba(255,143,163,0.08);
    border: 1px solid rgba(255,143,163,0.3);
    color: var(--down);
    font-size: 12px;
  }
  footer {
    padding: 10px 18px;
    color: var(--faint);
    font-size: 11px;
    border-top: 1px solid var(--panel-border);
    display: flex;
    justify-content: space-between;
  }
  footer code { font-family: "IBM Plex Mono", ui-monospace, monospace; }
</style>
</head>
<body>
<header>
  <span class="brand">Ratibot Research</span>
  <span class="agent">· ${safeAgent}</span>
  <span class="home" id="home-pill">$RATI</span>
</header>
<div id="err-banner" class="err-banner" hidden></div>
<main>
  <section class="panel">
    <h2>Reports</h2>
    <div class="filters" id="filters">
      <button data-filter="all" class="active">All</button>
      <button data-filter="spotlight">Spotlight</button>
      <button data-filter="weekly">Weekly</button>
      <button data-filter="daily">Daily</button>
      <button data-filter="trade">Trade</button>
    </div>
    <ul class="list" id="reports-list"><li class="empty">Loading…</li></ul>
  </section>
  <section class="panel">
    <h2>Ecosystem · top tokens by overlap</h2>
    <table class="tokens">
      <thead>
        <tr>
          <th>#</th>
          <th>Symbol</th>
          <th class="num">Price</th>
          <th class="num">Liquidity</th>
          <th>Flow</th>
          <th class="num">Overlap</th>
        </tr>
      </thead>
      <tbody id="tokens-body"><tr><td colspan="6" style="color:var(--faint);text-align:center;padding:14px">Loading…</td></tr></tbody>
    </table>
  </section>
</main>
<footer>
  <span>session <code id="session-id">${escapeHtml(opts.sessionId)}</code></span>
  <span id="last-updated">—</span>
</footer>
<script type="module">
  const SESSION_ID = decodeURIComponent("${safeSession}");
  const API_BASE = decodeURIComponent("${safeApi}");
  const CDN_BASE = decodeURIComponent("${safeCdn}");

  const el = (id) => document.getElementById(id);
  const banner = el("err-banner");
  const reportsList = el("reports-list");
  const tokensBody = el("tokens-body");
  const lastUpdated = el("last-updated");
  const homePill = el("home-pill");
  const filters = el("filters");

  let activeFilter = "all";
  let allReports = [];

  function showError(msg) { banner.textContent = msg; banner.hidden = false; }
  function clearError() { banner.hidden = true; }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function fmtBytes(n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function fmtUsd(n) {
    if (!Number.isFinite(n) || n === 0) return '—';
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K';
    if (n >= 1) return '$' + n.toFixed(2);
    if (n >= 0.01) return '$' + n.toFixed(4);
    return '$' + n.toExponential(2);
  }

  function shortAddr(a) {
    if (!a || a.length < 10) return a || '';
    return a.slice(0, 4) + '…' + a.slice(-4);
  }

  function renderReports() {
    const list = activeFilter === 'all'
      ? allReports
      : allReports.filter((r) => r.type === activeFilter);
    if (list.length === 0) {
      reportsList.innerHTML = '<li class="empty">No reports of this type yet.</li>';
      return;
    }
    reportsList.innerHTML = list.map((r) => {
      const href = CDN_BASE + r.url;
      const safeTitle = escapeHtml(r.title || '(untitled)');
      const date = escapeHtml(r.date || '');
      const size = fmtBytes(r.size_bytes);
      return '<li><a target="_blank" rel="noopener" href="' + href + '">' +
        '<div class="row-title">' +
          '<span class="badge ' + r.type + '">' + r.type + '</span>' +
          '<span class="title">' + safeTitle + '</span>' +
        '</div>' +
        '<div class="row-meta">' + date + (size ? ' · ' + size : '') + '</div>' +
      '</a></li>';
    }).join('');
  }

  function renderTokens(payload) {
    const tokens = Array.isArray(payload?.tokens) ? payload.tokens : [];
    if (tokens.length === 0) {
      tokensBody.innerHTML = '<tr><td colspan="6" style="color:var(--faint);text-align:center;padding:14px">No tokens.</td></tr>';
      return;
    }
    tokensBody.innerHTML = tokens.slice(0, 20).map((t) => {
      const flow = String(t.flow_direction || '').toLowerCase();
      const overlap = (typeof t.overlap_percent === 'number' ? t.overlap_percent.toFixed(1) : '—') + '%';
      return '<tr>' +
        '<td class="num">' + (t.rank ?? '—') + '</td>' +
        '<td class="sym">' + escapeHtml(t.symbol || '') + '<div class="addr">' + escapeHtml(shortAddr(t.address)) + '</div></td>' +
        '<td class="num">' + fmtUsd(t.price_usd) + '</td>' +
        '<td class="num">' + fmtUsd(t.liquidity_usd) + '</td>' +
        '<td class="flow ' + flow + '">' + escapeHtml(flow || '—') + '</td>' +
        '<td class="num">' + overlap + '</td>' +
      '</tr>';
    }).join('');
    if (payload?.home_token) {
      homePill.textContent = '$RATI · ' + (payload.home_holders ?? '?') + ' holders · ' + shortAddr(payload.home_token);
    }
  }

  async function refreshAll() {
    try {
      const [reportsRes, ecoRes, sessRes] = await Promise.all([
        fetch(API_BASE + '/reports', { headers: { accept: 'application/json' } }),
        fetch(API_BASE + '/ecosystem', { headers: { accept: 'application/json' } }),
        fetch(API_BASE + '/session/' + encodeURIComponent(SESSION_ID), { headers: { accept: 'application/json' } }),
      ]);
      if (!reportsRes.ok) throw new Error('reports HTTP ' + reportsRes.status);
      const reportsBody = await reportsRes.json();
      allReports = Array.isArray(reportsBody?.reports) ? reportsBody.reports : [];
      renderReports();

      if (ecoRes.ok) {
        const eco = await ecoRes.json();
        renderTokens(eco);
      }

      if (sessRes.ok) {
        const sess = await sessRes.json();
        if (sess?.summary) {
          lastUpdated.textContent = sess.summary;
        }
      } else {
        lastUpdated.textContent = 'updated ' + new Date().toLocaleTimeString();
      }
      clearError();
    } catch (err) {
      showError(err && err.message ? err.message : String(err));
    }
  }

  filters.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLButtonElement)) return;
    const f = t.dataset.filter;
    if (!f) return;
    activeFilter = f;
    for (const b of filters.querySelectorAll('button')) {
      b.classList.toggle('active', b.dataset.filter === activeFilter);
    }
    renderReports();
  });

  refreshAll();
  setInterval(refreshAll, 30000);
</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}
