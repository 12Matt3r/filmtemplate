"""Production encoder contract: https://api.prod.texel.ai/docs/openapi.json.

The current public docs cover processing, not the SDK's generation endpoints.
Caller supplies readable input URLs and a writable output plus readable result URL.
"""
from urllib.parse import quote

from texel_client import TexelClient, TexelError, TexelJobFailed, _public_https


def encoder_request(shots, plan, client_id):
    if [c['shot_id'] for c in plan['clips']] != [s['id'] for s in shots]:
        raise ValueError('Supply one clip URL for every shot, in script order.')
    for url in [c['url'] for c in plan['clips']] + [plan['output_upload_url'], plan['output_read_url']] + ([plan['audio_url']] if plan.get('audio_url') else []):
        try:
            _public_https(url)
        except TexelError as exc:
            raise ValueError('Use public HTTPS media URLs and signed storage URLs.') from exc
    if plan.get('enhance_voice') and not plan.get('audio_url'):
        raise ValueError('Supply a voiceover URL before enabling voice enhancement.')
    inputs, filters, joined = [], [], []
    def add(name, source, label, args=None, kwargs=None, audio=False):
        item = {'name': name, 'inputs': [source], 'label': label, 'output': ['audio'] if audio else ['video']}
        if args is not None:
            item['args'] = args
        if kwargs is not None:
            item['kwargs'] = kwargs
        filters.append(item)
        return label
    for index, (shot, clip) in enumerate(zip(shots, plan['clips'])):
        label = f'clip{index}'
        inputs.append({'label': label, 'url': clip['url'], 'streams': ['video']})
        source = label + '.video'
        source = add('scale', source, label + '_scale', [1280, 720], {'force_original_aspect_ratio': 'decrease'})
        source = add('pad', source, label + '_pad', [1280, 720, '(ow-iw)/2', '(oh-ih)/2', 'black'])
        source = add('setsar', source, label + '_sar', ['1'])
        source = add('fps', source, label + '_fps', [24])
        source = add('tpad', source, label + '_hold', kwargs={'stop_mode': 'clone', 'stop_duration': shot['duration_seconds']})
        source = add('trim', source, label + '_trim', kwargs={'start': 0, 'end': shot['duration_seconds']})
        source = add('setpts', source, label + '_pts', ['PTS-STARTPTS'])
        source = add('settb', source, label + '_tb', ['AVTB'])
        joined.append(source)
    filters.append({'name': 'concat', 'inputs': joined, 'label': 'cut', 'kwargs': {'n': len(joined), 'v': 1, 'a': 0}, 'output': ['video']})
    duration = sum(s['duration_seconds'] for s in shots)
    audio = bool(plan.get('audio_url'))
    if audio:
        inputs.append({'label': 'sound', 'url': plan['audio_url'], 'streams': ['audio']})
        source = 'sound.audio'
        if plan.get('enhance_voice'):
            source = add('nvafx', source, 'voice', kwargs={'effect': 'studio_voice_high_quality'}, audio=True)
        # apad makes a short upload silent after it ends, rather than repeating VO.
        source = add('apad', source, 'audio_pad', kwargs={'whole_dur': duration}, audio=True)
        source = add('atrim', source, 'audio_trim', kwargs={'start': 0, 'end': duration}, audio=True)
        source = add('asetpts', source, 'audio_pts', ['PTS-STARTPTS'], audio=True)
        add('afade', source, 'audio_out', kwargs={'t': 'out', 'st': max(0, duration - 1), 'd': 1}, audio=True)
    return {'client_job_id': client_id, 'inputs': inputs,
            'outputs': [{'url': plan['output_upload_url'], 'streams': ['video', 'audio'] if audio else ['video']}],
            'video_encoder_codec': 'h264_nvenc', 'video_properties': {'fps': 24, 'bitrate': '4M'},
            'audio_encoder_codec': 'aac' if audio else 'copy', 'file_format': 'mp4', 'filters': filters}


class TexelEncoderClient(TexelClient):
    def submit(self, payload):
        result = self._request('/video_encoder/encode', payload)
        job_id = result.get('job_id')
        if not isinstance(job_id, str) or not job_id or len(job_id) > 200:
            raise TexelError('Texel did not return a supported encoder job ID. Resume by the saved client ID before submitting again.')
        return job_id

    def status(self, job_id, client_id):
        path = '/video_encoder/status/' + quote(job_id, safe='') if job_id else '/video_encoder/status_client_id/' + quote(client_id, safe='')
        result = self._request(path, method='GET')
        state = result.get('job_status')
        if state == 'success':
            return {'completed': True, 'progress': 100}
        if state in ('download_error', 'encode_error', 'upload_error', 'unknown_error', 'failed', 'error', 'cancelled', 'canceled') or result.get('error_message'):
            raise TexelJobFailed('Texel processing failed. Check input/output URL access and expiration, then review the job before submitting again.')
        if state not in ('pending', 'encoding', 'processing', 'queued'):
            raise TexelError('Texel returned an unsupported encoder status. Resume the saved job later or inspect it in the dashboard.')
        progress = result.get('progress', 0)
        if not isinstance(progress, (int, float)) or not 0 <= progress <= 100:
            progress = 0
        return {'completed': False, 'progress': progress}
