# Outline to Trailer

The Texel tab compiles one to three scenes into editable keyframe prompts, expands the registered character and set descriptions, saves a shot plan, generates images through Texel, animates approved images through FramePack, and assembles saved clips into a downloadable 720p MP4. An optional uploaded score or voiceover loops to the cut length. Exports include opening and closing title cards. A separate still-image storyboard export remains available.

This version generates **images and animated clips**. FramePack is conditioned on each approved keyframe. It does not generate voice or music, train character identities, or perform visual QC. The existing Script Lab remains available for script critique and revision; it is not an automated rendering gate.

## Run locally

Requirements: Node 22.12+ (or 24+), Python 3.12+, [uv](https://docs.astral.sh/uv/), FFmpeg and ffprobe on PATH.

```bash
cp showrunner-studio/.env.example showrunner-studio/.env
# Set TEXEL_API_KEY in that file. Leave it unset to prepare plans without spending.
./start.sh
```

Open http://localhost:3001. Import or create a show with scenes, open the Texel tab, choose scenes, prepare and edit prompts, and save a trailer plan. Each **Generate keyframe** sends one image request. Approve each image, review its motion prompt, and use **Animate keyframe** to send one video request. Review the saved clips, optionally attach audio, then assemble an animated trailer and download. You can also export a still-image storyboard before generating video. Generation and export status survive reloads. Saved trailers appear again when their show is selected.

The `.env` file is loaded by the launcher into the backend only. Texel's key never reaches the browser. This is a private, single-user development studio: keep the backend private. Public hosting must add access control and per-user storage/usage limits before exposing paid generation endpoints. Deploy media jobs in a long-running process with a persistent `TEXEL_DATA_DIR`; the current implementation uses a two-worker thread pool and is not a serverless job queue.

## API contract used

Source of truth: [Texel's official Python SDK](https://github.com/TexelSoftware/texel-sdks/blob/42676c8d42a44cc79463ce4c8f789fd3f8054150/python/texel_api.py), pinned for reference to commit `42676c8`. Its production base URL is `https://api.prod.texel.ai/v1`. The generic Scalar/OpenAPI docs at https://texel.ai/api_docs/ describe a different API surface, including DreamBooth training and inference. A DreamBooth result endpoint is not a video-job result endpoint; this workflow follows the SDK's SD server routes instead.

- Images: `POST /sd_server/txt2img` with Bearer authentication, a model object (`name=juggernautXL_v8Rundiffusion.safetensors`, `type=SDXL`), the SDK's nested request properties, one image, 20 steps, cfg scale 7, and 768×432 dimensions. `TEXEL_IMAGE_MODEL` overrides the model name. The SDK returns `images` as base64 image strings; the adapter validates and saves PNGs.
- Animation: `POST /sd_server/img2vid`, model `FramePackI2V_HY_fp8_e4m3fn` / `FRAMEPACK_VIDEO`, approved PNG as base64 `init_images`, editable motion prompt, planned duration as `length`, 30 steps, cfg scale 3, 768×432, H.264 MP4. The SDK demonstrates the `length` field at one second; the application requests its planned 5–10-second cut. Account support for these lengths must be confirmed by a live smoke test.
- Job results: save the returned `id`, then `GET /sd_server/status/{id}/FRAMEPACK_VIDEO`. `job_status=success` plus `signed_output_urls` completes the job. Processing jobs expose `progress`; failure states are reported without exposing raw provider errors.
- Downloads: signed URLs are fetched without credentials, limited to 100 MB, checked with ffprobe, and saved locally. Assembly normalizes video to 720p/24 fps, trims long outputs, holds the last frame for shorter outputs, removes clip audio, and adds an optional uploaded score/voiceover.

The adapter implements these contracts with HTTPX rather than vendoring the sample SDK. Requests have timeouts and no automatic generation retries; downloads do not inherit the SDK's authenticated session. A live account smoke test is still needed to confirm enabled models, credits, and output shape. Automated tests never call Texel or consume credits. The SDK does not provide an audio-generation contract, so score/voiceover currently comes from an upload.

## Persistence and retries

SQLite snapshots and generated assets live in `backend/.texel-data/` by default, outside git. A request ID prevents duplicate plan creation, and concurrent generation of the same shot is rejected. Generation calls are never automatically retried. If image generation times out or restarts, inspect Texel billing before explicitly retrying. Video job IDs are persisted before polling; interrupted jobs offer **Resume saved job**, which only checks status and downloads the result. Polling pauses after ten minutes or on a network error. A restart retains the saved ID and allows resuming. If submission is interrupted before the ID is saved, check billing before generating again. Successfully saved images and clips need no new provider calls for reassembly. Regenerating a keyframe clears its clip and approval and invalidates the previous export.

JSON project exports still back up the editor database only. Trailer media and SQLite records are backend-owned; back up the configured data directory separately. Text descriptions are expanded into prompts, not a guarantee of character consistency. One keyframe depicts each selected scene's opening action paragraph. The motion prompt includes scene action and director notes; revise it to keep the intended action within the short clip.

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

Tests cover SDK image/video payloads, authenticated job polling, safe downloads, resume without resubmission, clip-based exports, response decoding, approval and retry gates, idempotent plans, restart recovery, protected media paths, optional audio validation, real FFmpeg assembly, MP4 duration/resolution, downloading, and reassembly without another provider call.
