"""Persisted, reviewable Texel keyframe → storyboard MP4 workflow."""
import os
import shutil
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator

from texel_client import TexelClient
from trailer_render import assemble, validate_audio
from trailer_store import TrailerStore


class ShotPlan(BaseModel):
    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")
    scene_id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=160)
    prompt: str = Field(min_length=1, max_length=8000)
    duration_seconds: int = Field(default=6, ge=5, le=10)


class TrailerPlan(BaseModel):
    request_id: str = Field(min_length=1, max_length=120)
    show_id: str = Field(min_length=1, max_length=120)
    show_title: str = Field(min_length=1, max_length=160)
    shots: list[ShotPlan] = Field(min_length=1, max_length=3)

    @model_validator(mode="after")
    def unique_shots(self):
        if len({s.id for s in self.shots}) != len(self.shots):
            raise ValueError("Each shot must have a unique ID.")
        if any(not s.prompt.strip() for s in self.shots):
            raise ValueError("Each shot needs a non-empty prompt.")
        return self


class GenerateShot(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)


class ShotApproval(BaseModel):
    approved: bool


class TrailerService:
    def __init__(self, root: Path):
        self.store = TrailerStore(root)
        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="texel-studio")

    def create(self, plan: TrailerPlan):
        body = {"id": uuid.uuid4().hex, "request_id": plan.request_id, "show_id": plan.show_id,
                "show_title": plan.show_title, "plan": plan.model_dump(), "status": "draft", "error": None,
                "video_asset": None, "audio_asset": None, "audio_name": None, "created_at": time.time(), "updated_at": time.time(),
                "shots": [{**s.model_dump(), "status": "planned", "asset": None, "error": None, "operation_id": None} for s in plan.shots]}
        return self.store.create(body)

    @staticmethod
    def shot(body, shot_id):
        shot = next((s for s in body["shots"] if s["id"] == shot_id), None)
        if shot is None:
            raise KeyError(shot_id)
        return shot

    @staticmethod
    def editable(body):
        if body["status"] == "rendering":
            raise ValueError("Wait for the current export to finish.")

    @staticmethod
    def invalidate(body):
        body["status"] = "draft"
        body["video_asset"] = None
        body["error"] = None

    def generate(self, trailer_id, shot_id, prompt):
        if not os.environ.get("TEXEL_API_KEY"):
            raise ValueError("Set TEXEL_API_KEY on the backend before generating keyframes.")
        if not prompt.strip():
            raise ValueError("Enter a non-empty keyframe prompt.")
        operation = uuid.uuid4().hex
        def start(body):
            self.editable(body)
            shot = self.shot(body, shot_id)
            if shot["status"] == "generating":
                raise ValueError("This shot is already generating; no second request was sent.")
            shot.update(status="generating", prompt=prompt, error=None, asset=None, operation_id=operation)
            self.invalidate(body)
        body = self.store.mutate(trailer_id, start)
        self.executor.submit(self._generate, trailer_id, shot_id, prompt, operation)
        return body

    def _generate(self, trailer_id, shot_id, prompt, operation):
        try:
            image = TexelClient().generate(prompt)
            folder = self.store.root / trailer_id
            folder.mkdir(exist_ok=True)
            filename = f"keyframe-{operation}.png"
            (folder / filename).write_bytes(image)
            def finish(body):
                shot = self.shot(body, shot_id)
                if shot["operation_id"] == operation:
                    shot.update(status="ready", asset=filename, error=None)
            self.store.mutate(trailer_id, finish)
        except Exception as exc:
            # Provider output and secrets are never returned as raw error bodies.
            from texel_client import TexelError
            message = str(exc) if isinstance(exc, TexelError) else "Keyframe generation failed while saving the result. Check Texel before retrying."
            def fail(body):
                shot = self.shot(body, shot_id)
                if shot["operation_id"] == operation:
                    shot.update(status="error", error=message)
            self.store.mutate(trailer_id, fail)

    def approve(self, trailer_id, shot_id, approved):
        def change(body):
            self.editable(body)
            shot = self.shot(body, shot_id)
            if shot["status"] not in ("ready", "approved") or not shot["asset"]:
                raise ValueError("Generate a valid keyframe before approving it.")
            shot["status"] = "approved" if approved else "ready"
            self.invalidate(body)
        return self.store.mutate(trailer_id, change)

    def render(self, trailer_id):
        if not shutil.which("ffmpeg"):
            raise ValueError("Install FFmpeg on the backend to export MP4.")
        render_id = uuid.uuid4().hex
        def start(body):
            self.editable(body)
            if not all(s["status"] == "approved" and s["asset"] for s in body["shots"]):
                raise ValueError("Approve every keyframe before assembling the trailer.")
            body.update(status="rendering", error=None, video_asset=None, render_id=render_id)
        body = self.store.mutate(trailer_id, start)
        self.executor.submit(self._render, body, render_id)
        return body

    def _render(self, body, render_id):
        try:
            path = assemble(body, self.store.root / body["id"], render_id)
            self.store.mutate(body["id"], lambda b: b.update(status="complete", video_asset=path.name, error=None))
        except Exception:
            self.store.mutate(body["id"], lambda b: b.update(status="error", error="MP4 export failed. Check FFmpeg and the attached audio, then assemble again. Your approved keyframes are saved."))

    def attach_audio(self, trailer_id, data, name):
        self.editable(self.store.get(trailer_id))
        folder = self.store.root / trailer_id
        folder.mkdir(exist_ok=True)
        filename = f"audio-{uuid.uuid4().hex}.bin"
        path = folder / filename
        path.write_bytes(data)
        try:
            validate_audio(path)
            def change(body):
                self.editable(body)
                self.invalidate(body)
                body.update(audio_asset=filename, audio_name=name)
            return self.store.mutate(trailer_id, change)
        except Exception:
            path.unlink(missing_ok=True)
            raise

    def remove_audio(self, trailer_id):
        def change(body):
            self.editable(body)
            self.invalidate(body)
            body.update(audio_asset=None, audio_name=None)
        return self.store.mutate(trailer_id, change)


_service = None


def service():
    global _service
    if _service is None:
        root = Path(os.environ.get("TEXEL_DATA_DIR", str(Path(__file__).parent / ".texel-data"))).resolve()
        _service = TrailerService(root)
    return _service


@asynccontextmanager
async def lifespan(_app):
    service().store.recover()
    yield
    service().executor.shutdown(wait=True)


router = APIRouter(prefix="/api/texel", tags=["Texel storyboard trailers"], lifespan=lifespan)


def _call(fn, *args):
    try:
        return fn(*args)
    except KeyError:
        raise HTTPException(404, "Trailer or shot not found.")
    except ValueError as exc:
        raise HTTPException(409, str(exc))


def public_body(body):
    def media(asset):
        return f"/api/texel/trailers/{body['id']}/media/{asset}" if asset else None
    return {**body, "video_url": media(body["video_asset"]),
            "shots": [{**s, "image_url": media(s["asset"])} for s in body["shots"]]}


@router.get("/capabilities")
def capabilities():
    return {"configured": bool(os.environ.get("TEXEL_API_KEY")), "image_model": os.environ.get("TEXEL_IMAGE_MODEL", "runwayml/stable-diffusion-v1-5"),
            "ffmpeg_available": bool(shutil.which("ffmpeg")), "audio_available": bool(shutil.which("ffprobe")),
            "mode": "storyboard", "max_shots": 3, "video_generation": False, "audio_generation": False}


@router.post("/trailers", status_code=201)
def create(plan: TrailerPlan):
    return public_body(_call(service().create, plan))


@router.get("/trailers")
def list_trailers(show_id: str):
    return [public_body(b) for b in service().store.list(show_id)]


@router.get("/trailers/{trailer_id}")
def get(trailer_id: str):
    return public_body(_call(service().store.get, trailer_id))


@router.post("/trailers/{trailer_id}/shots/{shot_id}/generate", status_code=202)
def generate(trailer_id: str, shot_id: str, req: GenerateShot):
    return public_body(_call(service().generate, trailer_id, shot_id, req.prompt))


@router.post("/trailers/{trailer_id}/shots/{shot_id}/approval")
def approve(trailer_id: str, shot_id: str, req: ShotApproval):
    return public_body(_call(service().approve, trailer_id, shot_id, req.approved))


@router.post("/trailers/{trailer_id}/render", status_code=202)
def render(trailer_id: str):
    return public_body(_call(service().render, trailer_id))


@router.post("/trailers/{trailer_id}/audio")
async def audio(trailer_id: str, file: UploadFile = File(...)):
    try:
        data = await file.read(20 * 1024 * 1024 + 1)
    finally:
        await file.close()
    if not data or len(data) > 20 * 1024 * 1024:
        raise HTTPException(413, "Use a non-empty audio file under 20 MB.")
    try:
        return public_body(_call(service().attach_audio, trailer_id, data, (file.filename or "Audio")[:160]))
    except RuntimeError as exc:
        raise HTTPException(422, str(exc))


@router.delete("/trailers/{trailer_id}/audio")
def remove_audio(trailer_id: str):
    return public_body(_call(service().remove_audio, trailer_id))


@router.get("/trailers/{trailer_id}/media/{filename}")
def media(trailer_id: str, filename: str, download: bool = False):
    body = _call(service().store.get, trailer_id)
    allowed = {s["asset"] for s in body["shots"]} | {body["video_asset"]}
    if filename not in allowed or not (service().store.root / trailer_id / filename).is_file():
        raise HTTPException(404, "Media not found.")
    return FileResponse(service().store.root / trailer_id / filename,
                        media_type="video/mp4" if filename.endswith(".mp4") else "image/png",
                        filename="storyboard-trailer.mp4" if download and filename.endswith(".mp4") else None)
