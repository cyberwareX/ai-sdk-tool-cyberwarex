# ai-sdk-tool-cyberwarex

Two tools for the [Vercel AI SDK](https://ai-sdk.dev), paid per call from your agent's own wallet in USDC on Base through [x402](https://x402.org). No account, no API key.

| Tool | What it does | Price |
|---|---|---|
| `tokenSafetyCheck` | Checks an ERC-20 token on chain before the agent buys, swaps into or approves it. Returns ALLOW, LIMIT, RECHECK or BLOCK, an A-F grade, a 0-100 risk score and reason codes (honeypot, mint rights, changeable tax and more). Chains: base, bsc, ethereum, polygon, arbitrum, robinhood. | $0.005 |
| `webSearch` | Live web, news or image search. Up to 10 results with title, url, snippet and date when known. A search with no results is not charged. | $0.00435 |

Docs: https://cyberwarex.com/docs/ai-sdk

## Install

```bash
npm install ai-sdk-tool-cyberwarex ai zod viem
```

## Use

```js
import { generateText, isStepCount } from 'ai';
import { cyberwarexTools } from 'ai-sdk-tool-cyberwarex';
import { privateKeyToAccount } from 'viem/accounts';

// The wallet pays per call in USDC on Base. The limits are set here, not by the model.
const tools = cyberwarexTools({
  wallet: privateKeyToAccount(process.env.AGENT_PRIVATE_KEY),
  maxPerCall: 0.01, // USD, one call
  maxPerDay: 0.5,   // USD, both tools together, per UTC day
});

const { text } = await generateText({
  model: 'openai/gpt-5-mini',
  prompt: 'Should I buy the token 0xb1001f05dfe2edeab6eff92f3a4c1d631c65aace on Base? Check it first.',
  tools,
  stopWhen: isStepCount(4),
});

console.log(text);
```

The wallet needs a little USDC on Base and no ETH: the payment is a signed USDC authorization and the facilitator pays the gas.

You can also build one tool at a time: `tokenSafetyCheck({ payFetch })` and `webSearch({ payFetch })`, with `payFetch` from `createPayingFetch({ wallet, budget: createBudget({ maxPerCall, maxPerDay }) })`.

## When something fails

- Empty wallet, limit reached, service down or timeout: `tokenSafetyCheck` returns `ok: false` and verdict `NO_ANSWER`. Treat that as unsafe and do not trade. `webSearch` returns `ok: false` with an `error`.
- The limits are checked before anything is signed. A payment that fails after approval still counts, so the limit errs on the safe side. The count is kept in memory for each cyberwarexTools() call: create it once and reuse it. A restart resets the count.
- LIMIT means a real risk was found: trade small or skip. RECHECK means the data was not complete. Large tokens such as USDC can carry blacklist or pause codes and still get ALLOW, because the issuer can freeze them by design.
- The check is automated on-chain heuristics, not financial advice.

## Tests

```bash
npm test                      # offline, no network, no money
PK=0x... LLM_BASE_URL=... LLM_MODEL=... node examples/live-e2e.mjs   # real model loop, spends about $0.01
```

## License

MIT
