// data.js
import { uid, safeParse, emit } from "./utils.js";

const STORAGE_KEY = "scriptstudio:v2";
const SCHEMA_VERSION = 2;

const defaultProject = () => ({
  id: uid("proj"),
  title: "Untitled Project",
  type: "series",
  logline: "",
  synopsis: "",
  genre: '', // New in v2
  episodes: [],
  characters: [],
  settings: {}, // New in v2
  createdAt: Date.now(),
  updatedAt: Date.now()
});

let state = {
  version: SCHEMA_VERSION,
  projects: [],
  activeId: null,
  settings: {
    autosave: true,
  },
};

function migrate(s) {
  const v = s.version || 1;
  if (v < 2) {
    s.projects = (s.projects || []).map(p => ({
      genre: '',
      ...p,
      episodes: Array.isArray(p.episodes) ? p.episodes : [],
      characters: Array.isArray(p.characters) ? p.characters : [],
      settings: p.settings || {},
    }));
    s.version = 2;
  }
  return s;
}

export const load = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    state.projects = [defaultProject()];
    state.activeId = state.projects[0].id;
    persist(); return;
  }
  try {
    const parsed = JSON.parse(raw);
    state = migrate(parsed);
    persist(); // write back in the new format
    emit('data:changed', { reason: 'load' });
  } catch (e) {
    console.warn('Corrupt storage, resetting:', e);
    localStorage.removeItem(STORAGE_KEY);
    state.projects = [defaultProject()];
    state.activeId = state.projects[0].id;
    persist();
  }
};

export const persist = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  emit("data:changed", snapshot());
};

const _autoPersist = () => {
    if (state.settings.autosave) {
        persist();
    } else {
        emit("data:changed", snapshot());
    }
};

export const snapshot = () => JSON.parse(JSON.stringify(state));
export const getState = () => state; // For verify.js

export const updateSettings = (patch) => {
  Object.assign(state.settings, patch);
  persist();
};

export const getActive = () => state.projects.find(p => p.id === state.activeId) || null;
export const getActiveProject = getActive; // For verify.js

export const setActive = (id) => {
  if (state.projects.some(p => p.id === id)) {
    state.activeId = id;
    _autoPersist();
  }
};
export const setActiveProject = setActive; // For verify.js

export const createProject = (partial = {}) => {
  const p = { ...defaultProject(), ...partial, id: uid("proj"), updatedAt: Date.now() };
  state.projects.unshift(p);
  setActive(p.id); // Use setActive to ensure persist is called
  return p;
};

export const deleteProject = (id) => {
    const initialCount = state.projects.length;
    state.projects = state.projects.filter(p => p.id !== id);
    if (state.projects.length < initialCount) {
        if (state.activeId === id) {
            state.activeId = state.projects[0]?.id ?? null;
        }
        _autoPersist();
    }
};
export const deleteActiveProject = () => {
    if(state.activeId) deleteProject(state.activeId);
};

const defaultScene = () => ({
  id: uid("scene"),
  slugline: "INT. LOCATION - DAY",
  action: "",
  dialogue: ""
});

export const addEpisode = (partial = {}) => {
  const p = getActive(); if (!p) return;
  const number = p.episodes.length + 1;
  const newEpisode = { id: uid("ep"), title: "New Episode", number, outline: "", scenes: [], ...partial };
  p.episodes.push(newEpisode);
  p.updatedAt = Date.now();
  _autoPersist();
  return newEpisode.id;
};

export const updateProject = (patch) => {
  const p = getActive();
  if (!p) return;
  Object.assign(p, patch, { updatedAt: Date.now() });
  _autoPersist();
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
  _autoPersist();
};

export const addCharacter = (partial = {}) => {
  const p = getActive(); if (!p) return;
  const newChar = { id: uid("ch"), name: "New Character", bio: "", goals: "", ...partial };
  p.characters.push(newChar);
  p.updatedAt = Date.now();
  _autoPersist();
  return newChar.id;
};

export const removeCharacter = (id) => {
  const p = getActive(); if (!p) return;
  p.characters = p.characters.filter(c => c.id !== id);
  p.updatedAt = Date.now();
  _autoPersist();
};

const reorderArray = (array, fromIndex, toIndex) => {
  const [item] = array.splice(fromIndex, 1);
  array.splice(toIndex, 0, item);
};

export const reorderProjects = (fromIndex, toIndex) => {
    reorderArray(state.projects, fromIndex, toIndex);
    _autoPersist();
};

export const reorderEpisodes = (fromIndex, toIndex) => {
    const p = getActive();
    if (!p) return;
    reorderArray(p.episodes, fromIndex, toIndex);
    p.episodes.forEach((e, i) => e.number = i + 1);
    p.updatedAt = Date.now();
    _autoPersist();
};

export const reorderCharacters = (fromIndex, toIndex) => {
    const p = getActive();
    if (!p) return;
    reorderArray(p.characters, fromIndex, toIndex);
    p.updatedAt = Date.now();
    _autoPersist();
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
  _autoPersist();
};