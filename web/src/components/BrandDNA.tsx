import { Dispatch, ReactNode, SetStateAction, useEffect, useRef, useState } from 'react'
import { api, Brand, parseList } from '../api'

// Everything the brand forms edit, in one object. logoOptions holds the
// candidates from the last website import and is never saved.
export type BrandDraft = {
  name: string
  copy: string
  hook: string
  title: string
  website: string
  logo: string
  logoOptions: string[]
  colors: string[]
  oneLiners: string[]
}

type SetDraft = Dispatch<SetStateAction<BrandDraft>>

export const EMPTY_DRAFT: BrandDraft = {
  name: '',
  copy: '',
  hook: '',
  title: '',
  website: '',
  logo: '',
  logoOptions: [],
  colors: [],
  oneLiners: [],
}

export function draftFromBrand(b: Brand): BrandDraft {
  return {
    name: b.name,
    copy: b.copy_instruction ?? '',
    hook: b.hook_instruction ?? '',
    title: b.title_instruction ?? '',
    website: b.website_url ?? '',
    logo: b.logo_url ?? '',
    logoOptions: [],
    colors: parseList(b.colors),
    oneLiners: parseList(b.one_liners),
  }
}

export function draftToBody(d: BrandDraft): Partial<Brand> {
  const website = d.website.trim()
  return {
    name: d.name.trim(),
    copy_instruction: d.copy,
    hook_instruction: d.hook,
    title_instruction: d.title,
    // the server only stores absolute http(s) URLs
    website_url: website && !/^https?:\/\//i.test(website) ? `https://${website}` : website,
    logo_url: d.logo.trim(),
    colors: JSON.stringify(d.colors),
    one_liners: JSON.stringify(d.oneLiners.map((l) => l.trim()).filter(Boolean)),
  }
}

const host = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

// ---------- website import ----------

type Note = { kind: 'ok' | 'warn' | 'error'; text: string }

export function useSiteImport(onDraft: SetDraft) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note | null>(null)
  // The name the last import filled in: a re-run may replace that, but never
  // a name the user typed.
  const importedName = useRef('')

  const run = async (url: string): Promise<boolean> => {
    if (!url.trim() || busy) return false
    setBusy(true)
    setNote(null)
    try {
      const p = await api.analyzeSite(url)
      const previous = importedName.current
      importedName.current = p.name
      onDraft((d) => ({
        ...d,
        name: !d.name.trim() || d.name === previous ? p.name : d.name,
        website: p.url,
        logo: p.logo_url,
        logoOptions: p.logo_candidates,
        colors: p.colors,
        oneLiners: p.one_liners,
        copy: p.voice?.copy || d.copy,
        hook: p.voice?.hook || d.hook,
        title: p.voice?.title || d.title,
      }))
      setNote(
        p.voice
          ? { kind: 'ok', text: `Pulled from ${host(p.url)}. Tweak anything, then save.` }
          : {
              kind: 'warn',
              text: `Logo, colours and one-liners are in from ${host(p.url)}. The voice cards still need writing — ${p.voice_error}`,
            },
      )
      return true
    } catch (e: any) {
      setNote({ kind: 'error', text: String(e?.message ?? e) })
      return false
    } finally {
      setBusy(false)
    }
  }

  return { busy, note, run, clearNote: () => setNote(null) }
}

export function UrlBar({
  value,
  onChange,
  onSubmit,
  busy,
  label,
  big,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  busy: boolean
  label: string
  big?: boolean
}) {
  return (
    <div className={`url-bar${big ? ' big' : ''}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        placeholder="Paste a website — e.g. yourbrand.com"
        aria-label="Website"
        spellCheck={false}
        autoCapitalize="off"
      />
      <button className="primary" onClick={onSubmit} disabled={busy || !value.trim()}>
        {busy ? <><span className="spinner" />Reading…</> : label}
      </button>
    </div>
  )
}

export function ImportNote({ note }: { note: Note | null }) {
  if (!note) return null
  const className = note.kind === 'error' ? 'error' : note.kind === 'warn' ? 'note warn' : 'note'
  return <div className={`${className} url-status`}>{note.text}</div>
}

const STEPS = [
  'Reading the site',
  'Looking for the logo',
  'Sampling the palette',
  'Collecting one-liners',
  'Listening to the voice',
]

export function BentoSkeleton() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1100)
    return () => clearInterval(timer)
  }, [])

  return (
    <div aria-live="polite">
      <p className="loading-line">
        <i />
        <span key={step}>{STEPS[step]}…</span>
      </p>
      <div className="bento" aria-hidden>
        {['span-5', 'span-7', 'span-7', 'span-5', 'span-6', 'span-6'].map((span, i) => (
          <div key={i} className={`tile skeleton ${span}`}>
            <div className="bone" style={{ width: '28%' }} />
            <div className="bone" style={{ width: '82%' }} />
            <div className="bone" style={{ width: '56%' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- pieces ----------

export function Logo({ src, name, size = 56 }: { src: string; name: string; size?: number }) {
  const [brokenSrc, setBrokenSrc] = useState('')
  const box = { width: size, height: size }
  if (!src || brokenSrc === src)
    return (
      <span className="logo-tile monogram" style={{ ...box, fontSize: size * 0.52 }}>
        {name.trim().charAt(0).toUpperCase() || '✦'}
      </span>
    )
  return (
    <span className="logo-tile" style={box}>
      <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBrokenSrc(src)} />
    </span>
  )
}

function CopyablePalette({ colors }: { colors: string[] }) {
  const [copied, setCopied] = useState('')
  const copy = (hex: string) =>
    navigator.clipboard?.writeText(hex).then(
      () => {
        setCopied(hex)
        setTimeout(() => setCopied(''), 1200)
      },
      () => {},
    )
  return (
    <div className="palette">
      {colors.map((hex, i) => (
        <button key={`${hex}-${i}`} className="color" title="Copy hex" onClick={() => copy(hex)}>
          <i style={{ background: hex }} />
          {copied === hex ? 'copied' : hex}
        </button>
      ))}
    </div>
  )
}

// Adds on Enter, and on blur so a half-typed entry isn't lost when the user
// goes straight for Save. onAdd returns false to keep the text (invalid input).
function AddInput({
  placeholder,
  onAdd,
}: {
  placeholder: string
  onAdd: (value: string) => boolean
}) {
  const [value, setValue] = useState('')
  const submit = () => {
    if (value.trim() && onAdd(value.trim())) setValue('')
  }
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && submit()}
      onBlur={submit}
      placeholder={placeholder}
    />
  )
}

function VoiceTile({
  span,
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  span: string
  label: string
  hint: string
  value: string
  onChange?: (value: string) => void
  placeholder: string
}) {
  return (
    <section className={`tile ${span}`}>
      <h3 className="tile-label">
        {label}
        <small>{hint}</small>
      </h3>
      {onChange ? (
        <textarea
          className="voice-text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
        />
      ) : value ? (
        <p className="voice-text">{value}</p>
      ) : (
        <p className="empty">Not set yet.</p>
      )}
    </section>
  )
}

// ---------- the card grid ----------

// One layout for both modes: pass onDraft to make every card editable, leave
// it out for the read-only view.
export function BrandBento({
  draft,
  onDraft,
  meta,
}: {
  draft: BrandDraft
  onDraft?: SetDraft
  meta?: ReactNode
}) {
  const set = (patch: Partial<BrandDraft>) => onDraft?.((d) => ({ ...d, ...patch }))

  // A candidate that won't load is dropped; if it was the chosen one, fall
  // through to the next. A saved logo is never cleared by a failed load.
  const dropLogoOption = (url: string) =>
    onDraft?.((d) => {
      const rest = d.logoOptions.filter((o) => o !== url)
      return { ...d, logoOptions: rest, logo: d.logo === url && rest[0] ? rest[0] : d.logo }
    })

  const addColor = (raw: string) => {
    const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
    if (!match) return false
    const hex = `#${match[1].toLowerCase()}`
    if (!draft.colors.includes(hex)) set({ colors: [...draft.colors, hex] })
    return true
  }

  return (
    <div className="bento">
      <section className="tile span-5">
        <h3 className="tile-label">Identity</h3>
        <div className="identity">
          <Logo src={draft.logo} name={draft.name} size={84} />
          <div>
            {onDraft ? (
              <textarea
                className="brand-name"
                rows={1}
                value={draft.name}
                onChange={(e) => set({ name: e.target.value.replace(/\n/g, ' ') })}
                placeholder="Brand name"
                aria-label="Brand name"
              />
            ) : (
              <h1 className="brand-name">{draft.name}</h1>
            )}
            {draft.website && (
              <a className="pill" href={draft.website} target="_blank" rel="noreferrer">
                {host(draft.website)} ↗
              </a>
            )}
            {meta}
          </div>
        </div>
        {onDraft && (
          <>
            {draft.logoOptions.length > 1 && (
              <div className="logo-options">
                {draft.logoOptions.map((url) => (
                  <button
                    key={url}
                    type="button"
                    className={`logo-tile${draft.logo === url ? ' selected' : ''}`}
                    style={{ width: 46, height: 46 }}
                    title="Use this logo"
                    onClick={() => set({ logo: url })}
                  >
                    <img src={url} alt="" referrerPolicy="no-referrer" onError={() => dropLogoOption(url)} />
                  </button>
                ))}
              </div>
            )}
            <input
              value={draft.logo}
              onChange={(e) => set({ logo: e.target.value })}
              placeholder="Logo image URL"
              aria-label="Logo image URL"
            />
          </>
        )}
      </section>

      <section className="tile span-7">
        <h3 className="tile-label">
          Colours
          {!onDraft && draft.colors.length > 0 && <small>click to copy</small>}
        </h3>
        {draft.colors.length === 0 && <p className="empty">No colours yet.</p>}
        {onDraft ? (
          <>
            <div className="palette">
              {draft.colors.map((hex, i) => (
                <span key={`${hex}-${i}`} className="color">
                  <i style={{ background: hex }} />
                  {hex}
                  <button
                    className="remove"
                    aria-label={`Remove ${hex}`}
                    onClick={() => set({ colors: draft.colors.filter((c) => c !== hex) })}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <AddInput placeholder="Add a hex and press Enter — e.g. #c1cd7d" onAdd={addColor} />
          </>
        ) : (
          <CopyablePalette colors={draft.colors} />
        )}
      </section>

      {/* lime only when there is something to show off — an empty lime slab just looks broken */}
      <section className={`tile span-7${draft.oneLiners.length ? ' accent' : ''}`}>
        <h3 className="tile-label">One-liners</h3>
        {draft.oneLiners.length === 0 && <p className="empty">No one-liners yet.</p>}
        <ul className="quotes">
          {draft.oneLiners.map((line, i) => (
            <li key={i}>
              <span>“{line}”</span>
              {onDraft && (
                <button
                  className="remove"
                  aria-label="Remove one-liner"
                  onClick={() => set({ oneLiners: draft.oneLiners.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        {onDraft && (
          <AddInput
            placeholder="Add a tagline or selling point and press Enter"
            onAdd={(line) => {
              set({ oneLiners: [...draft.oneLiners, line] })
              return true
            }}
          />
        )}
      </section>

      <VoiceTile
        span="span-5"
        label="Copy style"
        hint="social captions"
        value={draft.copy}
        onChange={onDraft && ((copy) => set({ copy }))}
        placeholder={'Format: Under 15 words — a short hook, then a clear CTA.\nTone: Playful, witty…\nHashtags: Always start with #podcastclips…'}
      />
      <VoiceTile
        span="span-6"
        label="Hook style"
        hint="on-video overlay"
        value={draft.hook}
        onChange={onDraft && ((hook) => set({ hook }))}
        placeholder="ALL CAPS. Two lines max, a bold claim or question — never a full sentence."
      />
      <VoiceTile
        span="span-6"
        label="Title style"
        hint="video / post titles"
        value={draft.title}
        onChange={onDraft && ((title) => set({ title }))}
        placeholder={'Name + surprising outcome, separated by a colon (e.g. "Person: Outcome").'}
      />
    </div>
  )
}

export function ActionBar({ hint, children }: { hint: string; children: ReactNode }) {
  return (
    <div className="action-bar">
      <span>{hint}</span>
      <div className="row" style={{ gap: 8 }}>
        {children}
      </div>
    </div>
  )
}
