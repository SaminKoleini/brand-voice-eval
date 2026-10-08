import * as cheerio from 'cheerio'
import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { assertGatewayReachable, callModel } from './gateway.js'
import { tryParseJson } from './eval.js'
import { buildBrandProfilePrompt } from './prompts.js'

export type SiteProfile = {
  url: string
  name: string
  logo_url: string
  logo_candidates: string[]
  colors: string[]
  one_liners: string[]
  voice: { copy: string; hook: string; title: string } | null
  voice_error: string
}

const USER_AGENT = 'Mozilla/5.0 (compatible; brand-voice-eval/0.1)'
const FETCH_TIMEOUT_MS = 10_000
const VOICE_TIMEOUT_MS = 30_000
const MAX_HTML_BYTES = 2 * 1024 * 1024
const MAX_CSS_BYTES = 1024 * 1024
const MAX_STYLESHEETS = 4
const MAX_LOGOS = 6
const MAX_COLORS = 6
const MAX_ONE_LINERS = 6

// ---------- fetching ----------

// This fetches whatever URL it is handed, and the server listens on 0.0.0.0
// next to an internal gateway — so refuse loopback / private / link-local hosts.
const INTERNAL = new BlockList()
INTERNAL.addSubnet('0.0.0.0', 8)
INTERNAL.addSubnet('10.0.0.0', 8)
INTERNAL.addSubnet('100.64.0.0', 10)
INTERNAL.addSubnet('127.0.0.0', 8)
INTERNAL.addSubnet('169.254.0.0', 16)
INTERNAL.addSubnet('172.16.0.0', 12)
INTERNAL.addSubnet('192.168.0.0', 16)
INTERNAL.addSubnet('::', 127, 'ipv6')
INTERNAL.addSubnet('fc00::', 7, 'ipv6')
INTERNAL.addSubnet('fe80::', 10, 'ipv6')

function isHttp(url: URL): boolean {
  return url.protocol === 'http:' || url.protocol === 'https:'
}

async function assertPublic(url: URL): Promise<void> {
  if (!isHttp(url)) throw new Error('only http(s) URLs are supported')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addrs = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => {
        throw new Error(`could not resolve ${host}`)
      })
  for (const { address } of addrs) {
    if (INTERNAL.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4'))
      throw new Error(`${host} is not a public address`)
  }
}

// Redirects are followed by hand so every hop goes through assertPublic.
async function fetchText(
  start: string,
  maxBytes: number,
): Promise<{ url: string; body: string }> {
  let url = new URL(start)
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(url)
    let res: Response
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/css,*/*;q=0.8' },
      })
    } catch (err: any) {
      const why = err?.name === 'TimeoutError' ? 'timed out' : (err?.cause?.code ?? 'fetch failed')
      throw new Error(`could not reach ${url.host} (${why})`)
    }
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url)
      continue
    }
    if (!res.ok) throw new Error(`${url.host} responded ${res.status}`)

    const chunks: Uint8Array[] = []
    let size = 0
    for await (const chunk of res.body ?? []) {
      chunks.push(chunk)
      size += chunk.length
      if (size >= maxBytes) break
    }
    return { url: url.href, body: Buffer.concat(chunks).toString('utf8') }
  }
  throw new Error('too many redirects')
}

function normalizeUrl(input: string): string {
  const raw = input.trim()
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).href
  } catch {
    throw new Error('not a valid URL')
  }
}

// ---------- text ----------

type DomNode = { type: string; data?: string; name?: string; children?: DomNode[] }

const SKIP_TEXT = new Set(['script', 'style', 'noscript', 'svg', 'template', 'iframe'])

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

// cheerio's .text() glues neighbouring elements together ("HomePricing"), so
// walk the tree and put whitespace between them.
function spacedText(node: DomNode): string {
  if (node.type === 'text') return node.data ?? ''
  if (!node.children || SKIP_TEXT.has(node.name ?? '')) return ''
  return node.children.map(spacedText).join(' ')
}

function meta($: cheerio.CheerioAPI, selector: string): string {
  return clean($(selector).first().attr('content') ?? '')
}

function domainLabel(url: URL): string {
  const parts = url.hostname.replace(/^www\./, '').split('.')
  const sld = parts[parts.length - 2] ?? parts[0]
  // bbc.co.uk, example.com.au
  if (parts.length > 2 && /^(co|com|org|net|ac|gov)$/.test(sld)) return parts[parts.length - 3]
  return sld
}

function jsonLdOrg($: cheerio.CheerioAPI): { name: string; logo: string } {
  const out = { name: '', logo: '' }
  const visit = (node: any): void => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== 'object') return
    visit(node['@graph'])
    const types = [node['@type']].flat().map(String)
    if (!types.some((t) => /Organization|Corporation|Brand|LocalBusiness/.test(t))) return
    if (!out.name && typeof node.name === 'string') out.name = clean(node.name)
    const logo = typeof node.logo === 'string' ? node.logo : node.logo?.url
    if (!out.logo && typeof logo === 'string') out.logo = logo
  }
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      visit(JSON.parse($(el).text()))
    } catch {
      // malformed JSON-LD is common; ignore it
    }
  })
  return out
}

function titleParts($: cheerio.CheerioAPI): string[] {
  return $('title')
    .first()
    .text()
    .split(/\s+[|–—·-]\s+|:\s+/)
    .map(clean)
    .filter(Boolean)
}

function brandName($: cheerio.CheerioAPI, url: URL, ldName: string): string {
  const declared =
    meta($, 'meta[property="og:site_name"]') || ldName || meta($, 'meta[name="application-name"]')
  if (declared) return declared
  const label = domainLabel(url)
  // "Notion – The AI workspace" on notion.com, "Bootstrap · …" on getbootstrap.com
  const fromTitle = titleParts($).find((p) => {
    const part = p.toLowerCase().replace(/[^a-z0-9]/g, '')
    return p.split(' ').length <= 4 && part.length > 2 && (part.includes(label) || label.includes(part))
  })
  return fromTitle ?? label.charAt(0).toUpperCase() + label.slice(1)
}

function pickOneLiners(candidates: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of candidates) {
    const line = clean(raw)
    const words = line.split(' ').length
    const key = line.toLowerCase()
    if (words < 3 || words > 18 || line.length > 140 || seen.has(key)) continue
    seen.add(key)
    out.push(line)
    if (out.length === MAX_ONE_LINERS) break
  }
  return out
}

// ---------- logo ----------

function logoCandidates($: cheerio.CheerioAPI, base: URL, ldLogo: string): string[] {
  const found: string[] = []
  const add = (href: string | undefined): boolean => {
    if (!href) return false
    try {
      const u = new URL(href, base)
      if (!isHttp(u)) return false
      if (!found.includes(u.href)) found.push(u.href)
      return true
    } catch {
      return false
    }
  }
  const addImg = (el: any) => add($(el).attr('src')) || add($(el).attr('data-src'))

  add(ldLogo)

  // An image that links home, or a header image that calls itself the logo.
  // Body-wide "logo" matches are skipped (usually customer logos), and so is
  // matching on the brand name (nav menus are full of "<Brand> case study" art).
  const home = ['/', base.origin, `${base.origin}/`].map((h) => `a[href="${h}"] img`).join(', ')
  $(home).slice(0, 2).each((_, el) => void addImg(el))
  $('header img, nav img')
    .filter((_, el) => /logo/i.test(['class', 'id', 'alt', 'src'].map((a) => $(el).attr(a) ?? '').join(' ')))
    .slice(0, 2)
    .each((_, el) => void addImg(el))

  add($('link[rel="apple-touch-icon" i], link[rel="apple-touch-icon-precomposed" i]').first().attr('href'))
  $('link[rel~="icon" i]')
    .toArray()
    .map((el) => ({
      href: $(el).attr('href'),
      svg: /svg/.test(`${$(el).attr('type')} ${$(el).attr('href')}`),
      size: parseInt($(el).attr('sizes') ?? '', 10) || 0,
    }))
    .sort((a, b) => Number(b.svg) - Number(a.svg) || b.size - a.size)
    .slice(0, 2)
    .forEach((icon) => add(icon.href))
  add('/favicon.ico')
  add(meta($, 'meta[property="og:image"]'))

  return found.slice(0, MAX_LOGOS)
}

// ---------- colours ----------

type Rgb = [number, number, number]

const byte = (n: number) => Math.round(Math.min(255, Math.max(0, n)))

function hslToRgb(h: number, s: number, l: number): Rgb {
  const f = (n: number) => {
    const k = (((n + h / 30) % 12) + 12) % 12
    return byte(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}

// Tailwind v4 and friends ship their palette as oklch().
function oklchToRgb(L: number, C: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return linear.map((v) =>
    byte(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)),
  ) as Rgb
}

function parseColors(value: string): Rgb[] {
  const out: Rgb[] = []
  for (const m of value.matchAll(/#([0-9a-f]{3,8})\b/gi)) {
    let hex = m[1]
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('')
    if (hex.length !== 6 && hex.length !== 8) continue
    if (hex.length === 8 && parseInt(hex.slice(6), 16) < 128) continue
    out.push([0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb)
  }
  // [^()] keeps rgb(var(--x)) and calc() out
  for (const m of value.matchAll(/\b(rgb|hsl|oklch)a?\(([^()]+)\)/gi)) {
    const raw = m[2].split(/[\s,/]+/).filter(Boolean)
    const n = raw.map(parseFloat)
    if (n.length < 3 || n.some(Number.isNaN)) continue
    const pct = (i: number) => raw[i].endsWith('%')
    if (n.length > 3 && (pct(3) ? n[3] / 100 : n[3]) < 0.5) continue
    const fn = m[1].toLowerCase()
    if (fn === 'rgb') out.push([0, 1, 2].map((i) => byte(pct(i) ? n[i] * 2.55 : n[i])) as Rgb)
    else if (fn === 'hsl') out.push(hslToRgb(n[0], n[1] / 100, n[2] / 100))
    else out.push(oklchToRgb(pct(0) ? n[0] / 100 : n[0], pct(1) ? n[1] * 0.004 : n[1], n[2]))
  }
  return out
}

const toHex = (rgb: Rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('')

function isChromatic([r, g, b]: Rgb): boolean {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const l = (max + min) / 2
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1))
  return s > 0.25 && l > 0.12 && l < 0.9
}

const lightness = ([r, g, b]: Rgb) => (Math.max(r, g, b) + Math.min(r, g, b)) / 510

function propertyWeight(prop: string): number {
  if (prop.startsWith('--')) return /brand|primary|accent|theme/.test(prop) ? 6 : 2
  if (/^(background|fill)/.test(prop)) return 1.5
  return prop === 'color' ? 1 : 0.5
}

// Heuristic: score each colour by where and how often the CSS uses it, favour
// saturated colours over neutrals, then drop near-duplicates.
function rankColors(css: string, themeColor: string): string[] {
  const seen = new Map<string, { rgb: Rgb; score: number }>()
  const bump = (value: string, weight: number) => {
    for (const rgb of parseColors(value)) {
      const hex = toHex(rgb)
      const entry = seen.get(hex) ?? { rgb, score: 0 }
      entry.score += weight
      seen.set(hex, entry)
    }
  }
  bump(themeColor, 8)
  for (const m of css.matchAll(/(?<![\w-])([\w-]+)\s*:\s*([^;{}]+)/g)) {
    bump(m[2], propertyWeight(m[1].toLowerCase()))
  }

  const ranked = [...seen.values()]
    .filter((c) => lightness(c.rgb) < 0.96) // near-white is just the page background
    .map((c) => ({ rgb: c.rgb, score: isChromatic(c.rgb) ? c.score * 3 : c.score }))
    .sort((a, b) => b.score - a.score)

  const palette: Rgb[] = []
  for (const { rgb } of ranked) {
    if (palette.every((p) => Math.hypot(p[0] - rgb[0], p[1] - rgb[1], p[2] - rgb[2]) > 48))
      palette.push(rgb)
    if (palette.length === MAX_COLORS) break
  }
  return palette.map(toHex)
}

// ---------- voice ----------

type VoiceResult = { voice: SiteProfile['voice']; one_liners: string[]; error: string }

async function generateVoice(content: string): Promise<VoiceResult> {
  try {
    await assertGatewayReachable()
    const raw = await callModel(
      'gemini-2.5-flash',
      buildBrandProfilePrompt(content),
      2048,
      VOICE_TIMEOUT_MS,
    )
    const parsed = tryParseJson<Record<string, unknown>>(raw)
    if (!parsed) return { voice: null, one_liners: [], error: 'json_parse_failed' }
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    // Only keep one-liners that really are on the page.
    const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
    const haystack = squash(content)
    const quoted = Array.isArray(parsed.one_liners)
      ? parsed.one_liners.map(str).filter((s) => s && haystack.includes(squash(s)))
      : []
    return {
      voice: {
        copy: str(parsed.copy_instruction),
        hook: str(parsed.hook_instruction),
        title: str(parsed.title_instruction),
      },
      one_liners: quoted.slice(0, MAX_ONE_LINERS),
      error: '',
    }
  } catch (err: any) {
    return { voice: null, one_liners: [], error: err?.message ?? 'unknown_error' }
  }
}

// ---------- entry point ----------

export async function analyzeSite(input: string): Promise<SiteProfile> {
  const page = await fetchText(normalizeUrl(input), MAX_HTML_BYTES)
  const base = new URL(page.url)
  const $ = cheerio.load(page.body)

  const ld = jsonLdOrg($)
  const name = brandName($, base, ld.name)
  const logos = logoCandidates($, base, ld.logo)

  const texts = (selector: string) =>
    $(selector)
      .toArray()
      .map((el) => clean(spacedText(el)))
      .filter(Boolean)
  const h1 = texts('h1')
  const h2 = texts('h2')
  const title = clean($('title').first().text())
  const description =
    meta($, 'meta[name="description"]') || meta($, 'meta[property="og:description"]')
  const bodyText = clean($('body').toArray().map(spacedText).join(' ')).slice(0, 6000)

  const content = [
    `URL: ${base.href}`,
    `Brand: ${name}`,
    title && `Page title: ${title}`,
    description && `Meta description: ${description}`,
    `Headings:\n${[...h1, ...h2, ...texts('h3')].slice(0, 40).map((h) => `- ${h}`).join('\n')}`,
    `Page text:\n${bodyText}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const inlineCss = [
    $('style').text(),
    ...$('[style]')
      .toArray()
      .map((el) => $(el).attr('style') ?? ''),
  ].join(';')
  const sheetUrls = $('link[rel~="stylesheet" i]')
    .toArray()
    .map((el) => $(el).attr('href'))
    .filter((href): href is string => !!href)
    .slice(0, MAX_STYLESHEETS)

  const [sheets, voice] = await Promise.all([
    Promise.all(
      sheetUrls.map((href) =>
        fetchText(new URL(href, base).href, MAX_CSS_BYTES).then(
          (r) => r.body,
          () => '',
        ),
      ),
    ),
    bodyText.length < 200
      ? { voice: null, one_liners: [], error: 'not enough text on the page to infer a voice' }
      : generateVoice(content),
  ])

  const fallbackLines = pickOneLiners([
    ...h1,
    ...titleParts($).filter((p) => p !== name),
    description.split(/(?<=[.!?])\s/)[0],
    ...h2,
  ])

  return {
    url: base.href,
    name,
    logo_url: logos[0] ?? '',
    logo_candidates: logos,
    colors: rankColors([inlineCss, ...sheets].join('\n'), meta($, 'meta[name="theme-color"]')),
    one_liners: voice.one_liners.length ? voice.one_liners : fallbackLines,
    voice: voice.voice,
    voice_error: voice.error,
  }
}
