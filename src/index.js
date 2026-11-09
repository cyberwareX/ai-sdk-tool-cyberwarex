// CyberWareX tools for the Vercel AI SDK: a token safety check and live web search.
// Each call is paid with x402 (USDC on Base) from the wallet you pass in. No account, no API key.
// Spend limits are set in code here and cannot be raised by the model.
import { tool } from "ai";
import { z } from "zod";
import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";

export const ORACLE_URL = "https://oracle.cyberwarex.com/risk/explain";
export const SEARCH_URL = "https://search.cyberwarex.com/search";
const BASE_MAINNET = "eip155:8453";
const USDC_DECIMALS = 6;
export const CHAINS = ["base", "bsc", "ethereum", "polygon", "arbitrum", "robinhood"];

// Spend guard shared by both tools. Amounts are counted when a payment is approved,
// so a payment that later fails still counts (the guard errs on the safe side).
export function createBudget({ maxPerCall = 0.01, maxPerDay = 0.5, now = () => Date.now() } = {}) {
  if (!(maxPerCall > 0) || !(maxPerDay > 0)) throw new Error("maxPerCall and maxPerDay must be positive numbers (USD)");
  let day = "";
  let spent = 0;
  const spentToday = () => {
    const d = new Date(now()).toISOString().slice(0, 10); // UTC day
    if (d !== day) { day = d; spent = 0; }
    return spent;
  };
  const usdOf = (r) => Number(r.amount ?? r.maxAmountRequired) / 10 ** USDC_DECIMALS;
  return {
    maxPerCall,
    maxPerDay,
    spentToday,
    // x402 payment policy: drop every option over the per-call cap or the daily budget.
    policy: (_version, requirements) => {
      const today = spentToday();
      const ok = requirements.filter((r) => {
        const usd = usdOf(r);
        return Number.isFinite(usd) && usd <= maxPerCall && today + usd <= maxPerDay + 1e-9;
      });
      if (ok.length) spent += usdOf(ok[0]);
      return ok;
    },
  };
}

// Build a paying fetch from a viem account (or any x402 EVM signer).
export function createPayingFetch({ wallet, budget, fetch: baseFetch = globalThis.fetch }) {
  if (!wallet) throw new Error("wallet is required: pass a viem account, e.g. privateKeyToAccount(process.env.AGENT_PRIVATE_KEY)");
  return wrapFetchWithPaymentFromConfig(baseFetch, {
    schemes: [{ network: BASE_MAINNET, client: new ExactEvmScheme(wallet) }],
    policies: [budget.policy],
    spendControls: { maxAmountPerPayment: `$${budget.maxPerCall}` },
  });
}

async function paidGet(payFetch, url, timeoutMs) {
  const res = await payFetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) {
    const why = res.status === 402 ? "payment was not made (spend limit reached, empty wallet, or the payment failed)" : `HTTP ${res.status}`;
    return { ok: false, error: why, detail: text.slice(0, 300) };
  }
  let body;
  try { body = JSON.parse(text); } catch { return { ok: false, error: "the answer was not JSON", detail: text.slice(0, 300) }; }
  let paidTx = null;
  const header = res.headers.get("payment-response");
  if (header) { try { paidTx = decodePaymentResponseHeader(header)?.transaction ?? null; } catch { /* receipt is optional */ } }
  return { ok: true, body, paidTx };
}

function safeError(e) {
  return { ok: false, error: e?.name === "TimeoutError" ? "timed out" : String(e?.message || e).slice(0, 300) };
}

export function tokenSafetyCheck({ payFetch, timeoutMs = 60000 }) {
  return tool({
    description:
      "Check an ERC-20 token before buying, swapping into or approving it. Returns a verdict " +
      "(ALLOW, LIMIT, RECHECK or BLOCK), an A-F grade, a 0-100 risk score and reason codes such as honeypot, " +
      "owner can mint or sell tax. Costs $0.005 in USDC on Base per token. If the result is not ok, treat the token as unsafe.",
    inputSchema: z.object({
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe("Token contract address (0x...)"),
      chain: z.enum(CHAINS).default("base").describe("Chain the token lives on"),
    }),
    execute: async ({ address, chain }) => {
      try {
        const url = `${ORACLE_URL}?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(address)}`;
        const r = await paidGet(payFetch, url, timeoutMs);
        if (!r.ok) return { ...r, verdict: "NO_ANSWER" };
        const b = r.body;
        return {
          ok: true,
          verdict: b.verdict,
          grade: b.grade,
          risk: b.risk?.overall ?? null,
          reasonCodes: b.recommendation?.reason_codes ?? [],
          why: b.recommendation?.why ?? null,
          chain: b.chain ?? chain,
          address: b.address ?? address,
          paidTx: r.paidTx,
        };
      } catch (e) {
        return { ...safeError(e), verdict: "NO_ANSWER" };
      }
    },
  });
}

export function webSearch({ payFetch, timeoutMs = 30000 }) {
  return tool({
    description:
      "Search the live web. Returns up to 10 results with title, url, snippet and date when known. " +
      "Use category news for recent events. Costs $0.00435 in USDC on Base per search; a search with no results is free.",
    inputSchema: z.object({
      query: z.string().min(1).max(400).describe("What to search for"),
      category: z.enum(["general", "news", "images"]).default("general"),
      maxResults: z.number().int().min(1).max(10).default(5),
    }),
    execute: async ({ query, category, maxResults }) => {
      try {
        const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&category=${category}&max_results=${maxResults}`;
        const r = await paidGet(payFetch, url, timeoutMs);
        if (!r.ok) return r;
        const results = (r.body.results ?? []).map((h) => ({
          title: h.title, url: h.url, snippet: h.snippet, published: h.published ?? null,
        }));
        return { ok: true, query, count: results.length, results, paidTx: r.paidTx };
      } catch (e) {
        return safeError(e);
      }
    },
  });
}

// One call gives both tools, sharing one wallet and one budget.
export function cyberwarexTools({ wallet, maxPerCall = 0.01, maxPerDay = 0.5, fetch, timeoutMs } = {}) {
  const budget = createBudget({ maxPerCall, maxPerDay });
  const payFetch = createPayingFetch({ wallet, budget, fetch });
  return {
    tokenSafetyCheck: tokenSafetyCheck({ payFetch, timeoutMs }),
    webSearch: webSearch({ payFetch, timeoutMs }),
  };
}
