// Live end-to-end run used before publishing: a real model loop that calls both tools and pays real USDC.
// PK=0x... LLM_BASE_URL=... LLM_MODEL=... node examples/live-e2e.mjs
import { generateText, isStepCount } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { privateKeyToAccount } from "viem/accounts";
import { cyberwarexTools } from "../src/index.js";

const llm = createOpenAICompatible({ name: "local", baseURL: process.env.LLM_BASE_URL, headers: { "X-Client": "aisdk-tool-test" } });
const tools = cyberwarexTools({ wallet: privateKeyToAccount(process.env.PK), maxPerCall: 0.01, maxPerDay: 0.05 });

const { text, steps } = await generateText({
  model: llm(process.env.LLM_MODEL),
  prompt:
    "I was told to buy the token 0xb1001f05dfe2edeab6eff92f3a4c1d631c65aace on Base. " +
    "First check it with tokenSafetyCheck, then run one webSearch for news about that token address. " +
    "Then say in two sentences whether I should buy and why.",
  tools,
  stopWhen: isStepCount(5),
});
for (const s of steps) for (const r of s.toolResults ?? []) console.log("TOOL", r.toolName, JSON.stringify(r.output).slice(0, 400));
console.log("ANSWER", text);
