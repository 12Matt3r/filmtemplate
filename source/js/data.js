// data.js
import { uid, safeParse, emit } from "./utils.js";

const LS_KEY = "scriptstudio.v1";

const defaultProject = () => ({
  id: uid("proj"),
  title: "Untitled Project",
  type: "series",              // 'series' | 'film'
  logline: "",
  synopsis: "",
  episodes: [],                // [{ id, title, number, outline, scenes: [...] }]
  characters: [],              // [{ id, name, bio, goals }]
  createdAt: Date.now(),
  updatedAt: Date.now()
});

const state = {
  projects: [],
  activeId: null
};

export const load = () => {
  const saved = safeParse(localStorage.getItem(LS_KEY), null);
  if (saved && Array.isArray(saved.projects) && saved.projects.length > 0) {
    state.projects = saved.projects;
    state.activeId = saved.activeId ?? saved.projects[0]?.id ?? null;
  } else {
    const p = defaultProject();
    state.projects = [p];
    state.activeId = p.id;
  }
  emit("data:changed", snapshot());
};

const persist = () => {
  localStorage.setItem(LS_KEY, JSON.stringify({
    projects: state.projects,
    activeId: state.activeId
  }));
  emit("data:changed", snapshot());
};

export const snapshot = () => JSON.parse(JSON.stringify(state));

export const getActive = () => state.projects.find(p => p.id === state.activeId) || null;

export const setActive = (id) => {
  if (state.projects.some(p => p.id === id)) {
    state.activeId = id;
    persist();
  }
};

export const createProject = (partial = {}) => {
  const p = { ...defaultProject(), ...partial, id: uid("proj"), updatedAt: Date.now() };
  state.projects.unshift(p);
  state.activeId = p.id;
  persist();
  return p;
};

export const updateProject = (patch) => {
  const p = getActive();
  if (!p) return;
  Object.assign(p, patch, { updatedAt: Date.now() });
  persist();
};

export const deleteActiveProject = () => {
  const idx = state.projects.findIndex(p => p.id === state.activeId);
  if (idx >= 0) state.projects.splice(idx, 1);
  state.activeId = state.projects[0]?.id ?? null;
  persist();
};

const defaultScene = () => ({
  id: uid("scene"),
  slugline: "INT. LOCATION - DAY",
  action: "",
  dialogue: ""
});

export const addEpisode = (title = "Episode") => {
  const p = getActive(); if (!p) return;
  const number = p.episodes.length + 1;
  p.episodes.push({ id: uid("ep"), title, number, outline: "", scenes: [] });
  p.updatedAt = Date.now();
  persist();
};

export const addScene = (episodeId) => {
    const p = getActive();
    if (!p) return;
    const episode = p.episodes.find(e => e.id === episodeId);
    if (!episode) return;
    episode.scenes.push(defaultScene());
    updateProject({ episodes: p.episodes });
};

export const updateScene = (episodeId, sceneId, patch) => {
    const p = getActive();
    if (!p) return;
    const episode = p.episodes.find(e => e.id === episodeId);
    if (!episode) return;
    const scene = episode.scenes.find(s => s.id === sceneId);
    if (!scene) return;
    Object.assign(scene, patch);
    updateProject({ episodes: p.episodes });
};

export const removeScene = (episodeId, sceneId) => {
    const p = getActive();
    if (!p) return;
    const episode = p.episodes.find(e => e.id === episodeId);
    if (!episode) return;
    episode.scenes = episode.scenes.filter(s => s.id !== sceneId);
    updateProject({ episodes: p.episodes });
};

export const removeEpisode = (id) => {
  const p = getActive(); if (!p) return;
  p.episodes = p.episodes.filter(e => e.id !== id);
  p.episodes.forEach((e, i) => e.number = i + 1);
  p.updatedAt = Date.now();
  persist();
};

export const addCharacter = (name = "New Character") => {
  const p = getActive(); if (!p) return;
  p.characters.push({ id: uid("ch"), name, bio: "", goals: "" });
  p.updatedAt = Date.now();
  persist();
};

export const removeCharacter = (id) => {
  const p = getActive(); if (!p) return;
  p.characters = p.characters.filter(c => c.id !== id);
  p.updatedAt = Date.now();
  persist();
};

export const exportJSON = () => {
  const p = getActive(); if (!p) return null;
  return JSON.stringify(p, null, 2);
};

export const importJSON = (json) => {
  const obj = safeParse(json, null);
  if (!obj || !obj.title) throw new Error("Invalid project JSON");
  const p = { ...defaultProject(), ...obj, id: uid("proj"), createdAt: Date.now(), updatedAt: Date.now() };
  state.projects.unshift(p);
  state.activeId = p.id;
  persist();
};