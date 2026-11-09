import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { cyberwarexTools, createBudget } from "../src/index.js";

const fx = (n) => readFileSync(new URL(`./fixtures/${n}-402.b64`, import.meta.url), "utf8").trim();
const wallet = privateKeyToAccount(generatePrivateKey()); // throwaway key, signing is local only
const receipt = Buffer.from(JSON.stringify({ success: true, transaction: "0xabc", network: "eip155:8453" })).toString("base64");

// Fake server: 402 until a payment header arrives, then the given body.
function fakeServer({ kind = "oracle", body, status = 200, raw } = {}) {
  const calls = [];
  const f = async (input, init = {}) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const paid = req.headers.get("payment-signature") || req.headers.get("x-payment");
    calls.push({ url: req.url, paid: Boolean(paid) });
    if (!paid) return new Response("{}", { status: 402, headers: { "payment-required": fx(kind) } });
    return new Response(raw ?? JSON.stringify(body), { status, headers: { "content-type": "application/json", "payment-response": receipt } });
  };
  f.calls = calls;
  return f;
}
const run = (t, input) => t.execute(input, { toolCallId: "t1", messages: [] });
const ORACLE_OK = { verdict: "BLOCK", grade: "F", risk: { overall: 99 }, recommendation: { reason_codes: ["honeypot"], why: "cannot sell" }, chain: "base", address: "0x" + "1".repeat(40) };
const ADDR = "0x" + "1".repeat(40);

test("safety check pays once and returns the verdict", async () => {
  const f = fakeServer({ body: ORACLE_OK });
  const tools = cyberwarexTools({ wallet, fetch: f });
  const r = await run(tools.tokenSafetyCheck, { address: ADDR, chain: "base" });
  assert.equal(r.ok, true);
  assert.equal(r.verdict, "BLOCK");
  assert.deepEqual(r.reasonCodes, ["honeypot"]);
  assert.equal(r.paidTx, "0xabc");
  assert.equal(f.calls.filter((c) => c.paid).length, 1);
  assert.match(f.calls[0].url, /chain=base&address=0x1{40}$/);
});

test("daily budget stops the second payment", async () => {
  const f = fakeServer({ body: ORACLE_OK });
  const tools = cyberwarexTools({ wallet, fetch: f, maxPerDay: 0.008 }); // one $0.005 check fits, two do not
  assert.equal((await run(tools.tokenSafetyCheck, { address: ADDR, chain: "base" })).ok, true);
  const second = await run(tools.tokenSafetyCheck, { address: ADDR, chain: "base" });
  assert.equal(second.ok, false);
  assert.equal(second.verdict, "NO_ANSWER");
  assert.equal(f.calls.filter((c) => c.paid).length, 1, "no second signed payment was sent");
});

test("per-call cap below the price refuses to pay", async () => {
  const f = fakeServer({ body: ORACLE_OK });
  const tools = cyberwarexTools({ wallet, fetch: f, maxPerCall: 0.001 });
  const r = await run(tools.tokenSafetyCheck, { address: ADDR, chain: "base" });
  assert.equal(r.ok, false);
  assert.equal(f.calls.filter((c) => c.paid).length, 0);
});

test("server error and non-JSON give NO_ANSWER, never a verdict", async () => {
  for (const opts of [{ status: 500, body: { e: 1 } }, { raw: "<html>oops</html>" }]) {
    const tools = cyberwarexTools({ wallet, fetch: fakeServer(opts) });
    const r = await run(tools.tokenSafetyCheck, { address: ADDR, chain: "base" });
    assert.equal(r.ok, false);
    assert.equal(r.verdict, "NO_ANSWER");
  }
});

test("network failure and timeout are caught", async () => {
  const boom = async () => { throw new TypeError("fetch failed"); };
  let r = await run(cyberwarexTools({ wallet, fetch: boom }).tokenSafetyCheck, { address: ADDR, chain: "base" });
  assert.equal(r.verdict, "NO_ANSWER");
  const hang = (input, init) => {
    const signal = init?.signal ?? input.signal; // the x402 wrapper passes a Request
    const keepAlive = setTimeout(() => {}, 5000); // AbortSignal.timeout does not hold the event loop open; a real socket would
    return new Promise((_, rej) => signal.addEventListener("abort", () => { clearTimeout(keepAlive); rej(signal.reason); }));
  };
  r = await run(cyberwarexTools({ wallet, fetch: hang, timeoutMs: 50 }).webSearch, { query: "x", category: "general", maxResults: 3 });
  assert.equal(r.ok, false);
  assert.equal(r.error, "timed out");
});

test("web search maps results", async () => {
  const f = fakeServer({ kind: "search", body: { query: "q", count: 1, results: [{ title: "T", url: "https://a", snippet: "s", engine: "google" }] } });
  const r = await run(cyberwarexTools({ wallet, fetch: f }).webSearch, { query: "base l2", category: "news", maxResults: 3 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.results, [{ title: "T", url: "https://a", snippet: "s", published: null }]);
  assert.match(f.calls[0].url, /q=base%20l2&category=news&max_results=3$/);
});

test("input schema rejects a bad address", () => {
  const tools = cyberwarexTools({ wallet, fetch: fakeServer() });
  assert.equal(tools.tokenSafetyCheck.inputSchema.safeParse({ address: "0x12", chain: "base" }).success, false);
  assert.equal(tools.tokenSafetyCheck.inputSchema.safeParse({ address: ADDR, chain: "solana" }).success, false);
});

test("budget resets on a new UTC day and rejects bad limits", () => {
  let t = Date.parse("2026-11-09T23:59:00Z");
  const b = createBudget({ maxPerDay: 0.006, now: () => t });
  const req = [{ amount: "5000" }];
  assert.equal(b.policy(2, req).length, 1);
  assert.equal(b.policy(2, req).length, 0);
  t += 120000;
  assert.equal(b.policy(2, req).length, 1);
  assert.throws(() => createBudget({ maxPerDay: 0 }));
  assert.throws(() => cyberwarexTools({}), /wallet is required/);
});
