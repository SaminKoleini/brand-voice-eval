import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, Brand } from '../api'

export default function Home() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [copy, setCopy] = useState('')
  const [hook, setHook] = useState('')
  const [title, setTitle] = useState('')
  const [err, setErr] = useState('')

  const load = () => api.listBrands().then(setBrands).catch((e) => setErr(String(e)))

  useEffect(() => {
    load()
  }, [])

  const submit = async () => {
    if (!name.trim()) return
    try {
      await api.createBrand({
        name,
        copy_instruction: copy,
        hook_instruction: hook,
        title_instruction: title,
      })
      setName('')
      setCopy('')
      setHook('')
      setTitle('')
      setCreating(false)
      load()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    }
  }

  return (
    <div>
      <h1 className="section-title">Brands</h1>
      <p className="section-sub">
        Each brand has its own voice (copy, hook, title style) and a set of golden
        clips to test against.
      </p>

      {err && <div className="error">{err}</div>}

      <div className="row" style={{ marginBottom: 16 }}>
        <button className="primary" onClick={() => setCreating(!creating)}>
          {creating ? 'Cancel' : '+ New brand'}
        </button>
      </div>

      {creating && (
        <div className="card">
          <h2>New brand</h2>
          <div className="field">
            <label>Brand name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Diary of a CEO"
            />
          </div>
          <div className="field">
            <label>Copy style (social copy)</label>
            <textarea
              value={copy}
              onChange={(e) => setCopy(e.target.value)}
              placeholder='Format: Keep the caption under 15 words, using a short hook followed by a clear CTA.&#10;Tone: Playful, witty tone...&#10;Hashtags: Always start with #survivorstory, #podcastclips...'
              rows={6}
            />
          </div>
          <div className="field">
            <label>Hook style (auto-hook overlay)</label>
            <textarea
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              placeholder="ALL CAPS. Two lines max, a bold claim or question — never a full sentence."
              rows={3}
            />
          </div>
          <div className="field">
            <label>Title style (video/post titles)</label>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='Name + surprising outcome, separated by a colon (e.g. "Person: Outcome").'
              rows={3}
            />
          </div>
          <button className="primary" onClick={submit}>
            Create brand
          </button>
        </div>
      )}

      {brands.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            No brands yet — click "+ New brand" to get started.
          </p>
        </div>
      ) : (
        <div className="grid-brands">
          {brands.map((b) => (
            <Link
              key={b.id}
              to={`/brands/${b.id}`}
              className="brand-card"
              style={{ display: 'block' }}
            >
              <h3>{b.name}</h3>
              <div className="meta">
                {b.clip_count ?? 0} clip{(b.clip_count ?? 0) === 1 ? '' : 's'}
                {' · '}
                {b.copy_instruction ? '✓ copy' : '· no copy'}
                {' · '}
                {b.hook_instruction ? '✓ hook' : '· no hook'}
                {' · '}
                {b.title_instruction ? '✓ title' : '· no title'}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
