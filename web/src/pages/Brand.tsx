import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, Brand as BrandT, ClipSummary } from '../api'

export default function Brand() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [brand, setBrand] = useState<(BrandT & { clips: ClipSummary[] }) | null>(
    null,
  )
  const [editing, setEditing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')

  const [copy, setCopy] = useState('')
  const [hook, setHook] = useState('')
  const [title, setTitle] = useState('')
  const [name, setName] = useState('')

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
        setName(b.name)
        setCopy(b.copy_instruction)
        setHook(b.hook_instruction)
        setTitle(b.title_instruction)
      })
      .catch((e) => setErr(String(e)))

  useEffect(() => {
    load()
  }, [id])

  const saveVoice = async () => {
    try {
      await api.updateBrand(id, {
        name,
        copy_instruction: copy,
        hook_instruction: hook,
        title_instruction: title,
      })
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
      <div className="crumbs">
        <Link to="/">← Brands</Link>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1 className="section-title">{brand.name}</h1>
          <p className="section-sub">
            {brand.clips.length} clip{brand.clips.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="row">
          <button onClick={() => setEditing(!editing)}>
            {editing ? 'Cancel' : 'Edit voice'}
          </button>
          <button className="danger" onClick={deleteBrand}>
            Delete brand
          </button>
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      {editing ? (
        <div className="card">
          <h2>Brand voice</h2>
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Copy style</label>
            <textarea
              rows={5}
              value={copy}
              onChange={(e) => setCopy(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Hook style</label>
            <textarea
              rows={3}
              value={hook}
              onChange={(e) => setHook(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Title style</label>
            <textarea
              rows={3}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <button className="primary" onClick={saveVoice}>
            Save
          </button>
        </div>
      ) : (
        <div className="card">
          <h2>Brand voice</h2>
          <div className="three-col">
            <div>
              <h3>Copy style</h3>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12.5 }}>
                {brand.copy_instruction || <em style={{ color: 'var(--muted)' }}>not set</em>}
              </p>
            </div>
            <div>
              <h3>Hook style</h3>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12.5 }}>
                {brand.hook_instruction || <em style={{ color: 'var(--muted)' }}>not set</em>}
              </p>
            </div>
            <div>
              <h3>Title style</h3>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12.5 }}>
                {brand.title_instruction || <em style={{ color: 'var(--muted)' }}>not set</em>}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Add golden clip</h2>
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: -6 }}>
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

      <h2 className="section-title" style={{ fontSize: 16, marginTop: 24 }}>
        Clips
      </h2>
      {brand.clips.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No clips yet.</p>
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
