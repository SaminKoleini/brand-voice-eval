# Brand Voice Eval

Test how OpusClip's prompts (clip title / social copy / auto hook) respond to
a per-brand voice instruction, side-by-side against real reference outputs.

## Structure

- `server/` — Fastify + SQLite + OpenAI SDK talking to the internal AI gateway
- `web/` — Vite + React UI (brands, clips, eval comparison, comments)
- `server/data.db` — SQLite file (auto-created)
- `server/uploads/` — video files (viewing only; never processed)

## Running

Two processes.

```bash
# terminal 1
cd server && npm run dev     # → http://localhost:3001

# terminal 2
cd web && npm run dev        # → http://localhost:5173
```

Open http://localhost:5173.

## Gateway configuration

The backend calls the internal AI gateway using the OpenAI SDK shape:

- `baseURL`: `http://10.113.0.113:4000/openai/v1`  (override with `GATEWAY_URL`)
- `X-Caller`: `lab-samin-eval-brand-voice`         (override with `GATEWAY_X_CALLER`)
- `X-Task`:   `brand-voice.eval`                   (override with `GATEWAY_X_TASK`)

Requests hit the gateway's `openai` service, which routes to OpenRouter under the hood — so `max_tokens` is capped at ~13k per call. The eval uses 1024 for social/title and 200 for hooks, well below the cap.

If auth fails, set your registered caller:

```bash
GATEWAY_X_CALLER=<your-caller-id> npm run dev
```

## Models

Set on the backend in `server/src/eval.ts` — same tiers as OpusClip production:

| Prompt      | Primary                 | Fallback   |
| ----------- | ----------------------- | ---------- |
| Clip title  | `gemini-2.5-flash-lite` | `gpt-5-nano` |
| Auto hook   | `gemini-2.5-flash-lite` | `gpt-5-nano` |
| Social copy | `gemini-2.5-flash`      | —          |

## Workflow

1. Create a brand and fill in the 3 voice fields (copy / hook / title)
2. Add clips: title + transcript (required) + optional video + reference outputs
3. Open a clip and "Run eval" — fires 16 prompts in parallel
   (2 modes × 8 outputs: title, hook, 6 platforms)
4. Compare baseline / brand voice / reference in the grid
5. Leave comments per clip

Aim for ≥10 clips per brand to see clear patterns.
