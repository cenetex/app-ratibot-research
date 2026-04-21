/**
 * @cenetex/app-ratibot-research
 *
 * Eliza app + plugin for ratibot's published research. Surface:
 *   - subscribe to new reports as they are published (RatibotReportFeed)
 *   - cached $RATI ecosystem rankings (RatibotEcosystem)
 *   - look up the spotlight PDF for a specific Solana token (GET_SPOTLIGHT)
 *   - embedded viewer (reports list + ecosystem rankings) at
 *     /api/apps/ratibot-research/viewer
 */

import type { Plugin } from "@elizaos/core";

import { getSpotlightAction } from "./actions/getSpotlight.js";
import { RatibotEcosystem } from "./services/ratibot-ecosystem.js";
import { RatibotReportFeed } from "./services/ratibot-feed.js";
import {
  collectLaunchDiagnostics,
  handleAppRoutes,
  refreshRunSession,
  resolveLaunchSession,
  type RouteContext,
} from "./routes.js";

export const ratibotResearchPlugin: Plugin = {
  name: "ratibot-research",
  description:
    "Thin client for ratibot's Solana token research — subscribe to new reports, browse ecosystem rankings, and fetch deep dives on demand.",
  actions: [getSpotlightAction],
  services: [RatibotReportFeed, RatibotEcosystem],
  app: {
    displayName: "Ratibot Research",
    category: "research",
    launchType: "connect",
    launchUrl: null,
    capabilities: ["research", "solana", "feed", "ecosystem"],
    runtimePlugin: "@cenetex/app-ratibot-research",
    viewer: {
      url: "/api/apps/ratibot-research/viewer",
      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    },
    session: {
      mode: "viewer",
      features: ["commands", "telemetry"],
    },
  },
  appBridge: {
    handleAppRoutes: (ctx: unknown) => handleAppRoutes(ctx as RouteContext),
    resolveLaunchSession,
    refreshRunSession,
    collectLaunchDiagnostics,
  },
};

export default ratibotResearchPlugin;

export { getSpotlightAction } from "./actions/getSpotlight.js";
export { RatibotReportFeed } from "./services/ratibot-feed.js";
export { RatibotEcosystem } from "./services/ratibot-ecosystem.js";
export {
  collectLaunchDiagnostics,
  handleAppRoutes,
  refreshRunSession,
  resolveLaunchSession,
} from "./routes.js";
export { renderViewerHtml, VIEWER_FRAME_ANCESTORS_DIRECTIVE } from "./viewer.js";
export type * from "./types.js";
