import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'
import { mkdirSync, createWriteStream, existsSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { db, nowId } from './db.js'
import { runEval } from './eval.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = join(__dirname, '..', 'uploads')
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true })

const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 * 1024 })

await app.register(cors, { origin: true })
await app.register(multipart, {
  limits: { fileSize: 1024 * 1024 * 512 },
})
await app.register(fastifyStatic, {
  root: UPLOAD_DIR,
  prefix: '/uploads/',
  decorateReply: false,
})

type Brand = {
  id: string
  name: string
  copy_instruction: string
  hook_instruction: string
  title_instruction: string
  created_at: number
}

type Clip = {
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

app.get('/api/health', async () => ({ ok: true }))

app.get('/api/brands', async () => {
  const rows = db
    .prepare(
      'SELECT b.*, (SELECT COUNT(*) FROM clips WHERE brand_id = b.id) AS clip_count FROM brands b ORDER BY created_at DESC',
    )
    .all()
  return rows
})

app.post('/api/brands', async (req, reply) => {
  const body = req.body as Partial<Brand>
  if (!body.name?.trim()) return reply.code(400).send({ error: 'name required' })
  const id = nowId()
  db.prepare(
    `INSERT INTO brands (id, name, copy_instruction, hook_instruction, title_instruction, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    body.name.trim(),
    body.copy_instruction ?? '',
    body.hook_instruction ?? '',
    body.title_instruction ?? '',
    Date.now(),
  )
  return db.prepare('SELECT * FROM brands WHERE id = ?').get(id)
})

app.get('/api/brands/:id', async (req, reply) => {
  const { id } = req.params as { id: string }
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(id) as
    | Brand
    | undefined
  if (!brand) return reply.code(404).send({ error: 'not_found' })
  const clips = db
    .prepare(
      'SELECT id, title, video_filename, created_at, LENGTH(transcript) AS transcript_len FROM clips WHERE brand_id = ? ORDER BY created_at DESC',
    )
    .all(id)
  return { ...brand, clips }
})

app.put('/api/brands/:id', async (req, reply) => {
  const { id } = req.params as { id: string }
  const body = req.body as Partial<Brand>
  const existing = db.prepare('SELECT * FROM brands WHERE id = ?').get(id) as
    | Brand
    | undefined
  if (!existing) return reply.code(404).send({ error: 'not_found' })
  db.prepare(
    `UPDATE brands SET
      name = ?,
      copy_instruction = ?,
      hook_instruction = ?,
      title_instruction = ?
     WHERE id = ?`,
  ).run(
    body.name ?? existing.name,
    body.copy_instruction ?? existing.copy_instruction,
    body.hook_instruction ?? existing.hook_instruction,
    body.title_instruction ?? existing.title_instruction,
    id,
  )
  return db.prepare('SELECT * FROM brands WHERE id = ?').get(id)
})

app.delete('/api/brands/:id', async (req) => {
  const { id } = req.params as { id: string }
  db.prepare('DELETE FROM brands WHERE id = ?').run(id)
  return { ok: true }
})

app.post('/api/brands/:id/clips', async (req, reply) => {
  const { id: brandId } = req.params as { id: string }
  const brand = db.prepare('SELECT id FROM brands WHERE id = ?').get(brandId)
  if (!brand) return reply.code(404).send({ error: 'brand_not_found' })

  const fields: Record<string, string> = {}
  let videoFilename: string | null = null

  const parts = req.parts()
  for await (const part of parts) {
    if (part.type === 'file') {
      if (part.fieldname === 'video') {
        const ext = extname(part.filename || '.mp4') || '.mp4'
        const filename = `${nowId()}${ext}`
        const filepath = join(UPLOAD_DIR, filename)
        await pipeline(part.file, createWriteStream(filepath))
        videoFilename = filename
      } else {
        await part.file.resume()
      }
    } else {
      fields[part.fieldname] = String(part.value ?? '')
    }
  }

  if (!fields.title?.trim())
    return reply.code(400).send({ error: 'title required' })

  const clipId = nowId()
  db.prepare(
    `INSERT INTO clips (id, brand_id, title, transcript, video_filename, reference_title, reference_hook, reference_social_copy, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    clipId,
    brandId,
    fields.title.trim(),
    fields.transcript ?? '',
    videoFilename,
    fields.reference_title ?? '',
    fields.reference_hook ?? '',
    fields.reference_social_copy ?? '{}',
    Date.now(),
  )
  return db.prepare('SELECT * FROM clips WHERE id = ?').get(clipId)
})

app.get('/api/clips/:id', async (req, reply) => {
  const { id } = req.params as { id: string }
  const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as
    | Clip
    | undefined
  if (!clip) return reply.code(404).send({ error: 'not_found' })
  const brand = db
    .prepare('SELECT * FROM brands WHERE id = ?')
    .get(clip.brand_id) as Brand
  const latestEval = db
    .prepare(
      'SELECT * FROM eval_runs WHERE clip_id = ? ORDER BY created_at DESC LIMIT 1',
    )
    .get(id) as { id: string; results_json: string; created_at: number } | undefined
  const comments = db
    .prepare(
      'SELECT * FROM comments WHERE clip_id = ? ORDER BY created_at ASC',
    )
    .all(id)
  return {
    clip,
    brand,
    latestEval: latestEval
      ? {
          id: latestEval.id,
          created_at: latestEval.created_at,
          results: JSON.parse(latestEval.results_json),
        }
      : null,
    comments,
  }
})

app.put('/api/clips/:id', async (req, reply) => {
  const { id } = req.params as { id: string }
  const body = req.body as Partial<Clip>
  const existing = db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as
    | Clip
    | undefined
  if (!existing) return reply.code(404).send({ error: 'not_found' })
  db.prepare(
    `UPDATE clips SET
      title = ?,
      transcript = ?,
      reference_title = ?,
      reference_hook = ?,
      reference_social_copy = ?
     WHERE id = ?`,
  ).run(
    body.title ?? existing.title,
    body.transcript ?? existing.transcript,
    body.reference_title ?? existing.reference_title,
    body.reference_hook ?? existing.reference_hook,
    body.reference_social_copy ?? existing.reference_social_copy,
    id,
  )
  return db.prepare('SELECT * FROM clips WHERE id = ?').get(id)
})

app.delete('/api/clips/:id', async (req) => {
  const { id } = req.params as { id: string }
  db.prepare('DELETE FROM clips WHERE id = ?').run(id)
  return { ok: true }
})

app.post('/api/clips/:id/eval', async (req, reply) => {
  const { id } = req.params as { id: string }
  const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as
    | Clip
    | undefined
  if (!clip) return reply.code(404).send({ error: 'not_found' })
  if (!clip.transcript.trim())
    return reply.code(400).send({ error: 'clip has no transcript' })

  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(
    clip.brand_id,
  ) as Brand

  const voice = {
    copy: brand.copy_instruction ?? '',
    hook: brand.hook_instruction ?? '',
    title: brand.title_instruction ?? '',
  }

  try {
    const result = await runEval(clip.transcript, voice)
    const runId = nowId()
    db.prepare(
      `INSERT INTO eval_runs (id, clip_id, results_json, created_at) VALUES (?, ?, ?, ?)`,
    ).run(runId, id, JSON.stringify(result), Date.now())
    return { id: runId, created_at: Date.now(), results: result }
  } catch (err: any) {
    app.log.error(err)
    return reply.code(500).send({ error: err?.message ?? 'eval_failed' })
  }
})

app.get('/api/clips/:id/comments', async (req) => {
  const { id } = req.params as { id: string }
  return db
    .prepare('SELECT * FROM comments WHERE clip_id = ? ORDER BY created_at ASC')
    .all(id)
})

app.post('/api/clips/:id/comments', async (req, reply) => {
  const { id } = req.params as { id: string }
  const body = req.body as { text?: string }
  if (!body.text?.trim())
    return reply.code(400).send({ error: 'text required' })
  const clip = db.prepare('SELECT id FROM clips WHERE id = ?').get(id)
  if (!clip) return reply.code(404).send({ error: 'not_found' })
  const commentId = nowId()
  db.prepare(
    'INSERT INTO comments (id, clip_id, text, created_at) VALUES (?, ?, ?, ?)',
  ).run(commentId, id, body.text.trim(), Date.now())
  return db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId)
})

app.delete('/api/comments/:id', async (req) => {
  const { id } = req.params as { id: string }
  db.prepare('DELETE FROM comments WHERE id = ?').run(id)
  return { ok: true }
})

const port = Number(process.env.PORT ?? 3001)
app
  .listen({ port, host: '0.0.0.0' })
  .then(() => {
    app.log.info(`brand-voice-eval server listening on :${port}`)
  })
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
