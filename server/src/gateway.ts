import OpenAI from 'openai'
import { connect } from 'node:net'

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

// Off the internal network the gateway's private IP just swallows packets, so
// a request hangs until its timeout. Callers that want to fail fast probe first.
export function assertGatewayReachable(timeoutMs = 3000): Promise<void> {
  const { hostname, port, protocol } = new URL(GATEWAY_URL)
  return new Promise((resolve, reject) => {
    const socket = connect({
      host: hostname,
      port: Number(port) || (protocol === 'https:' ? 443 : 80),
      timeout: timeoutMs,
    })
    const fail = () => {
      socket.destroy()
      reject(new Error(`AI gateway unreachable at ${hostname} — are you on the internal network?`))
    }
    socket.once('connect', () => {
      socket.destroy()
      resolve()
    })
    socket.once('timeout', fail)
    socket.once('error', fail)
  })
}

export type ModelId =
  | 'gemini-2.5-flash-lite'
  | 'gemini-2.5-flash'
  | 'gpt-5-nano'

export async function callModel(
  model: ModelId,
  prompt: string,
  maxTokens = 1024,
  timeoutMs?: number,
): Promise<string> {
  const res = await gateway.chat.completions.create(
    {
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
    },
    timeoutMs ? { timeout: timeoutMs, maxRetries: 0 } : undefined,
  )
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
