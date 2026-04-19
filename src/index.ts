/**
 * @cenetex/plugin-ratibot-research
 *
 * Thin ElizaOS / Milady client for ratibot's published research. MVP surface:
 *   - subscribe to new reports as they are published (RatibotReportFeed)
 *   - look up the spotlight PDF for a specific Solana token (GET_SPOTLIGHT)
 */

import type { Plugin } from "@elizaos/core";

import { getSpotlightAction } from "./actions/getSpotlight.js";
import { RatibotReportFeed } from "./services/ratibot-feed.js";

export const ratibotResearchPlugin: Plugin = {
  name: "ratibot-research",
  description:
    "Thin client for ratibot's Solana token research — subscribe to new reports and fetch deep dives on demand.",
  actions: [getSpotlightAction],
  services: [RatibotReportFeed],
};

export default ratibotResearchPlugin;

export { getSpotlightAction } from "./actions/getSpotlight.js";
export { RatibotReportFeed } from "./services/ratibot-feed.js";
export type * from "./types.js";
