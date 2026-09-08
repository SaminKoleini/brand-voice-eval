import OpenAI from 'openai'

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://10.113.0.113:4000/openai/v1'
const X_CALLER = process.env.GATEWAY_X_CALLER ?? 'lab-samin-eval-brand-voice'
const X_TASK = process.env.GATEWAY_X_TASK ?? 'brand-voice.eval'

export const gateway = new OpenAI({
  baseURL: GATEWAY_URL,
  apiKey: 'gateway-placeholder',
  defaultHeaders: {
    'X-Caller': X_CALLER,
    'X-Task': X_TASK,
  },
})

export type ModelId =
  | 'gemini-2.5-flash-lite'
  | 'gemini-2.5-flash'
  | 'gpt-5-nano'

export async function callModel(
  model: ModelId,
  prompt: string,
  maxTokens = 1024,
): Promise<string> {
  const res = await gateway.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
  })
  return res.choices[0]?.message?.content ?? ''
}

export async function callModelWithFallback(
  primary: ModelId,
  fallback: ModelId,
  prompt: string,
  maxTokens = 1024,
): Promise<{ text: string; model: ModelId }> {
  try {
    const text = await callModel(primary, prompt, maxTokens)
    if (text.trim().length === 0) throw new Error('empty response')
    return { text, model: primary }
  } catch (err) {
    const text = await callModel(fallback, prompt, maxTokens)
    return { text, model: fallback }
  }
}
