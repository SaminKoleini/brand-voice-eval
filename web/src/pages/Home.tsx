import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, Brand, parseList } from '../api'
import {
  ActionBar,
  BentoSkeleton,
  BrandBento,
  EMPTY_DRAFT,
  ImportNote,
  Logo,
  UrlBar,
  draftToBody,
  useSiteImport,
} from '../components/BrandDNA'

export default function Home() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const importer = useSiteImport(setDraft)
  const editorRef = useRef<HTMLDivElement>(null)

  const load = () => api.listBrands().then(setBrands).catch((e) => setErr(String(e)))

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (creating) editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [creating])

  const generate = async () => {
    if (!draft.website.trim()) return
    const wasCreating = creating
    setCreating(true)
    const ok = await importer.run(draft.website)
    // a failed first import shouldn't leave an empty editor behind
    if (!ok && !wasCreating) setCreating(false)
  }

  const reset = () => {
    setDraft(EMPTY_DRAFT)
    importer.clearNote()
    setCreating(false)
  }

  const startBlank = () => {
    importer.clearNote()
    setCreating(true)
  }

  const submit = async () => {
    if (!draft.name.trim()) return
    setSaving(true)
    try {
      await api.createBrand(draftToBody(draft))
      reset()
      load()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <section className="hero">
        <h1>
          Capture any brand’s <em>voice</em>
        </h1>
        <p>
          Paste a website to pull its logo, colours, one-liners and writing style — then test
          your prompts against it.
        </p>
        <UrlBar
          big
          value={draft.website}
          onChange={(website) => setDraft((d) => ({ ...d, website }))}
          onSubmit={generate}
          busy={importer.busy}
          label="✦ Generate brand DNA"
        />
        <ImportNote note={importer.note} />
        {!creating && (
          <button className="quiet" style={{ marginTop: 14 }} onClick={startBlank}>
            or start from scratch
          </button>
        )}
      </section>

      {err && <div className="error">{err}</div>}

      {creating && (
        <div ref={editorRef} style={{ scrollMarginTop: 76 }}>
          {importer.busy ? (
            <BentoSkeleton />
          ) : (
            <>
              <BrandBento draft={draft} onDraft={setDraft} />
              <ActionBar
                hint={draft.name.trim() ? `Looking good, ${draft.name}?` : 'Name the brand to save it'}
              >
                <button onClick={reset}>Discard</button>
                <button className="primary" onClick={submit} disabled={!draft.name.trim() || saving}>
                  Create brand
                </button>
              </ActionBar>
            </>
          )}
        </div>
      )}

      <div className="row spread" style={{ margin: '44px 0 16px' }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          Your brands
        </h2>
        <span className="pill" style={{ margin: 0 }}>
          {brands.length} brand{brands.length === 1 ? '' : 's'}
        </span>
      </div>

      {brands.length === 0 ? (
        <div className="card">
          <p className="empty">No brands yet — paste a website above to create your first.</p>
        </div>
      ) : (
        <div className="grid-brands">
          {brands.map((b, i) => {
            const tagline = parseList(b.one_liners)[0]
            const clips = b.clip_count ?? 0
            return (
              <Link
                key={b.id}
                to={`/brands/${b.id}`}
                className="brand-card"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="band">
                  {parseList(b.colors).map((hex, j) => (
                    <i key={j} style={{ background: hex }} />
                  ))}
                </div>
                <div className="brand-card-body">
                  <Logo src={b.logo_url} name={b.name} size={52} />
                  <h3>{b.name}</h3>
                  <p className="tagline">{tagline ? `“${tagline}”` : 'No one-liners yet'}</p>
                  <div className="meta">
                    <span className="pill">
                      {clips} clip{clips === 1 ? '' : 's'}
                    </span>
                    {(
                      [
                        ['copy', b.copy_instruction],
                        ['hook', b.hook_instruction],
                        ['title', b.title_instruction],
                      ] as const
                    ).map(([label, value]) => (
                      <span key={label} className={`pill${value ? ' on' : ''}`}>
                        {value ? '✓ ' : ''}
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
