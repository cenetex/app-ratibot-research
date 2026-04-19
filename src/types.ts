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
