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
  const cloud = trailer.cloud_render;
  const https = (url: string) => { try { const parsed = new URL(url); return parsed.protocol === "https:" && !parsed.username && !parsed.password; } catch { return false; } };
  const valid = trailer.shots.every((shot) => https(urls[shot.id] ?? "")) && https(upload) && https(download) && (!audio || https(audio));
  const render = async () => {
    if (cloud && !await confirm({ message: "Submit a new Texel processing job? This may incur a charge. Resume an interrupted job to check its result without submitting again.", confirmLabel: "Submit new render" })) return;
    onRender({ clips: trailer.shots.map((shot) => ({ shot_id: shot.id, url: urls[shot.id] })), output_upload_url: upload,
      output_read_url: download, audio_url: audio || null, enhance_voice: !!audio && enhance });
  };
  return <details className="space-y-3 rounded-lg border border-amber-500/30 p-3" open={cloud ? true : undefined}>
    <summary className="cursor-pointer font-medium text-amber-200">Render clips with Texel’s production API</summary>
    <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">Join your scene clips in script order, fit them to 720p, and optionally add or enhance voiceover. Use hosted clips from any source. This cloud cut contains the selected clips; title cards remain part of the local export.</p>
    <p className="text-[11px] text-neutral-500">Texel needs readable HTTPS media URLs and a signed upload URL plus a read URL for the same output file. Keep those storage links valid until processing and download finish.</p>
    <fieldset disabled={busy} className="space-y-2">
      {trailer.shots.map((shot) => <Field key={shot.id} label={`${shot.title} · ${shot.duration_seconds}s`}>
        <Input type="url" aria-label={`Hosted clip URL for ${shot.title}`} value={urls[shot.id] ?? ""} placeholder="https://…" onChange={(event) => setUrls((current) => ({ ...current, [shot.id]: event.target.value }))} />
      </Field>)}
      <Field label="Output signed upload URL"><Input type="url" aria-label="Output signed upload URL" value={upload} placeholder="https://…" onChange={(event) => setUpload(event.target.value)} /></Field>
      <Field label="Output read URL"><Input type="url" aria-label="Output read URL" value={download} placeholder="https://…" onChange={(event) => setDownload(event.target.value)} /></Field>
      <Field label="Optional hosted audio URL"><Input type="url" aria-label="Hosted audio URL" value={audio} placeholder="https://…" onChange={(event) => setAudio(event.target.value)} /></Field>
      <label className="flex items-start gap-2 text-[11px] text-neutral-300"><input type="checkbox" className="accent-amber-500" checked={enhance} disabled={!audio} onChange={(event) => setEnhance(event.target.checked)} />Enhance recorded voiceover with Texel Studio Voice</label>
      <p className="text-[11px] text-neutral-500">Short audio ends in silence; it is not looped. Voice enhancement is for speech, not background music.</p>
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
