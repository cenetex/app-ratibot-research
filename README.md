# @cenetex/app-ratibot-research

Thin ElizaOS / Milady client for [ratibot](https://github.com/cenetex/ratibot)'s
published Solana token research.

## MVP

Two capabilities. Both read-only against ratibot's public CDN.

### 1. Subscribe to new reports

`RatibotReportFeed` polls ratibot's report index on an interval and emits
each newly-published entry to listeners. First poll establishes a baseline
so existing reports aren't replayed; only reports that appear in subsequent
polls fire events.

```ts
import { RatibotReportFeed } from "@cenetex/app-ratibot-research";

const feed = runtime.getService<RatibotReportFeed>(RatibotReportFeed.serviceType);
feed?.onReport((entry) => {
  // entry.type is "spotlight" | "weekly" | "daily" | "trade"
  // entry.url is the PDF path on the CDN
});
```

### 2. Look up deep dives

When a Solana mint address comes up in conversation, call `GET_SPOTLIGHT` to
fetch the published spotlight PDF for that token.

| Action | Trigger | Returns |
|---|---|---|
| `GET_SPOTLIGHT` | Solana mint (base58, 32–44 chars) in the message | Report title + PDF URL, or a "no spotlight published" message. |

## Install

```bash
npm install @cenetex/app-ratibot-research
```

```ts
import { ratibotResearchPlugin } from "@cenetex/app-ratibot-research";

export default {
  plugins: [ratibotResearchPlugin],
};
```

## Config

| Env var | Default | Purpose |
|---|---|---|
| `RATIBOT_API_BASE` | `https://d1bn9lkpdxaeev.cloudfront.net` | Base URL for ratibot's published report CDN. |
| `RATIBOT_POLL_INTERVAL_MS` | `60000` | Subscription poll cadence. Min 5s. |
| `RATIBOT_SUBSCRIPTION_TYPES` | *(all)* | Comma-separated filter: `spotlight,weekly,daily,trade`. |

No API keys. The CDN is public; generating new reports is gated server-side
in the ratibot agent.

## License

MIT
