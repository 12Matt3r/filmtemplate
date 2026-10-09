"""Documented Texel image API. No guessed video/audio model requests."""
import base64
import io
import ipaddress
import json
import os
import socket
from urllib.parse import urlparse

import httpx
from PIL import Image

MAX_BYTES = 16 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 16_000_000


class TexelError(RuntimeError):
    pass


def _read(response: httpx.Response) -> bytes:
    chunks, size = [], 0
    for chunk in response.iter_bytes():
        size += len(chunk)
        if size > MAX_BYTES:
            raise TexelError("Texel image response exceeded the 16 MB limit.")
        chunks.append(chunk)
    return b"".join(chunks)


def _public_https(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise TexelError("Texel returned an unsupported image URL.")
    try:
        addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
            raise TexelError("Texel returned a non-public image URL.")
    except OSError as exc:
        raise TexelError("Could not resolve Texel's image host.") from exc


def _image_value(value):
    """The public spec leaves response bodies untyped. Accept common image envelopes,
    fail visibly for other shapes, and never reinterpret a job ID as an image.
    """
    if isinstance(value, str):
        return value
    if isinstance(value, list) and value:
        return _image_value(value[0])
    if isinstance(value, dict):
        for key in ("b64_json", "image_base64", "image_url", "url", "images", "image", "output", "data", "result"):
            if key in value:
                result = _image_value(value[key])
                if result:
                    return result
    return None


def decode_image(body: bytes, content_type: str, client: httpx.Client) -> bytes:
    if "json" in content_type:
        try:
            value = _image_value(json.loads(body))
        except (ValueError, TypeError) as exc:
            raise TexelError("Texel returned invalid image JSON.") from exc
        if not value:
            raise TexelError("Texel returned no supported image output. Check the account's response format; the public spec leaves it unspecified.")
        if value.startswith("https://"):
            # Validate every redirect and never forward our API Authorization header.
            for _ in range(4):
                _public_https(value)
                with client.stream("GET", value) as response:
                    if response.is_redirect:
                        from urllib.parse import urljoin
                        value = urljoin(value, response.headers.get("location", ""))
                        continue
                    if response.status_code != 200:
                        raise TexelError("Could not download the generated image.")
                    body = _read(response)
                    break
            else:
                raise TexelError("Too many redirects downloading the generated image.")
        else:
            if value.startswith("data:image/"):
                if ";base64," not in value:
                    raise TexelError("Texel returned an unsupported image data URL.")
                value = value.split(";base64,", 1)[1]
            try:
                body = base64.b64decode(value, validate=True)
            except (ValueError, TypeError) as exc:
                raise TexelError("Texel returned an unsupported image value.") from exc
    if len(body) > MAX_BYTES:
        raise TexelError("Generated image exceeded the size limit.")
    try:
        with Image.open(io.BytesIO(body)) as image:
            if image.width * image.height > Image.MAX_IMAGE_PIXELS:
                raise TexelError("Generated image exceeded the pixel limit.")
            image.load()
            output = io.BytesIO()
            image.convert("RGB").save(output, format="PNG")
            return output.getvalue()
    except (OSError, ValueError, Image.DecompressionBombError) as exc:
        raise TexelError("Texel output was not a valid supported image.") from exc


class TexelClient:
    def __init__(self):
        self.key = os.environ.get("TEXEL_API_KEY", "")
        self.model = os.environ.get("TEXEL_IMAGE_MODEL", "runwayml/stable-diffusion-v1-5")

    def generate(self, prompt: str) -> bytes:
        if not self.key:
            raise TexelError("Set TEXEL_API_KEY on the backend before generating keyframes.")
        # The official OpenAPI schema marks negative_prompt as required, even
        # though it allows null. Keep the documented property in every request.
        payload = {"prompt": prompt, "negative_prompt": "text, watermark, blurry, malformed anatomy", "model": self.model,
                   "count": 1, "steps": 30, "guidance_scale": 7.5, "width": 768, "height": 432}
        try:
            with httpx.Client(timeout=httpx.Timeout(180, connect=20), follow_redirects=False) as client:
                with client.stream("POST", "https://api.texel.ai/stable_diffusion/",
                                   headers={"Authorization": f"Bearer {self.key}"}, json=payload) as response:
                    if response.status_code >= 400:
                        raise TexelError(f"Texel returned HTTP {response.status_code}. Check access, credits, and the configured image model. No automatic retry was sent.")
                    body = _read(response)
                    return decode_image(body, response.headers.get("content-type", ""), client)
        except httpx.HTTPError as exc:
            raise TexelError("Texel request was interrupted or timed out. It may have been billed. Check your Texel dashboard before manually retrying.") from exc
