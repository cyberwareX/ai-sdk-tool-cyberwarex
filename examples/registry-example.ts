import { generateText, isStepCount } from 'ai';
import { cyberwarexTools } from 'ai-sdk-tool-cyberwarex';
import { privateKeyToAccount } from 'viem/accounts';

// Each call is paid in USDC on Base: $0.005 per token check, $0.00435 per search.
// The limits are set here and cannot be raised by the model.
const tools = cyberwarexTools({
  wallet: privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`),
  maxPerCall: 0.01,
  maxPerDay: 0.5,
});

const { text } = await generateText({
  model: 'openai/gpt-5-mini',
  prompt:
    'Should I buy the token 0xb1001f05dfe2edeab6eff92f3a4c1d631c65aace on Base? Check it first.',
  tools,
  stopWhen: isStepCount(4),
});

console.log(text);