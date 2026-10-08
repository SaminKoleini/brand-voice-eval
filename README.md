# Brand Voice Eval

A small evaluation harness for answering one question: **does a per-brand voice instruction actually make AI-written clip copy better?**

For each clip you add, it generates the same outputs twice — once with the standard prompt (**baseline**) and once with that prompt plus a brand voice instruction (**brand voice**) — and shows them side by side with the **reference** copy you'd consider ideal.

## What it does

- **Brands** hold three voice instructions: one each for social copy, hooks and titles.
- **Clips** hold a title, a transcript (required), an optional video for viewing, and optional reference outputs.
- **Run eval** fires the prompts in parallel for both modes and stores the results.
- **Compare** baseline vs. brand voice vs. reference in a grid, and leave comments per clip.

Generated outputs per mode:

| Output | What it is | Model (primary → fallback) |
| --- | --- | --- |
| Clip title | Title, description and hashtags as JSON | `gemini-2.5-flash-lite` → `gpt-5-nano` |
| Auto hook | A short opening hook | `gemini-2.5-flash-lite` → `gpt-5-nano` |
| Social copy | Platform-specific title, description and hashtags | `gemini-2.5-flash` |

Social copy prompts exist for YouTube Shorts, TikTok, Instagram, LinkedIn, X/Twitter and Facebook. Only YouTube is switched on by default — change `ENABLED_SOCIAL_PLATFORMS` in `server/src/prompts.ts` to add more.

## Tech stack

- **Server:** Fastify, SQLite (`better-sqlite3`), the OpenAI SDK, TypeScript (run with `tsx`)
- **Web:** React 18, React Router, Vite, TypeScript

## Getting started

Two processes: the API and the UI.

```bash
# terminal 1 — API on http://localhost:3001
cd server
npm install
npm run dev

# terminal 2 — UI on http://localhost:5173
cd web
npm install
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` and `/uploads` to the API.

## Configuration

The server talks to an **OpenAI-compatible gateway** (the OpenAI SDK pointed at a custom base URL). Authentication is handled by the gateway, so there is no API key in this repo. Point it at your own gateway with environment variables:

| Variable | Purpose |
| --- | --- |
| `GATEWAY_URL` | Base URL of the OpenAI-compatible gateway |
| `GATEWAY_X_CALLER` | Value sent in the `X-Caller` header, for gateways that identify callers |
| `GATEWAY_X_TASK` | Value sent in the `X-Task` header, for per-task tracking |
| `PORT` | API port (default `3001`) |

```bash
GATEWAY_URL=https://your-gateway.example/openai/v1 GATEWAY_X_CALLER=<your-id> npm run dev
```

> The defaults in `server/src/gateway.ts` were written for the original private setup. Override them with your own values before running.

If requests fail with an auth error, check that your caller ID is registered with the gateway. Token limits are kept well under typical provider caps: 1024 for titles and social copy, 200 for hooks.

## Workflow

1. Create a brand and fill in its three voice fields (copy, hook, title).
2. Add clips: a title and transcript (required), plus an optional video and any reference outputs.
3. Open a clip and press **Run eval**. Title, hook and one social-copy prompt per enabled platform run in parallel, once for each mode.
4. Compare baseline, brand voice and reference side by side.
5. Leave comments on the clip.

Aim for **10 or more clips per brand** so patterns show up instead of one-off noise.

## Data model

SQLite file at `server/data.db`, created automatically.

| Table | Holds |
| --- | --- |
| `brands` | Name plus the copy / hook / title instructions |
| `clips` | Title, transcript, optional video filename, reference outputs, brand link |
| `eval_runs` | The JSON result of each eval run for a clip |
| `comments` | Free-text comments per clip |

Uploaded videos go to `server/uploads/` and are only served back for viewing — they're never processed.

## API

All routes are under `/api`.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` `POST` | `/brands` | List / create brands |
| `GET` `PUT` `DELETE` | `/brands/:id` | Read / update / delete a brand |
| `POST` | `/brands/:id/clips` | Add a clip (multipart, optional video) |
| `GET` `PUT` `DELETE` | `/clips/:id` | Read / update / delete a clip |
| `POST` | `/clips/:id/eval` | Run the eval for a clip |
| `GET` `POST` | `/clips/:id/comments` | List / add comments |
| `DELETE` | `/comments/:id` | Delete a comment |

## Project structure

```
├── server/
│   └── src/
│       ├── index.ts      # Fastify app and routes
│       ├── eval.ts       # runs baseline vs. brand-voice in parallel, with model fallback
│       ├── prompts.ts    # prompt builders and platform rules
│       ├── gateway.ts    # OpenAI-compatible client
│       └── db.ts         # SQLite schema and helpers
└── web/
    └── src/
        ├── pages/        # Home (brands), Brand (clips), Clip (eval + comments)
        ├── api.ts        # typed API client
        └── App.tsx
```
