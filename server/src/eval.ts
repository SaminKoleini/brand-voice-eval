import {
  BrandVoice,
  EMPTY_VOICE,
  ENABLED_SOCIAL_PLATFORMS,
  buildAutoHookPrompt,
  buildClipTitlePrompt,
  buildSocialCopyPrompt,
} from './prompts.js'
import { callModel, callModelWithFallback } from './gateway.js'

export type SocialOutput = {
  title: string
  description: string
  hashtags: string[]
  raw: string
}

export type TitleOutput = {
  title: string
  description: string
  hashtags: string[]
  raw: string
}

export type EvalSide = {
  title: TitleOutput | { error: string }
  hook: { text: string; model: string } | { error: string }
  social: Record<string, SocialOutput | { error: string }>
}

export type EvalResult = {
  baseline: EvalSide
  brandVoice: EvalSide
  meta: {
    startedAt: number
    finishedAt: number
    durationMs: number
  }
}

function stripCodeFence(s: string): string {
  return s
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
}

function tryParseJson<T>(raw: string): T | null {
  const cleaned = stripCodeFence(raw)
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0]) as T
      } catch {
        return null
      }
    }
    return null
  }
}

function normalizeSocial(raw: string): SocialOutput | { error: string } {
  const parsed = tryParseJson<{
    title?: string
    description?: string
    hashtags?: string[]
  }>(raw)
  if (!parsed) return { error: 'json_parse_failed', ...({ raw } as any) }
  return {
    title: parsed.title ?? '',
    description: parsed.description ?? '',
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
    raw,
  }
}

async function runTitle(
  transcript: string,
  voice: BrandVoice,
): Promise<TitleOutput | { error: string }> {
  const prompt = buildClipTitlePrompt(transcript, 'English', voice)
  try {
    const { text } = await callModelWithFallback(
      'gemini-2.5-flash-lite',
      'gpt-5-nano',
      prompt,
    )
    const parsed = tryParseJson<{
      title?: string
      description?: string
      hashtags?: string[]
    }>(text)
    if (!parsed) return { error: 'json_parse_failed' }
    return {
      title: parsed.title ?? '',
      description: parsed.description ?? '',
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
      raw: text,
    }
  } catch (err: any) {
    return { error: err?.message ?? 'unknown_error' }
  }
}

async function runHook(
  transcript: string,
  voice: BrandVoice,
): Promise<{ text: string; model: string } | { error: string }> {
  const prompt = buildAutoHookPrompt(transcript, 'English', voice)
  try {
    const { text, model } = await callModelWithFallback(
      'gemini-2.5-flash-lite',
      'gpt-5-nano',
      prompt,
      200,
    )
    return { text: text.trim(), model }
  } catch (err: any) {
    return { error: err?.message ?? 'unknown_error' }
  }
}

async function runSocial(
  platform: (typeof ENABLED_SOCIAL_PLATFORMS)[number],
  transcript: string,
  voice: BrandVoice,
): Promise<SocialOutput | { error: string }> {
  const prompt = buildSocialCopyPrompt(platform, transcript, voice)
  try {
    const text = await callModel('gemini-2.5-flash', prompt)
    return normalizeSocial(text)
  } catch (err: any) {
    return { error: err?.message ?? 'unknown_error' }
  }
}

async function runSide(
  transcript: string,
  voice: BrandVoice,
): Promise<EvalSide> {
  const [title, hook, ...social] = await Promise.all([
    runTitle(transcript, voice),
    runHook(transcript, voice),
    ...ENABLED_SOCIAL_PLATFORMS.map((p) => runSocial(p, transcript, voice)),
  ])

  const socialMap: Record<string, SocialOutput | { error: string }> = {}
  ENABLED_SOCIAL_PLATFORMS.forEach((p, i) => {
    socialMap[p] = social[i]
  })

  return { title, hook, social: socialMap }
}

export async function runEval(
  transcript: string,
  voice: BrandVoice,
): Promise<EvalResult> {
  const startedAt = Date.now()
  const [baseline, brandVoice] = await Promise.all([
    runSide(transcript, EMPTY_VOICE),
    runSide(transcript, voice),
  ])
  const finishedAt = Date.now()
  return {
    baseline,
    brandVoice,
    meta: {
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
    },
  }
}
