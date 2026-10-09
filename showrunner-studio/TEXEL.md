# Outline to Trailer — first working slice

The Texel tab compiles one to three scenes into editable keyframe prompts, expands the registered character and set descriptions, saves a shot plan, generates images through Texel, and assembles approved images into a downloadable 720p MP4. An optional uploaded score or voiceover loops to the cut length. Exports include opening and closing title cards and identify themselves as storyboard trailers.

This version generates **stills**, not animated shots. It does not claim native voice, music generation, lip sync, reference-image conditioning, or visual QC. The existing Script Lab remains available for script critique and revision; it is not an automated rendering gate.

## Run locally

Requirements: Node 22.12+ (or 24+), Python 3.12+, [uv](https://docs.astral.sh/uv/), FFmpeg and ffprobe on PATH.

```bash
cp showrunner-studio/.env.example showrunner-studio/.env
# Set TEXEL_API_KEY in that file. Leave it unset to prepare plans without spending.
./start.sh
```

Open http://localhost:3001. Import or create a show with scenes, open the Texel tab, choose scenes, prepare and edit prompts, and save a trailer plan. Each **Generate keyframe** sends one image request. Approve each image, optionally attach audio, then assemble and download. Generation and export status survive reloads. Saved trailers appear again when their show is selected.

The `.env` file is loaded by the launcher into the backend only. Texel's key never reaches the browser. This is a private, single-user development studio: keep the backend private. Public hosting must add access control and per-user storage/usage limits before exposing paid generation endpoints. Deploy media jobs in a long-running process with a persistent `TEXEL_DATA_DIR`; the current implementation uses a two-worker thread pool and is not a serverless job queue.

## API contract used

Official reference: https://texel.ai/api_docs/ (its Scalar client loads https://api.texel.ai/openapi.json).

Image generation uses `POST https://api.texel.ai/stable_diffusion/` with Bearer authentication, `prompt`, `negative_prompt`, `model`, `count=1`, `steps=30`, `guidance_scale=7.5`, `width=768`, and `height=432`. The default model comes from the public schema; `TEXEL_IMAGE_MODEL` can override it with an account-supported identifier.

The public schema leaves the image response untyped. The adapter accepts raw image bytes, base64/data URLs, HTTPS image URLs, and common image JSON envelopes; unexpected responses fail visibly instead of being treated as success. A live account smoke test is still required to verify the enabled model, credits, and response shape. Automated tests never call Texel or consume credits.

Texel's public `/model_server/` entry accepts arbitrary model names and parameter dictionaries but does not enumerate video or audio generation models. No requests for those capabilities are fabricated here. Once an account-supported image-to-video contract is available, add a shot-video stage after keyframe approval and let assembly consume the saved clips.

## Persistence and retries

SQLite snapshots and generated assets live in `backend/.texel-data/` by default, outside git. A request ID prevents duplicate plan creation, and concurrent generation of the same shot is rejected. Generation calls are never automatically retried. If a timeout or process restart interrupts one, inspect Texel billing before explicitly retrying. Successfully saved keyframes need no new provider calls for reassembly. Regenerating a keyframe clears its approval and invalidates the previous export.

JSON project exports still back up the editor database only. Trailer media and SQLite records are backend-owned; back up the configured data directory separately. Text descriptions are expanded into prompts, not a guarantee of character consistency. One keyframe depicts each selected scene's opening action paragraph; review and revise the prompt for another beat.

## Checks

```bash
cd showrunner-studio/frontend
npm ci
npm run build
npm run lint
npm run test:texel
cd ../backend
uv sync
uv run python -m unittest discover -s tests -v
```

Tests cover the documented request, response decoding, approval and retry gates, idempotent plans, restart recovery, protected media paths, optional audio validation, real FFmpeg assembly, MP4 duration/resolution, downloading, and reassembly without another provider call.
