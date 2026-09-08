export type Brand = {
  id: string
  name: string
  copy_instruction: string
  hook_instruction: string
  title_instruction: string
  created_at: number
  clip_count?: number
}

export type ClipSummary = {
  id: string
  title: string
  video_filename: string | null
  transcript_len: number
  created_at: number
}

export type Clip = {
  id: string
  brand_id: string
  title: string
  transcript: string
  video_filename: string | null
  reference_title: string
  reference_hook: string
  reference_social_copy: string
  created_at: number
}

export type Comment = {
  id: string
  clip_id: string
  text: string
  created_at: number
}

export type SocialOutput = {
  title: string
  description: string
  hashtags: string[]
  raw?: string
}

export type EvalSide = {
  title: { title: string; description: string; hashtags: string[] } | { error: string }
  hook: { text: string; model: string } | { error: string }
  social: Record<string, SocialOutput | { error: string }>
}

export type EvalResult = {
  baseline: EvalSide
  brandVoice: EvalSide
  meta: { startedAt: number; finishedAt: number; durationMs: number }
}

export type EvalRun = {
  id: string
  created_at: number
  results: EvalResult
}

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${res.status} ${body}`)
  }
  return res.json()
}

export const api = {
  listBrands: () => fetch('/api/brands').then(j<Brand[]>),
  getBrand: (id: string) =>
    fetch(`/api/brands/${id}`).then(j<Brand & { clips: ClipSummary[] }>),
  createBrand: (body: Partial<Brand>) =>
    fetch('/api/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j<Brand>),
  updateBrand: (id: string, body: Partial<Brand>) =>
    fetch(`/api/brands/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j<Brand>),
  deleteBrand: (id: string) =>
    fetch(`/api/brands/${id}`, { method: 'DELETE' }).then(j),

  createClip: (brandId: string, form: FormData) =>
    fetch(`/api/brands/${brandId}/clips`, {
      method: 'POST',
      body: form,
    }).then(j<Clip>),

  getClip: (id: string) =>
    fetch(`/api/clips/${id}`).then(
      j<{
        clip: Clip
        brand: Brand
        latestEval: EvalRun | null
        comments: Comment[]
      }>,
    ),
  updateClip: (id: string, body: Partial<Clip>) =>
    fetch(`/api/clips/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(j<Clip>),
  deleteClip: (id: string) =>
    fetch(`/api/clips/${id}`, { method: 'DELETE' }).then(j),
  runEval: (id: string) =>
    fetch(`/api/clips/${id}/eval`, { method: 'POST' }).then(j<EvalRun>),

  listComments: (id: string) =>
    fetch(`/api/clips/${id}/comments`).then(j<Comment[]>),
  addComment: (id: string, text: string) =>
    fetch(`/api/clips/${id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).then(j<Comment>),
  deleteComment: (id: string) =>
    fetch(`/api/comments/${id}`, { method: 'DELETE' }).then(j),
}
