import type { Tool } from "ai";

export declare const ORACLE_URL: string;
export declare const SEARCH_URL: string;
export declare const CHAINS: readonly ["base", "bsc", "ethereum", "polygon", "arbitrum", "robinhood"];

export interface Budget {
  maxPerCall: number;
  maxPerDay: number;
  spentToday(): number;
  policy: (x402Version: number, requirements: any[]) => any[];
}
export declare function createBudget(opts?: { maxPerCall?: number; maxPerDay?: number; now?: () => number }): Budget;
export declare function createPayingFetch(opts: { wallet: any; budget: Budget; fetch?: typeof fetch }): typeof fetch;

export interface SafetyResult {
  ok: boolean;
  verdict: "ALLOW" | "LIMIT" | "RECHECK" | "BLOCK" | "NO_ANSWER";
  grade?: "A" | "B" | "C" | "D" | "F";
  risk?: number | null;
  reasonCodes?: string[];
  why?: string | null;
  chain?: string;
  address?: string;
  paidTx?: string | null;
  error?: string;
}
export interface SearchResult {
  ok: boolean;
  query?: string;
  count?: number;
  results?: { title: string; url: string; snippet: string; published: string | null }[];
  paidTx?: string | null;
  error?: string;
}

export declare function tokenSafetyCheck(opts: { payFetch: typeof fetch; timeoutMs?: number }): Tool<{ address: string; chain?: string }, SafetyResult>;
export declare function webSearch(opts: { payFetch: typeof fetch; timeoutMs?: number }): Tool<{ query: string; category?: "general" | "news" | "images"; maxResults?: number }, SearchResult>;

export declare function cyberwarexTools(opts: {
  /** viem account, e.g. privateKeyToAccount(process.env.AGENT_PRIVATE_KEY) */
  wallet: any;
  /** USD cap for one call. Default 0.01. */
  maxPerCall?: number;
  /** USD cap per UTC day, both tools together. Default 0.5. */
  maxPerDay?: number;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): { tokenSafetyCheck: ReturnType<typeof tokenSafetyCheck>; webSearch: ReturnType<typeof webSearch> };
