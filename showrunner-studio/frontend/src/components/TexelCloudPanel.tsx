import { useState } from "react";
import type { TexelTrailer } from "../lib/texelExport";
import { Button, Field, TextInput as Input, Spinner } from "./ui";
import { useConfirm } from "./ConfirmDialog";

export function TexelCloudPanel({ trailer, busy, configured, available, onRender, onResume }: {
  trailer: TexelTrailer; busy: boolean; configured: boolean; available: boolean;
  onRender: (payload: unknown) => void; onResume: (readUrl?: string) => void;
}) {
  const confirm = useConfirm();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [upload, setUpload] = useState("");
  const [download, setDownload] = useState("");
  const [audio, setAudio] = useState("");
  const [enhance, setEnhance] = useState(false);
  const [keepAudio, setKeepAudio] = useState(true);
  const [normalize, setNormalize] = useState(true);
  const [order, setOrder] = useState(() => trailer.shots.map((shot) => shot.id));
  const [starts, setStarts] = useState<Record<string, string>>({});
  const [durations, setDurations] = useState<Record<string, string>>({});
  const [audioStart, setAudioStart] = useState("0");
  const cloud = trailer.cloud_render;
  const orderedShots = order.map((id) => trailer.shots.find((shot) => shot.id === id)!);
  const move = (index: number, direction: number) => setOrder((current) => {
    const next = [...current];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    return next;
  });
  const validTiming = (value: string, min: number, max: number) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;
  const https = (url: string) => { try { const parsed = new URL(url); return parsed.protocol === "https:" && !parsed.username && !parsed.password; } catch { return false; } };
  const valid = trailer.shots.every((shot) => https(urls[shot.id] ?? "") && validTiming(starts[shot.id] ?? "0", 0, 7200) && validTiming(durations[shot.id] ?? String(shot.duration_seconds), .1, 300)) && https(upload) && https(download) && (!audio || (https(audio) && validTiming(audioStart, 0, 7200)));
  const render = async () => {
    if (cloud && !await confirm({ message: "Submit a new Texel processing job? This may incur a charge. Resume an interrupted job to check its result without submitting again.", confirmLabel: "Submit new render" })) return;
    onRender({ clips: orderedShots.map((shot) => ({ shot_id: shot.id, url: urls[shot.id], start_seconds: Number(starts[shot.id] ?? 0), duration_seconds: Number(durations[shot.id] ?? shot.duration_seconds) })), output_upload_url: upload,
      output_read_url: download, audio_url: audio || null, audio_start_seconds: audio ? Number(audioStart) : 0, enhance_voice: !!audio && enhance,
      preserve_audio: !audio && keepAudio, normalize_audio: normalize, fps: 30 });
  };
  return <details className="space-y-3 rounded-lg border border-amber-500/30 p-3" open={cloud ? true : undefined}>
    <summary className="cursor-pointer font-medium text-amber-200">Render clips with Texel’s production API</summary>
    <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">Trim and reorder your clips, normalize their audio, and render a 720p/30 fps cut with Texel. Use hosted footage from any source. Each clip can run up to five minutes.</p>
    {!configured && <p className="text-[11px] text-amber-300">Configure the video editing key on the backend to enable cloud renders.</p>}
    <p className="text-[11px] text-neutral-500">Texel needs readable HTTPS media URLs and a signed upload URL plus a read URL for the same output file. Keep those storage links valid until processing and download finish.</p>
    <fieldset disabled={busy} className="space-y-2">
      {orderedShots.map((shot, index) => <div key={shot.id} className="space-y-2 rounded border border-neutral-800 p-2"><Field label={`${index + 1}. ${shot.title}`}>
        <Input type="url" aria-label={`Hosted clip URL for ${shot.title}`} value={urls[shot.id] ?? ""} placeholder="https://…" onChange={(event) => setUrls((current) => ({ ...current, [shot.id]: event.target.value }))} />
      </Field><div className="grid grid-cols-2 gap-2">
        <Field label="Start in source (seconds)"><Input type="number" min="0" max="7200" step="0.1" aria-label={`Source start for ${shot.title}`} value={starts[shot.id] ?? "0"} onChange={(event) => setStarts((current) => ({ ...current, [shot.id]: event.target.value }))} /></Field>
        <Field label="Length (seconds)"><Input type="number" min="0.1" max="300" step="0.1" aria-label={`Clip length for ${shot.title}`} value={durations[shot.id] ?? String(shot.duration_seconds)} onChange={(event) => setDurations((current) => ({ ...current, [shot.id]: event.target.value }))} /></Field>
      </div><div className="flex gap-2">
        <Button aria-label={`Move ${shot.title} up`} disabled={index === 0} onClick={() => move(index, -1)}>Move up</Button>
        <Button aria-label={`Move ${shot.title} down`} disabled={index === orderedShots.length - 1} onClick={() => move(index, 1)}>Move down</Button>
      </div></div>)}
      <Field label="Output signed upload URL"><Input type="url" aria-label="Output signed upload URL" value={upload} placeholder="https://…" onChange={(event) => setUpload(event.target.value)} /></Field>
      <Field label="Output read URL"><Input type="url" aria-label="Output read URL" value={download} placeholder="https://…" onChange={(event) => setDownload(event.target.value)} /></Field>
      <Field label="Optional hosted audio URL"><Input type="url" aria-label="Hosted audio URL" value={audio} placeholder="https://…" onChange={(event) => setAudio(event.target.value)} /></Field>
      {!!audio && <Field label="Audio start in source (seconds)"><Input type="number" min="0" max="7200" step="0.1" aria-label="Audio source start" value={audioStart} onChange={(event) => setAudioStart(event.target.value)} /></Field>}
      <label className="flex items-start gap-2 text-[11px] text-neutral-300"><input type="checkbox" className="accent-amber-500" checked={keepAudio} disabled={!!audio} onChange={(event) => setKeepAudio(event.target.checked)} />Keep original clip audio</label>
      {!audio && keepAudio && <p className="text-[11px] text-neutral-500">Each supplied clip must contain an audio track.</p>}
      <label className="flex items-start gap-2 text-[11px] text-neutral-300"><input type="checkbox" className="accent-amber-500" checked={normalize} onChange={(event) => setNormalize(event.target.checked)} />Normalize audio loudness</label>
      <label className="flex items-start gap-2 text-[11px] text-neutral-300"><input type="checkbox" className="accent-amber-500" checked={enhance} disabled={!audio} onChange={(event) => setEnhance(event.target.checked)} />Enhance recorded voiceover with Texel Studio Voice</label>
      <p className="text-[11px] text-neutral-500">A supplied soundtrack replaces clip audio. Short audio ends in silence. Voice enhancement is for speech.</p>
      <Button variant="primary" className="w-full" disabled={busy || !configured || !available || !valid} onClick={() => void render()}>Render scene cut with Texel</Button>
    </fieldset>
    {cloud && <div className="space-y-2 text-[11px]">
      <p role="status" className="flex items-center gap-2 text-amber-300">{cloud.status === "running" && <Spinner />}Texel render: {cloud.status} · {cloud.progress}%</p>
      {cloud.error && <p role="alert" className="text-amber-300">{cloud.error}</p>}
      {cloud.status === "interrupted" && <p className="text-neutral-400">If the download link expired, enter a fresh Output read URL for the same file before resuming.</p>}
      {cloud.status === "interrupted" && <Button disabled={busy || !configured || !available} onClick={() => onResume(download || undefined)}>Resume cloud render · no new submission</Button>}
    </div>}
  </details>;
}
