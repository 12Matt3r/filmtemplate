"""Production encoder contract: https://api.prod.texel.ai/docs/openapi.json.

The current public docs cover processing, not the SDK's generation endpoints.
Caller supplies readable input URLs and a writable output plus readable result URL.
"""
import os
from urllib.parse import quote

from texel_client import TexelClient, TexelError, TexelJobFailed, _public_https


def encoder_request(shots, plan, client_id):
    ordered_ids = [c['shot_id'] for c in plan['clips']]
    if len(ordered_ids) != len(set(ordered_ids)) or set(ordered_ids) != {s['id'] for s in shots}:
        raise ValueError('Supply exactly one clip URL for every shot.')
    shots_by_id = {s['id']: s for s in shots}
    ordered = [(shots_by_id[c['shot_id']], c) for c in plan['clips']]
    durations = [c.get('duration_seconds') or s['duration_seconds'] for s, c in ordered]
    if any(not 0 < d <= 300 for d in durations):
        raise ValueError('Each cloud clip must be between 0 and 300 seconds.')
    fps = plan.get('fps', 24)
    if fps not in (24, 30):
        raise ValueError('Choose 24 or 30 fps.')
    for url in [c['url'] for c in plan['clips']] + [plan['output_upload_url'], plan['output_read_url']] + ([plan['audio_url']] if plan.get('audio_url') else []):
        try:
            _public_https(url)
        except TexelError as exc:
            raise ValueError('Use public HTTPS media URLs and signed storage URLs.') from exc
    if plan.get('enhance_voice') and not plan.get('audio_url'):
        raise ValueError('Supply a voiceover URL before enabling voice enhancement.')
    inputs, filters, joined, clip_audio = [], [], [], []
    keep_audio = bool(plan.get('preserve_audio')) and not plan.get('audio_url')
    def add(name, source, label, args=None, kwargs=None, audio=False):
        item = {'name': name, 'inputs': [source], 'label': label, 'output': ['audio'] if audio else ['video']}
        if args is not None:
            item['args'] = args
        if kwargs is not None:
            item['kwargs'] = kwargs
        filters.append(item)
        return label
    def normalize(source, label):
        if plan.get('normalize_audio'):
            source = add('loudnorm', source, label + '_loudness', kwargs={'I': -16, 'TP': -2, 'LRA': 11}, audio=True)
            source = add('aresample', source, label + '_rate', [48000], audio=True)
        return source
    for index, ((shot, clip), clip_duration) in enumerate(zip(ordered, durations)):
        label = f'clip{index}'
        start = clip.get('start_seconds', 0)
        if not 0 <= start <= 7200:
            raise ValueError('Clip in-points must be between 0 and 7200 seconds.')
        inputs.append({'label': label, 'url': clip['url'], 'streams': ['video', 'audio'] if keep_audio else ['video']})
        source = label + '.video'
        source = add('trim', source, label + '_source', kwargs={'start': start, 'duration': clip_duration})
        source = add('setpts', source, label + '_source_pts', ['PTS-STARTPTS'])
        source = add('scale', source, label + '_scale', [1280, 720], {'force_original_aspect_ratio': 'decrease'})
        source = add('pad', source, label + '_pad', [1280, 720, '(ow-iw)/2', '(oh-ih)/2', 'black'])
        source = add('setsar', source, label + '_sar', ['1'])
        source = add('fps', source, label + '_fps', [fps])
        source = add('tpad', source, label + '_hold', kwargs={'stop_mode': 'clone', 'stop_duration': clip_duration})
        source = add('trim', source, label + '_trim', kwargs={'start': 0, 'end': clip_duration})
        source = add('setpts', source, label + '_pts', ['PTS-STARTPTS'])
        source = add('settb', source, label + '_tb', ['AVTB'])
        joined.append(source)
        if keep_audio:
            source = add('atrim', label + '.audio', label + '_audio_source', kwargs={'start': start, 'duration': clip_duration}, audio=True)
            source = add('asetpts', source, label + '_audio_zero', ['PTS-STARTPTS'], audio=True)
            source = normalize(source, label)
            source = add('apad', source, label + '_audio_pad', kwargs={'whole_dur': clip_duration}, audio=True)
            source = add('atrim', source, label + '_audio_trim', kwargs={'duration': clip_duration}, audio=True)
            source = add('asetpts', source, label + '_audio_pts', ['PTS-STARTPTS'], audio=True)
            clip_audio.append(source)
    filters.append({'name': 'concat', 'inputs': joined, 'label': 'cut', 'kwargs': {'n': len(joined), 'v': 1, 'a': 0}, 'output': ['video']})
    duration = sum(durations)
    audio = bool(plan.get('audio_url')) or keep_audio
    if keep_audio:
        filters.append({'name': 'concat', 'inputs': clip_audio, 'label': 'audio_out', 'kwargs': {'n': len(clip_audio), 'v': 0, 'a': 1}, 'output': ['audio']})
    if plan.get('audio_url'):
        inputs.append({'label': 'sound', 'url': plan['audio_url'], 'streams': ['audio']})
        source = 'sound.audio'
        source = add('atrim', source, 'sound_source', kwargs={'start': plan.get('audio_start_seconds', 0), 'duration': duration}, audio=True)
        source = add('asetpts', source, 'sound_zero', ['PTS-STARTPTS'], audio=True)
        if plan.get('enhance_voice'):
            source = add('nvafx', source, 'voice', kwargs={'effect': 'studio_voice_high_quality'}, audio=True)
        source = normalize(source, 'sound')
        # apad makes a short upload silent after it ends, rather than repeating VO.
        source = add('apad', source, 'audio_pad', kwargs={'whole_dur': duration}, audio=True)
        source = add('atrim', source, 'audio_trim', kwargs={'start': 0, 'end': duration}, audio=True)
        source = add('asetpts', source, 'audio_pts', ['PTS-STARTPTS'], audio=True)
        add('afade', source, 'audio_out', kwargs={'t': 'out', 'st': max(0, duration - 1), 'd': 1}, audio=True)
    return {'client_job_id': client_id, 'inputs': inputs,
            'outputs': [{'url': plan['output_upload_url'], 'streams': ['video', 'audio'] if audio else ['video']}],
            'video_encoder_codec': 'h264_nvenc', 'video_properties': {'fps': fps, 'bitrate': '4M'},
            # Texel currently emits -aq even when quality is omitted. A concrete
            # AAC quality avoids an empty option swallowing the following -ar.
            'audio_encoder_codec': 'aac' if audio else 'copy', 'audio_properties': {'sample_rate': 48000, 'channels': 2, 'bitrate': '192k', 'quality': '2'},
            'file_format': 'mp4', 'filters': filters}


class TexelEncoderClient(TexelClient):
    def __init__(self):
        super().__init__()
        self.key = os.environ.get('TEXEL_EDITING_API_KEY') or self.key

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
