/**
 * Wire types for ratibot's published report index.
 */

export interface ReportIndexEntry {
  date: string;
  type: "spotlight" | "weekly" | "daily" | "trade";
  title: string;
  url: string;
  size_bytes: number;
  generated_at: string;
}

/** One row of `/cache/ecosystem.json#tokens`. */
export interface EcosystemToken {
  address: string;
  symbol: string;
  name: string;
  overlap_percent: number;
  overlap_holders: number;
  price_usd: number;
  liquidity_usd: number;
  flow_direction: "accumulating" | "new" | "distributing" | string;
  flow_score: number;
  rank: number;
  source_tokens?: string[];
  source_count?: number;
}

export interface EcosystemPayload {
  home_tokens: string[];
  home_token: string;
  home_holders: number;
  scanned_at: string;
  cached_at: string;
  tokens: EcosystemToken[];
}
