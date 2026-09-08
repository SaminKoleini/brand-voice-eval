import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  api,
  Brand,
  Clip as ClipT,
  Comment,
  EvalRun,
  EvalSide,
  SocialOutput,
} from '../api'

const PLATFORMS = ['youtube'] as const

type Ref = {
  title?: string
  description?: string
  hashtags?: string[]
}

export default function Clip() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState<{
    clip: ClipT
    brand: Brand
    latestEval: EvalRun | null
    comments: Comment[]
  } | null>(null)
  const [running, setRunning] = useState(false)
  const [err, setErr] = useState('')
  const [newComment, setNewComment] = useState('')
  const [editingRef, setEditingRef] = useState(false)
  const [refTitle, setRefTitle] = useState('')
  const [refHook, setRefHook] = useState('')
  const [refYtDesc, setRefYtDesc] = useState('')
  const [refYtTags, setRefYtTags] = useState('')

  const load = () =>
    api
      .getClip(id)
      .then((d) => {
        setData(d)
        setRefTitle(d.clip.reference_title || '')
        setRefHook(d.clip.reference_hook || '')
        try {
          const raw = JSON.parse(d.clip.reference_social_copy || '{}')
          const yt =
            raw && typeof raw === 'object'
              ? 'title' in raw || 'description' in raw || 'hashtags' in raw
                ? raw
                : raw.youtube || {}
              : {}
          setRefYtDesc(yt.description || '')
          setRefYtTags(Array.isArray(yt.hashtags) ? yt.hashtags.join(', ') : '')
        } catch {
          setRefYtDesc('')
          setRefYtTags('')
        }
      })
      .catch((e) => setErr(String(e)))

  useEffect(() => {
    load()
  }, [id])

  const parsedRef = useMemo<Record<string, Ref>>(() => {
    if (!data) return {}
    try {
      const raw = JSON.parse(data.clip.reference_social_copy || '{}')
      if (raw && typeof raw === 'object') {
        if ('title' in raw || 'description' in raw || 'hashtags' in raw) {
          return { youtube: raw as Ref }
        }
        return raw as Record<string, Ref>
      }
      return {}
    } catch {
      return {}
    }
  }, [data])

  const runEval = async () => {
    setRunning(true)
    setErr('')
    try {
      await api.runEval(id)
      await load()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    } finally {
      setRunning(false)
    }
  }

  const submitComment = async () => {
    if (!newComment.trim()) return
    try {
      await api.addComment(id, newComment)
      setNewComment('')
      load()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    }
  }

  const deleteComment = async (cid: string) => {
    await api.deleteComment(cid)
    load()
  }

  const deleteClip = async () => {
    if (!confirm('Delete this clip?')) return
    await api.deleteClip(id)
    nav(`/brands/${data!.brand.id}`)
  }

  const saveReference = async () => {
    setErr('')
    try {
      const tags = refYtTags
        .split(',')
        .map((s) => s.trim().replace(/^#/, ''))
        .filter(Boolean)
      const ytObj: Record<string, unknown> = {}
      if (refTitle.trim()) ytObj.title = refTitle.trim()
      if (refYtDesc.trim()) ytObj.description = refYtDesc.trim()
      if (tags.length > 0) ytObj.hashtags = tags
      await api.updateClip(id, {
        reference_title: refTitle,
        reference_hook: refHook,
        reference_social_copy: JSON.stringify({ youtube: ytObj }),
      })
      setEditingRef(false)
      load()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    }
  }

  if (!data) return <p>Loading…</p>
  const { clip, brand, latestEval, comments } = data
  const results = latestEval?.results

  return (
    <div>
      <div className="crumbs">
        <Link to="/">Brands</Link> <span>·</span>{' '}
        <Link to={`/brands/${brand.id}`}>{brand.name}</Link>
      </div>

      <div
        className="row"
        style={{ justifyContent: 'space-between', marginBottom: 12 }}
      >
        <h1 className="section-title">{clip.title}</h1>
        <div className="row">
          <button className="primary" onClick={runEval} disabled={running}>
            {running ? (
              <>
                <span className="spinner" />
                Running eval…
              </>
            ) : latestEval ? (
              'Re-run eval'
            ) : (
              'Run eval'
            )}
          </button>
          <button className="danger" onClick={deleteClip}>
            Delete
          </button>
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      <div className="two-col">
        <div className="card">
          <h2>Video</h2>
          {clip.video_filename ? (
            <video
              className="video-frame"
              src={`/uploads/${clip.video_filename}`}
              controls
              preload="metadata"
            />
          ) : (
            <p style={{ color: 'var(--muted)' }}>no video uploaded</p>
          )}
        </div>
        <div className="card">
          <h2>Transcript</h2>
          <div className="transcript-box">{clip.transcript}</div>
        </div>
      </div>

      <div className="card">
        <div
          className="row"
          style={{ justifyContent: 'space-between', marginBottom: 10 }}
        >
          <h2>Reference outputs (what the brand actually posted)</h2>
          <button onClick={() => setEditingRef(!editingRef)}>
            {editingRef ? 'Cancel' : 'Edit reference'}
          </button>
        </div>
        {editingRef ? (
          <>
            <div className="field">
              <label>Reference title (shown in Clip Title + YouTube reference)</label>
              <input
                value={refTitle}
                onChange={(e) => setRefTitle(e.target.value)}
                placeholder="e.g. Getir Sent One Email to 'Inactive' Contacts—27% More Orders"
              />
            </div>
            <div className="field">
              <label>Reference hook (on-video overlay)</label>
              <input
                value={refHook}
                onChange={(e) => setRefHook(e.target.value)}
                placeholder="e.g. HE LOST HIS ARM. THEN HE WENT VIRAL."
              />
            </div>
            <div className="field">
              <label>YouTube reference description</label>
              <textarea
                rows={3}
                value={refYtDesc}
                onChange={(e) => setRefYtDesc(e.target.value)}
                placeholder="What the brand actually wrote in the YouTube description..."
              />
            </div>
            <div className="field">
              <label>YouTube reference hashtags (comma-separated, no # needed)</label>
              <input
                value={refYtTags}
                onChange={(e) => setRefYtTags(e.target.value)}
                placeholder="EmailMarketing, LeadGeneration, MarketingTips"
              />
            </div>
            <button className="primary" onClick={saveReference}>
              Save reference
            </button>
          </>
        ) : (
          <div className="three-col">
            <div>
              <h3>Title</h3>
              <p style={{ margin: 0, fontSize: 12.5 }}>
                {clip.reference_title || (
                  <em style={{ color: 'var(--muted)' }}>not set</em>
                )}
              </p>
            </div>
            <div>
              <h3>Hook</h3>
              <p style={{ margin: 0, fontSize: 12.5 }}>
                {clip.reference_hook || (
                  <em style={{ color: 'var(--muted)' }}>not set</em>
                )}
              </p>
            </div>
            <div>
              <h3>YouTube description &amp; hashtags</h3>
              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {parsedRef.youtube?.description || (
                  <em style={{ color: 'var(--muted)' }}>not set</em>
                )}
              </p>
              {parsedRef.youtube?.hashtags &&
                parsedRef.youtube.hashtags.length > 0 && (
                  <div className="cell-tags" style={{ marginTop: 6 }}>
                    {parsedRef.youtube.hashtags
                      .map((h) => (h.startsWith('#') ? h : `#${h}`))
                      .join(' ')}
                  </div>
                )}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div
          className="row"
          style={{ justifyContent: 'space-between', marginBottom: 10 }}
        >
          <h2>Eval — baseline vs. brand voice vs. reference</h2>
          {latestEval && (
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>
              last run: {new Date(latestEval.created_at).toLocaleString()} ·{' '}
              {(results!.meta.durationMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>

        {!results ? (
          <p style={{ color: 'var(--muted)' }}>
            No eval yet — click "Run eval" to fire all prompts.
          </p>
        ) : (
          <>
            <div className="eval-headers">
              <div />
              <div className="h-base">Baseline (no brand voice)</div>
              <div className="h-brand">With brand voice</div>
              <div className="h-ref">Reference (real brand)</div>
            </div>

            <EvalRow
              label="Clip Title"
              baseline={renderTitle(results.baseline.title)}
              brand={renderTitle(results.brandVoice.title)}
              reference={
                <>
                  <div className="cell-title">
                    {clip.reference_title || (
                      <span className="cell-empty">not provided</span>
                    )}
                  </div>
                </>
              }
            />

            <EvalRow
              label="Auto Hook"
              baseline={renderHook(results.baseline.hook)}
              brand={renderHook(results.brandVoice.hook)}
              reference={
                <>
                  <div className="cell-title">
                    {clip.reference_hook || (
                      <span className="cell-empty">not provided</span>
                    )}
                  </div>
                </>
              }
            />

            {PLATFORMS.map((p) => {
              const ref = parsedRef[p] ?? {}
              const merged: Ref = {
                title: ref.title || clip.reference_title || '',
                description: ref.description,
                hashtags: ref.hashtags,
              }
              return (
                <EvalRow
                  key={p}
                  label={p.charAt(0).toUpperCase() + p.slice(1)}
                  baseline={renderSocial(results.baseline.social[p])}
                  brand={renderSocial(results.brandVoice.social[p])}
                  reference={renderRefSocial(merged)}
                />
              )
            })}
          </>
        )}
      </div>

      <div className="card">
        <h2>Comments ({comments.length})</h2>
        <div className="comment-list">
          {comments.length === 0 && (
            <p style={{ color: 'var(--muted)', margin: 0 }}>
              No comments yet.
            </p>
          )}
          {comments.map((c) => (
            <div key={c.id} className="comment">
              <div className="comment-text">{c.text}</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <span className="comment-time">
                  {new Date(c.created_at).toLocaleString()}
                </span>
                <button
                  className="copy-inline"
                  onClick={() => deleteComment(c.id)}
                  style={{ color: 'var(--danger)' }}
                >
                  delete
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <textarea
            rows={2}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a note about this clip's eval…"
          />
        </div>
        <button className="primary" onClick={submitComment}>
          Add comment
        </button>
      </div>
    </div>
  )
}

function EvalRow({
  label,
  baseline,
  brand,
  reference,
}: {
  label: string
  baseline: React.ReactNode
  brand: React.ReactNode
  reference: React.ReactNode
}) {
  return (
    <div className="eval-row">
      <div className="label">{label}</div>
      <div className="eval-cell baseline">{baseline}</div>
      <div className="eval-cell brand">{brand}</div>
      <div className="eval-cell reference">{reference}</div>
    </div>
  )
}

function renderTitle(t: EvalSide['title']) {
  if ('error' in t) return <span className="cell-empty">error: {t.error}</span>
  const hasExtras =
    (t.description && t.description.trim()) ||
    (t.hashtags && t.hashtags.length > 0)
  return (
    <>
      <div className="cell-title">
        {t.title || <span className="cell-empty">(empty)</span>}
      </div>
      {hasExtras && (
        <details className="raw">
          <summary>+ description &amp; hashtags (from same prompt)</summary>
          {t.description && (
            <div className="cell-desc" style={{ marginTop: 6 }}>
              {t.description}
            </div>
          )}
          {t.hashtags && t.hashtags.length > 0 && (
            <div className="cell-tags">
              {t.hashtags
                .map((h) => (h.startsWith('#') ? h : `#${h}`))
                .join(' ')}
            </div>
          )}
        </details>
      )}
    </>
  )
}

function renderHook(h: EvalSide['hook']) {
  if ('error' in h) return <span className="cell-empty">error: {h.error}</span>
  return (
    <>
      <div className="cell-title">
        {h.text || <span className="cell-empty">(empty — model couldn't generate)</span>}
      </div>
      {h.text && (
        <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
          {h.text.length} chars · model: {h.model}
        </div>
      )}
    </>
  )
}

function renderSocial(s: SocialOutput | { error: string } | undefined) {
  if (!s) return <span className="cell-empty">not run</span>
  if ('error' in s) return <span className="cell-empty">error: {s.error}</span>
  return (
    <>
      {s.title && <div className="cell-title">{s.title}</div>}
      <div className="cell-desc">{s.description || <span className="cell-empty">(empty)</span>}</div>
      {s.hashtags?.length > 0 && (
        <div className="cell-tags">
          {s.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
        </div>
      )}
    </>
  )
}

function renderRefSocial(r: Ref | undefined) {
  if (!r || (!r.title && !r.description && !r.hashtags?.length)) {
    return <span className="cell-empty">not provided</span>
  }
  return (
    <>
      {r.title && <div className="cell-title">{r.title}</div>}
      {r.description && <div className="cell-desc">{r.description}</div>}
      {r.hashtags && r.hashtags.length > 0 && (
        <div className="cell-tags">
          {r.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
        </div>
      )}
    </>
  )
}
