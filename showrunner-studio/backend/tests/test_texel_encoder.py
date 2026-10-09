"""Production encoder contracts and local execution of its standard FFmpeg graph."""
import json
import os
import shutil
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

import texel_routes
from texel_client import TexelError, TexelJobFailed
from texel_encoder import TexelEncoderClient, encoder_request
from texel_routes import TrailerPlan, TrailerService, public_body, router


def plan():
    return {'clips': [{'shot_id': 'shot-1', 'url': 'https://media.example/clip.mp4'}],
            'output_upload_url': 'https://storage.example/cut.mp4?upload=SECRET',
            'output_read_url': 'https://storage.example/cut.mp4?read=SECRET',
            'audio_url': None, 'enhance_voice': False}


def shots():
    return [{'id': 'shot-1', 'duration_seconds': 5}]


class EncoderTests(unittest.TestCase):
    def test_documented_submission_status_and_failure_contract(self):
        captured = []
        def handler(req):
            captured.append(req)
            if req.method == 'POST':
                return httpx.Response(201, json={'job_id': 'encoder-id', 'status': 'pending'})
            if len(captured) == 2:
                return httpx.Response(200, json={'job_status': 'encoding', 'progress': 42, 'queue_size': 0})
            if len(captured) == 3:
                return httpx.Response(200, json={'job_status': 'success', 'progress': 100})
            return httpx.Response(200, json={'job_status': 'upload_error', 'error_message': 'SECRET signed URL'})
        real_client = httpx.Client
        with patch.dict(os.environ, {'TEXEL_API_KEY': 'test-key'}), patch('texel_encoder._public_https'), patch('texel_client.httpx.Client', side_effect=lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw)):
            p = plan(); p.update(audio_url='https://media.example/voice.wav', enhance_voice=True)
            payload = encoder_request(shots(), p, 'client-id')
            client = TexelEncoderClient()
            self.assertEqual(client.submit(payload), 'encoder-id')
            self.assertEqual(client.status('encoder-id', 'client-id')['progress'], 42)
            self.assertTrue(client.status(None, 'client-id')['completed'])
            with self.assertRaises(TexelJobFailed) as error:
                client.status('encoder-id', 'client-id')
            self.assertNotIn('SECRET', str(error.exception))
        self.assertEqual(str(captured[0].url), 'https://api.prod.texel.ai/v1/video_encoder/encode')
        self.assertEqual(str(captured[1].url), 'https://api.prod.texel.ai/v1/video_encoder/status/encoder-id')
        self.assertEqual(str(captured[2].url), 'https://api.prod.texel.ai/v1/video_encoder/status_client_id/client-id')
        self.assertTrue(all(c.headers['authorization'] == 'Bearer test-key' for c in captured))
        submitted = json.loads(captured[0].content)
        self.assertEqual(submitted['video_encoder_codec'], 'h264_nvenc')
        self.assertEqual(submitted['outputs'][0]['streams'], ['video', 'audio'])
        effect = next(f for f in submitted['filters'] if f['name'] == 'nvafx')
        self.assertEqual(effect['kwargs']['effect'], 'studio_voice_high_quality')

    def test_private_urls_wrong_shot_order_and_voice_without_audio_are_rejected(self):
        p = plan(); p['output_upload_url'] = 'https://127.0.0.1/file'
        with self.assertRaises(ValueError):
            encoder_request(shots(), p, 'client')
        with patch('texel_encoder._public_https'):
            p = plan(); p['clips'][0]['shot_id'] = 'other-shot'
            with self.assertRaises(ValueError):
                encoder_request(shots(), p, 'client')
            p = plan(); p['enhance_voice'] = True
            with self.assertRaises(ValueError):
                encoder_request(shots(), p, 'client')

    @unittest.skipUnless(shutil.which('ffmpeg'), 'FFmpeg required')
    def test_filter_graph_joins_mixed_silent_clips_and_pads_audio(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            files = [root / 'red.mp4', root / 'blue.mp4', root / 'voice.wav']
            for dest, color, size, duration in [(files[0], 'red', '320x240', 2), (files[1], 'blue', '640x360', 1)]:
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'color=c={color}:s={size}:r=30:d={duration}', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(dest)], check=True)
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', str(files[2])], check=True)
            p = plan(); p['clips'].append({'shot_id': 'shot-2', 'url': 'https://media.example/second.mp4'}); p['audio_url'] = 'https://media.example/voice.wav'
            with patch('texel_encoder._public_https'):
                payload = encoder_request(shots() + [{'id': 'shot-2', 'duration_seconds': 5}], p, 'client')
            sources = {'clip0.video': '0:v:0', 'clip1.video': '1:v:0', 'sound.audio': '2:a:0'}
            graph = []
            for item in payload['filters']:
                input_labels = ''.join('[' + sources.get(label, label) + ']' for label in item['inputs'])
                args = [str(a) for a in item.get('args', [])] + [f'{k}={v}' for k, v in item.get('kwargs', {}).items()]
                graph.append(input_labels + item['name'] + ('=' + ':'.join(args) if args else '') + '[' + item['label'] + ']')
            output = root / 'cut.mp4'
            command = ['ffmpeg', '-v', 'error', '-y']
            for file in files:
                command.extend(['-i', str(file)])
            command.extend(['-filter_complex_threads', '1', '-filter_complex', ';'.join(graph), '-map', '[cut]', '-map', '[audio_out]', '-c:v', 'libx264', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(output)])
            subprocess.run(command, check=True, capture_output=True)
            probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(output)]))
            self.assertAlmostEqual(float(probe['format']['duration']), 10, delta=0.2)
            video = next(s for s in probe['streams'] if s['codec_type'] == 'video')
            self.assertEqual((video['width'], video['height']), (1280, 720))
            self.assertTrue(any(s['codec_type'] == 'audio' for s in probe['streams']))
            from PIL import Image
            import io
            for timestamp, channel in [(3, 0), (8, 2)]:
                frame = subprocess.check_output(['ffmpeg', '-v', 'error', '-ss', str(timestamp), '-i', str(output), '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'])
                pixel = Image.open(io.BytesIO(frame)).getpixel((640, 360))
                self.assertGreater(pixel[channel], 200)

    def test_resume_after_lost_submission_response_uses_client_id_and_redacts_urls(self):
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ, {'TEXEL_API_KEY': 'test-key'}), patch('texel_encoder._public_https'):
            service = TrailerService(Path(root))
            previous = texel_routes._service; texel_routes._service = service
            app = FastAPI(); app.include_router(router)
            try:
                with TestClient(app) as client:
                    saved = service.create(TrailerPlan(request_id='r', show_id='show', show_title='Show', shots=[{'id': 'shot-1', 'scene_id': 'scene', 'title': 'Scene', 'prompt': 'A scene', 'duration_seconds': 5}]))
                    path = f"/api/texel/trailers/{saved['id']}"
                    with patch('texel_routes.TexelEncoderClient.submit', side_effect=TexelError('Interrupted submission')) as submit:
                        response = client.post(path + '/cloud-render', json=plan())
                        self.assertEqual(response.status_code, 202)
                        deadline = time.monotonic() + 5
                        while service.store.get(saved['id'])['cloud_render']['status'] == 'running' and time.monotonic() < deadline:
                            time.sleep(.02)
                        self.assertEqual(service.store.get(saved['id'])['cloud_render']['status'], 'interrupted')
                        self.assertEqual(submit.call_count, 1)
                    service.store.mutate(saved['id'], lambda b: b['cloud_render'].update(status='running'))
                    service.store.recover()
                    self.assertEqual(service.store.get(saved['id'])['cloud_render']['status'], 'interrupted')
                    public = client.get(path).text
                    self.assertNotIn('SECRET', public)
                    self.assertNotIn('storage.example', public)
                    self.assertNotIn('payload', public)
                    def download(_url, output): output.write_bytes(b'mocked verified media')
                    with patch('texel_routes.TexelEncoderClient.submit') as resubmit, patch('texel_routes.TexelEncoderClient.status', return_value={'completed': True, 'progress': 100}) as status, patch('texel_routes.TexelEncoderClient.download_video', side_effect=download):
                        self.assertEqual(client.post(path + '/cloud-render/resume').status_code, 202)
                        deadline = time.monotonic() + 5
                        while service.store.get(saved['id'])['cloud_render']['status'] == 'running' and time.monotonic() < deadline:
                            time.sleep(.02)
                        body = public_body(service.store.get(saved['id']))
                        self.assertEqual(body['cloud_render']['status'], 'complete')
                        resubmit.assert_not_called()
                        status.assert_called_once_with(None, body['cloud_render']['client_id'])
                        self.assertEqual(client.get(body['video_url']).status_code, 200)
            finally:
                texel_routes._service = previous
