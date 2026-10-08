import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, Brand as BrandT, ClipSummary } from '../api'
import {
  ActionBar,
  BentoSkeleton,
  BrandBento,
  EMPTY_DRAFT,
  ImportNote,
  UrlBar,
  draftFromBrand,
  draftToBody,
  useSiteImport,
} from '../components/BrandDNA'

export default function Brand() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [brand, setBrand] = useState<(BrandT & { clips: ClipSummary[] }) | null>(
    null,
  )
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const importer = useSiteImport(setDraft)

  const [clipTitle, setClipTitle] = useState('')
  const [transcript, setTranscript] = useState('')
  const [refTitle, setRefTitle] = useState('')
  const [refHook, setRefHook] = useState('')
  const [refCopy, setRefCopy] = useState('')
  const [video, setVideo] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () =>
    api
      .getBrand(id)
      .then((b) => {
        setBrand(b)
        setDraft(draftFromBrand(b))
      })
      .catch((e) => setErr(String(e)))

  useEffect(() => {
    load()
  }, [id])

  // Cancel reloads so a generated-but-unsaved draft doesn't linger in the form.
  const toggleEditing = () => {
    if (editing) load()
    importer.clearNote()
    setEditing(!editing)
  }

  const saveBrand = async () => {
    try {
      await api.updateBrand(id, draftToBody(draft))
      importer.clearNote()
      setEditing(false)
      load()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    }
  }

  const submitClip = async () => {
    if (!clipTitle.trim() || !transcript.trim()) {
      setErr('title and transcript are required')
      return
    }
    setUploading(true)
    setErr('')
    try {
      const form = new FormData()
      form.append('title', clipTitle)
      form.append('transcript', transcript)
      form.append('reference_title', refTitle)
      form.append('reference_hook', refHook)
      form.append('reference_social_copy', refCopy || '{}')
      if (video) form.append('video', video)
      await api.createClip(id, form)
      setClipTitle('')
      setTranscript('')
      setRefTitle('')
      setRefHook('')
      setRefCopy('')
      setVideo(null)
      if (fileRef.current) fileRef.current.value = ''
      setAdding(false)
      load()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    } finally {
      setUploading(false)
    }
  }

  const deleteBrand = async () => {
    if (!confirm('Delete this brand and all its clips?')) return
    await api.deleteBrand(id)
    nav('/')
  }

  if (!brand) return <p>Loading…</p>

  return (
    <div>
      <div className="row spread" style={{ marginBottom: 18 }}>
        <div className="crumbs" style={{ margin: 0 }}>
          <Link to="/">← Brands</Link>
        </div>
        {!editing && (
          <div className="row" style={{ gap: 8 }}>
            <button onClick={toggleEditing}>Edit brand</button>
            <button className="danger" onClick={deleteBrand}>
              Delete brand
            </button>
          </div>
        )}
      </div>

      {err && <div className="error">{err}</div>}

      {editing ? (
        <>
          <div style={{ marginBottom: 16 }}>
            <UrlBar
              value={draft.website}
              onChange={(website) => setDraft((d) => ({ ...d, website }))}
              onSubmit={() => importer.run(draft.website)}
              busy={importer.busy}
              label="↻ Refresh from website"
            />
            <ImportNote note={importer.note} />
          </div>
          {importer.busy ? (
            <BentoSkeleton />
          ) : (
            <>
              <BrandBento draft={draft} onDraft={setDraft} />
              <ActionBar hint="Nothing is saved until you hit save">
                <button onClick={toggleEditing}>Cancel</button>
                <button className="primary" onClick={saveBrand} disabled={!draft.name.trim()}>
                  Save changes
                </button>
              </ActionBar>
            </>
          )}
        </>
      ) : (
        <BrandBento
          draft={draft}
          meta={
            <span className="pill">
              {brand.clips.length} clip{brand.clips.length === 1 ? '' : 's'}
            </span>
          }
        />
      )}

      <div className="row spread" style={{ margin: '44px 0 16px' }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          Golden clips
        </h2>
        <button className={adding ? '' : 'primary'} onClick={() => setAdding(!adding)}>
          {adding ? 'Close' : '+ Add clip'}
        </button>
      </div>

      {adding && (
        <div className="card" style={{ animation: 'rise 0.4s var(--ease) both' }}>
          <h2>Add golden clip</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: -6 }}>
            Video is stored for viewing only — the transcript is what gets sent to
            the LLM. Reference outputs are what the brand actually posted, for
            side-by-side comparison.
          </p>
          <div className="field">
            <label>Clip title (your label)</label>
            <input
              value={clipTitle}
              onChange={(e) => setClipTitle(e.target.value)}
              placeholder="e.g. Alex Lewis — surviving then thriving"
            />
          </div>
          <div className="field">
            <label>Video file (optional, mp4)</label>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="field">
            <label>Transcript (required)</label>
            <textarea
              rows={6}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste the transcript here…"
            />
          </div>
          <div className="two-col">
            <div className="field">
              <label>Reference title (what the brand actually used)</label>
              <input
                value={refTitle}
                onChange={(e) => setRefTitle(e.target.value)}
                placeholder="e.g. Alex Lewis: Surviving Then Thriving"
              />
            </div>
            <div className="field">
              <label>Reference hook (on-video overlay text)</label>
              <input
                value={refHook}
                onChange={(e) => setRefHook(e.target.value)}
                placeholder="e.g. HE LOST HIS ARM. THEN HE WENT VIRAL."
              />
            </div>
          </div>
          <div className="field">
            <label>
              YouTube reference (JSON, optional — you can also add/edit this on the
              clip page later)
            </label>
            <textarea
              rows={4}
              value={refCopy}
              onChange={(e) => setRefCopy(e.target.value)}
              placeholder={
                '{"title":"...","description":"...","hashtags":["EmailMarketing"]}\n\nOr platform-keyed:\n{"youtube":{"title":"...","description":"...","hashtags":[]}}'
              }
            />
          </div>
          <button className="primary" onClick={submitClip} disabled={uploading}>
            {uploading ? <><span className="spinner" />Uploading…</> : 'Add clip'}
          </button>
        </div>
      )}

      {brand.clips.length === 0 ? (
        !adding && (
          <div className="card">
            <p className="empty">
              No clips yet — add a transcript and what the brand actually posted to start comparing.
            </p>
          </div>
        )
      ) : (
        <div className="clip-list">
          {brand.clips.map((c) => (
            <Link key={c.id} to={`/clips/${c.id}`} className="clip-card">
              {c.video_filename ? (
                <video className="clip-thumb" src={`/uploads/${c.video_filename}`} preload="metadata" muted />
              ) : (
                <div className="clip-thumb-placeholder">no video</div>
              )}
              <div className="clip-meta">
                <h4>{c.title}</h4>
                <div className="m">{c.transcript_len} chars · click to open</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
