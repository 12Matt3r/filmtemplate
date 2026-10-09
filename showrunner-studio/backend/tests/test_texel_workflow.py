"""Run: python -m unittest discover -s tests -v. No live Texel calls or credits."""
import base64
import io
import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

import texel_routes
from texel_client import TexelClient, TexelError, _public_https, decode_image
from texel_routes import TrailerPlan, TrailerService, router
from trailer_store import TrailerStore


def image_bytes():
    out = io.BytesIO()
    Image.new("RGB", (768, 432), "#319e93").save(out, format="PNG")
    return out.getvalue()


def plan():
    return {"request_id": "request-1", "show_id": "show-1", "show_title": "Signal Test",
            "shots": [{"id": "shot-1", "scene_id": "scene-1", "title": "The control room", "prompt": "A teal broadcast room at night.", "duration_seconds": 5}]}


class ImageContractTests(unittest.TestCase):
    def test_documented_request_and_base64_result(self):
        captured = []
        def handler(req):
            captured.append(req)
            return httpx.Response(200, json={"images": [{"b64_json": base64.b64encode(image_bytes()).decode()}]})
        real_client = httpx.Client
        with patch.dict(os.environ, {"TEXEL_API_KEY": "test-key"}), patch("texel_client.httpx.Client", side_effect=lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw)):
            result = TexelClient().generate("control room")
        self.assertEqual(Image.open(io.BytesIO(result)).size, (768, 432))
        self.assertEqual(str(captured[0].url), "https://api.texel.ai/stable_diffusion/")
        self.assertEqual(captured[0].headers["authorization"], "Bearer test-key")
        payload = json.loads(captured[0].content)
        self.assertEqual(payload["count"], 1)
        self.assertIn("negative_prompt", payload)
        self.assertEqual((payload["width"], payload["height"]), (768, 432))

    def test_async_job_response_is_not_mistaken_for_image(self):
        with httpx.Client(trust_env=False) as client, self.assertRaises(TexelError):
            decode_image(b'{"job_id":"not-an-image"}', "application/json", client)

    def test_private_host_is_rejected(self):
        with self.assertRaises(TexelError):
            _public_https("https://127.0.0.1/image.png")
        with self.assertRaises(TexelError):
            _public_https("file:///etc/passwd")

    def test_error_does_not_retry_or_expose_provider_body(self):
        calls = []
        def handler(req):
            calls.append(req)
            return httpx.Response(401, text="sensitive provider body")
        real_client = httpx.Client
        with patch.dict(os.environ, {"TEXEL_API_KEY": "test-key"}), patch("texel_client.httpx.Client", side_effect=lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw)):
            with self.assertRaises(TexelError) as error:
                TexelClient().generate("room")
        self.assertEqual(len(calls), 1)
        self.assertNotIn("sensitive", str(error.exception))


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.service = TrailerService(Path(self.temp.name))
        self.previous = texel_routes._service
        texel_routes._service = self.service
        app = FastAPI()
        app.include_router(router)
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        texel_routes._service = self.previous
        self.temp.cleanup()

    def wait_for(self, trailer_id, predicate):
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            body = self.client.get(f"/api/texel/trailers/{trailer_id}").json()
            if predicate(body):
                return body
            time.sleep(0.05)
        self.fail("Media job did not finish")

    def test_idempotent_plan_and_approval_gate(self):
        first = self.client.post("/api/texel/trailers", json=plan())
        again = self.client.post("/api/texel/trailers", json=plan())
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.json()["id"], again.json()["id"])
        trailer_id = first.json()["id"]
        self.assertEqual(self.client.post(f"/api/texel/trailers/{trailer_id}/render").status_code, 409)
        changed = plan()
        changed["shots"][0]["prompt"] = "A different room"
        self.assertEqual(self.client.post("/api/texel/trailers", json=changed).status_code, 409)
        self.assertEqual(self.client.post(f"/api/texel/trailers/{trailer_id}/shots/shot-1/approval", json={"approved": True}).status_code, 409)

    def test_duplicate_generation_is_blocked_and_restart_is_visible(self):
        trailer_id = self.client.post("/api/texel/trailers", json=plan()).json()["id"]
        entered, release = threading.Event(), threading.Event()
        def generate(_prompt):
            entered.set()
            release.wait(5)
            return image_bytes()
        path = f"/api/texel/trailers/{trailer_id}/shots/shot-1/generate"
        with patch.dict(os.environ, {"TEXEL_API_KEY": "test-key"}), patch("texel_routes.TexelClient.generate", side_effect=generate) as provider:
            try:
                self.assertEqual(self.client.post(path, json={"prompt": "room"}).status_code, 202)
                self.assertTrue(entered.wait(3))
                self.assertEqual(self.client.post(path, json={"prompt": "room"}).status_code, 409)
            finally:
                release.set()
            self.wait_for(trailer_id, lambda b: b["shots"][0]["status"] == "ready")
            self.assertEqual(provider.call_count, 1)
        reopened = TrailerStore(Path(self.temp.name))
        self.assertEqual(reopened.get(trailer_id)["shots"][0]["status"], "ready")
        reopened.mutate(trailer_id, lambda b: b["shots"][0].update(status="generating"))
        reopened.recover()
        self.assertEqual(reopened.get(trailer_id)["shots"][0]["status"], "interrupted")

    @unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg required")
    def test_keyframe_approval_audio_export_download_and_revision(self):
        trailer_id = self.client.post("/api/texel/trailers", json=plan()).json()["id"]
        path = f"/api/texel/trailers/{trailer_id}"
        with patch.dict(os.environ, {"TEXEL_API_KEY": "test-key"}), patch("texel_routes.TexelClient.generate", return_value=image_bytes()) as provider:
            self.assertEqual(self.client.post(f"{path}/shots/shot-1/generate", json={"prompt": "room"}).status_code, 202)
            body = self.wait_for(trailer_id, lambda b: b["shots"][0]["status"] == "ready")
            self.assertEqual(self.client.get(body["shots"][0]["image_url"]).headers["content-type"], "image/png")
            self.assertEqual(self.client.get(f"{path}/media/trailers.sqlite3").status_code, 404)
            self.assertEqual(self.client.post(f"{path}/shots/shot-1/approval", json={"approved": True}).status_code, 200)
            audio = Path(self.temp.name) / "test.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", str(audio)], check=True)
            upload = self.client.post(f"{path}/audio", files={"file": ("test.wav", audio.read_bytes(), "audio/wav")})
            self.assertEqual(upload.status_code, 200)
            self.assertEqual(self.client.post(f"{path}/render").status_code, 202)
            body = self.wait_for(trailer_id, lambda b: b["status"] in ("complete", "error"))
            self.assertEqual(body["status"], "complete", body.get("error"))
            download = self.client.get(body["video_url"] + "?download=true")
            self.assertEqual(download.headers["content-type"], "video/mp4")
            self.assertIn("attachment", download.headers["content-disposition"])
            output = Path(self.temp.name) / "download.mp4"
            output.write_bytes(download.content)
            probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(output)]))
            video = next(s for s in probe["streams"] if s["codec_type"] == "video")
            self.assertEqual((video["width"], video["height"]), (1280, 720))
            self.assertAlmostEqual(float(probe["format"]["duration"]), 9, delta=0.2)
            self.assertTrue(any(s["codec_type"] == "audio" for s in probe["streams"]))
            # Reassembly uses cached images. No second provider request.
            self.assertEqual(self.client.post(f"{path}/render").status_code, 202)
            self.wait_for(trailer_id, lambda b: b["status"] == "complete")
            self.assertEqual(provider.call_count, 1)
            self.client.post(f"{path}/shots/shot-1/generate", json={"prompt": "revised room"})
            body = self.wait_for(trailer_id, lambda b: b["shots"][0]["status"] == "ready")
            self.assertIsNone(body["video_url"])
            self.assertEqual(self.client.post(f"{path}/render").status_code, 409)

    def test_invalid_audio_is_rejected(self):
        trailer_id = self.client.post("/api/texel/trailers", json=plan()).json()["id"]
        response = self.client.post(f"/api/texel/trailers/{trailer_id}/audio", files={"file": ("fake.wav", b"not-audio", "audio/wav")})
        self.assertEqual(response.status_code, 422)
        self.assertIsNone(self.service.store.get(trailer_id)["audio_asset"])


if __name__ == "__main__":
    unittest.main()
