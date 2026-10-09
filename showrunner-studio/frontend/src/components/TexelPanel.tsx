import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Film, ImagePlus } from "lucide-react";
import type { CharacterEntity, EpisodeEntity, SceneEntity, SetEntity, ShowMeta } from "../types";
import { db } from "../lib/db";
import { compileTexelShots, jsonRequest, texelRequest } from "../lib/texelExport";
import type { TexelCapabilities, TexelShot, TexelShotPlan, TexelTrailer } from "../lib/texelExport";
import { useConfirm } from "./ConfirmDialog";
import { Button, Chip, Field, Spinner, TextArea } from "./ui";

interface Props {
  show: ShowMeta;
  scene: SceneEntity | null;
  sets: SetEntity[];
  characters: CharacterEntity[];
}

export function TexelPanel({ show, scene, sets, characters }: Props) {
  const confirm = useConfirm();
  const [selected, setSelected] = useState<string[]>(scene ? [scene.id] : []);
  const [draft, setDraft] = useState<TexelShotPlan[]>([]);
  const [trailers, setTrailers] = useState<TexelTrailer[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<TexelCapabilities | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const mounted = useRef(true);
  const requestId = useRef(crypto.randomUUID());
  const active = trailers.find((trailer) => trailer.id === activeId) ?? null;
  const running = active?.status === "rendering" || active?.shots.some((shot) => shot.status === "generating" || shot.video_status === "generating");

  const scenes = useLiveQuery(async () => {
    const episodes = await db.episodes.where("showId").equals(show.id).sortBy("order");
    const groups = await Promise.all(episodes.map((episode: EpisodeEntity) => db.scenes.where("episodeId").equals(episode.id).sortBy("order")));
    return groups.flat();
  }, [show.id], [] as SceneEntity[]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    Promise.all([
      texelRequest<TexelCapabilities>("/capabilities", { signal: controller.signal }),
      texelRequest<TexelTrailer[]>(`/trailers?show_id=${encodeURIComponent(show.id)}`, { signal: controller.signal }),
    ]).then(([caps, saved]) => {
      if (!mounted.current) return;
      setCapabilities(caps);
      setTrailers(saved);
      setActiveId(saved[0]?.id ?? null);
      setLoaded(true);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not connect to the studio backend.");
    });
    return () => { mounted.current = false; controller.abort(); };
  }, [show.id]);

  useEffect(() => {
    if (!activeId || !running) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await texelRequest<TexelTrailer>(`/trailers/${activeId}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setTrailers((current) => current.map((item) => item.id === result.id ? result : item));
        setError(null);
        timer = setTimeout(poll, 2000);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Could not refresh generation progress.");
        timer = setTimeout(poll, 5000);
      }
    };
    timer = setTimeout(poll, 1000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [activeId, running]);

  const run = async (action: () => Promise<TexelTrailer>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!mounted.current) return;
      setTrailers((current) => [result, ...current.filter((item) => item.id !== result.id)]);
      setActiveId(result.id);
      setDraft([]);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "The request failed.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const plan = () => {
    try {
      setError(null);
      const selectedScenes = (scenes ?? []).filter((candidate) => selected.includes(candidate.id));
      setDraft(compileTexelShots(show, selectedScenes, sets, characters));
      requestId.current = crypto.randomUUID();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not compile the scenes.");
    }
  };

  const generate = async (shot: TexelShot, prompt: string) => {
    if (!active) return;
    if (shot.status !== "planned" && !await confirm({
      message: "Regenerate this keyframe? This sends one new paid Texel image request and clears its approval and generated clip. If the previous call was interrupted, check Texel billing first.",
      confirmLabel: "Regenerate",
    })) return;
    await run(() => texelRequest<TexelTrailer>(`/trailers/${active.id}/shots/${shot.id}/generate`, jsonRequest({ prompt })));
  };

  const animate = async (shot: TexelShot, prompt: string) => {
    if (!active) return;
    if ((shot.video_job || shot.video_status === "error" || shot.video_status === "interrupted") && !await confirm({
      message: "Generate a new clip? This sends one paid Texel video request. Resume an existing job to check or download it without generating again. Check billing first if its job ID is missing.",
      confirmLabel: "Generate new clip",
    })) return;
    await run(() => texelRequest<TexelTrailer>(`/trailers/${active.id}/shots/${shot.id}/animate`, jsonRequest({ prompt })));
  };

  return (
    <div className="space-y-4 text-[12px]">
      <div>
        <div className="flex items-center gap-2"><Film size={16} className="text-amber-300" /><h2 className="font-semibold text-neutral-100">Outline to Trailer</h2></div>
        <p className="mt-2 leading-relaxed text-neutral-400">Choose up to three scenes. Review prompts, generate Texel keyframes, approve them, then animate each scene and export a trailer with title cards and optional audio.</p>
        <p className="mt-1 text-[11px] text-neutral-500">Texel images + FramePack animation · 16:9 · 720p MP4</p>
      </div>

      {capabilities && <div className="rounded-md border border-neutral-800 p-2.5 text-[11px] leading-relaxed text-neutral-400">
        <p>Image model: <span className="text-neutral-200">{capabilities.image_model}</span></p>
        <p>Video model: <span className="text-neutral-200">{capabilities.video_model}</span></p>
        {!capabilities.configured && <p className="mt-1 text-amber-300">Texel generation is unavailable. Configure TEXEL_API_KEY on the backend. You can prepare and save shot plans now.</p>}
        {!capabilities.ffmpeg_available && <p className="mt-1 text-amber-300">Install FFmpeg on the backend to enable MP4 export.</p>}
      </div>}

      {error && <p role="alert" className="rounded-md border border-red-900 bg-red-950/40 p-3 text-red-300">{error}</p>}
      {!loaded && !error && <p role="status" className="flex items-center gap-2 text-neutral-400"><Spinner /> Connecting to the studio…</p>}

      <fieldset disabled={busy || !!running} className="space-y-2">
        <legend className="mb-2 font-medium text-neutral-200">Scenes in script order ({selected.length}/3)</legend>
        {(scenes ?? []).map((candidate) => <label key={candidate.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-neutral-800 p-2">
          <input type="checkbox" className="mt-0.5 accent-amber-500" checked={selected.includes(candidate.id)}
            disabled={!selected.includes(candidate.id) && selected.length >= 3}
            onChange={() => setSelected((current) => current.includes(candidate.id) ? current.filter((id) => id !== candidate.id) : [...current, candidate.id])} />
          <span>{candidate.sceneName || "Untitled scene"}</span>
        </label>)}
        {!scenes?.length && <p className="text-neutral-500">Create scenes with action to prepare a trailer.</p>}
        <Button onClick={plan} disabled={!loaded || !selected.length} className="w-full">Prepare shot plan · no generation</Button>
      </fieldset>

      {draft.length > 0 && <div className="space-y-3 rounded-lg border border-amber-500/30 p-3">
        <h3 className="font-medium text-amber-200">Review prompts before saving</h3>
        {draft.map((shot, index) => <Field key={shot.id} label={`${index + 1}. ${shot.title}`}>
          <TextArea aria-label={`Keyframe prompt for ${shot.title}`} value={shot.prompt} rows={7} maxLength={8000}
            onChange={(event) => setDraft((current) => current.map((item) => item.id === shot.id ? { ...item, prompt: event.target.value } : item))} />
          <span className="text-[11px] text-neutral-500">{shot.duration_seconds}s scene cut</span>
        </Field>)}
        <Button variant="primary" className="w-full" disabled={busy || draft.some((shot) => !shot.prompt.trim())}
          onClick={() => void run(() => texelRequest<TexelTrailer>("/trailers", jsonRequest({ request_id: requestId.current, show_id: show.id, show_title: show.title.slice(0, 160), shots: draft })))}>
          {busy ? <Spinner /> : null} Save trailer plan
        </Button>
      </div>}

      {trailers.length > 0 && <Field label="Saved trailers">
        <select aria-label="Saved trailers" className="w-full rounded-md border border-neutral-800 bg-neutral-950 p-2 text-neutral-200" value={activeId ?? ""} disabled={busy}
          onChange={(event) => setActiveId(event.target.value)}>
          {trailers.map((trailer, index) => <option key={trailer.id} value={trailer.id}>{trailer.show_title} · {trailer.status} · {index + 1}</option>)}
        </select>
      </Field>}

      {active && <div className="space-y-3">
        <div className="flex items-center justify-between"><h3 className="font-medium text-neutral-100">Keyframe review</h3><Chip tone="amber">{active.status}</Chip></div>
        <p className="text-[11px] text-neutral-500">Each Generate sends one Texel image request. Completed images stay saved. Review the output before approval.</p>
        {active.shots.map((shot) => <ShotCard key={`${active.id}-${shot.id}`} shot={shot} busy={busy || active.status === "rendering"}
          configured={!!capabilities?.configured} videoAvailable={!!capabilities?.video_generation}
          onAnimate={(prompt) => void animate(shot, prompt)}
          onResume={() => void run(() => texelRequest<TexelTrailer>(`/trailers/${active.id}/shots/${shot.id}/resume`, { method: "POST" }))}
          onGenerate={(prompt) => void generate(shot, prompt)}
          onApprove={() => void run(() => texelRequest<TexelTrailer>(`/trailers/${active.id}/shots/${shot.id}/approval`, jsonRequest({ approved: shot.status !== "approved" })))} />)}

        {capabilities?.audio_available && <div className="space-y-2 rounded-md border border-neutral-800 p-3">
          <label className="block space-y-2"><span>Optional score or voiceover · under 20 MB</span>
            <input type="file" accept="audio/*" disabled={busy || !!running} className="block w-full text-[11px] file:mr-2 file:rounded file:border-0 file:bg-neutral-800 file:px-2 file:py-1 file:text-neutral-200"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (file.size > 20 * 1024 * 1024) { setError("Use an audio file under 20 MB."); return; }
                const data = new FormData(); data.append("file", file);
                void run(() => texelRequest<TexelTrailer>(`/trailers/${active.id}/audio`, { method: "POST", body: data }));
              }} />
          </label>
          {active.audio_name ? <div className="flex items-center justify-between gap-2"><span className="truncate text-neutral-400">{active.audio_name}</span>
            <Button size="xs" disabled={busy || !!running} onClick={() => void run(() => texelRequest<TexelTrailer>(`/trailers/${active.id}/audio`, { method: "DELETE" }))}>Remove</Button></div>
            : <p className="text-[11px] text-neutral-500">Without an upload, the trailer exports silently. Uploaded audio loops to fit the cut.</p>}
        </div>}
        {active.error && <p role="alert" className="text-red-300">{active.error}</p>}
        <Button variant="primary" className="w-full" disabled={busy || !!running || !capabilities?.ffmpeg_available || !active.shots.every((shot) => shot.status === "approved" && shot.video_status === "ready")}
          onClick={() => void run(() => texelRequest<TexelTrailer>(`/trailers/${active.id}/render`, jsonRequest({ animated: true })))}>
          {active.status === "rendering" ? <Spinner /> : <Film size={14} />} Assemble animated trailer
        </Button>
        <Button className="w-full" disabled={busy || !!running || !capabilities?.ffmpeg_available || !active.shots.every((shot) => shot.status === "approved")}
          onClick={() => void run(() => texelRequest<TexelTrailer>(`/trailers/${active.id}/render`, { method: "POST" }))}>
          {active.status === "rendering" ? <Spinner /> : <Film size={14} />}
          {active.status === "rendering" ? "Assembling MP4…" : "Export still-image storyboard"}
        </Button>
        {active.video_url && <div className="space-y-2">
          <video controls preload="metadata" src={active.video_url} aria-label={`${active.show_title} ${active.animated ? "animated" : "storyboard"} trailer`} className="w-full rounded-md border border-neutral-800" />
          <a href={`${active.video_url}?download=true`} className="block rounded-md bg-emerald-600 p-2 text-center font-medium text-neutral-950">Download {active.animated ? "trailer" : "storyboard"} MP4</a>
        </div>}
      </div>}
    </div>
  );
}

function ShotCard({ shot, busy, configured, videoAvailable, onGenerate, onApprove, onAnimate, onResume }: {
  shot: TexelShot; busy: boolean; configured: boolean; videoAvailable: boolean; onGenerate: (prompt: string) => void; onApprove: () => void;
  onAnimate: (prompt: string) => void; onResume: () => void;
}) {
  const [prompt, setPrompt] = useState(shot.prompt);
  const [motion, setMotion] = useState(shot.motion_prompt || "Animate this keyframe with natural subject movement and a slow cinematic push in. Preserve cast, setting, and lighting. One continuous shot, no text.");
  const generating = shot.status === "generating" || shot.video_status === "generating";
  const changed = prompt !== shot.prompt;
  return <div className="space-y-2 rounded-lg border border-neutral-800 p-3">
    <div className="flex items-center justify-between gap-2"><h4 className="font-medium text-neutral-200">{shot.title}</h4><Chip tone={shot.status === "approved" ? "green" : "dim"}>{shot.status}</Chip></div>
    {shot.image_url && <img src={shot.image_url} alt={`Generated keyframe for ${shot.title}`} className="aspect-video w-full rounded object-cover" />}
    <details><summary className="cursor-pointer text-[11px] text-neutral-400">View or revise keyframe prompt</summary>
      <TextArea value={prompt} aria-label={`Saved keyframe prompt for ${shot.title}`} rows={6} maxLength={8000} className="mt-2" disabled={busy || generating} onChange={(event) => setPrompt(event.target.value)} />
    </details>
    {changed && <p className="text-[11px] text-amber-300">Generate again to apply this prompt revision.</p>}
    {shot.error && <p role="alert" className="text-[11px] text-red-300">{shot.error}</p>}
    <div className="flex gap-2">
      <Button disabled={busy || generating || !configured || !prompt.trim()} onClick={() => onGenerate(prompt)}>
        {generating ? <Spinner /> : <ImagePlus size={13} />}{generating ? "Generating…" : shot.status === "planned" ? "Generate keyframe" : "Regenerate"}
      </Button>
      {shot.image_url && <Button variant={shot.status === "approved" ? "ghost" : "success"} disabled={busy || generating || changed} onClick={onApprove}>
        <Check size={13} />{shot.status === "approved" ? "Undo approval" : "Approve"}
      </Button>}
    </div>
    {shot.status === "approved" && <div className="space-y-2 border-t border-neutral-800 pt-3">
      <Field label="Motion prompt">
        <TextArea aria-label={`Motion prompt for ${shot.title}`} value={motion} rows={4} maxLength={8000} disabled={busy || generating} onChange={(event) => setMotion(event.target.value)} />
      </Field>
      {shot.video_error && <p role="alert" className="text-[11px] text-amber-300">{shot.video_error}</p>}
      {shot.video_status === "generating" && <p role="status" className="text-amber-300">Animating… {shot.video_progress ?? 0}%</p>}
      {shot.clip_url && <video controls preload="metadata" src={shot.clip_url} aria-label={`Animated clip for ${shot.title}`} className="w-full rounded border border-neutral-800" />}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || generating || !configured || !videoAvailable || !motion.trim() || changed} onClick={() => onAnimate(motion)}>
          <Film size={13} />{shot.video_job || shot.video_status === "error" ? "Generate new clip" : "Animate keyframe"}
        </Button>
        {shot.video_job && shot.video_status === "interrupted" && <Button disabled={busy || generating || !configured || !videoAvailable} onClick={onResume}>Resume saved job · no new generation</Button>}
      </div>
      <p className="text-[11px] text-neutral-500">Animate sends one paid video request. Resume checks the saved job. Review your clip before assembling.</p>
    </div>}
  </div>;
}
