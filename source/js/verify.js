// source/js/verify.js
// Tiny assertion helpers
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// Adapt these imports to your actual modules:
import * as Data from './data.js';
import * as API from './api.js';
import * as Utils from './utils.js';
import { initUI } from './ui.js';

export async function runAll({ trace=false, onPass=()=>{}, onFail=()=>{}, onInfo=()=>{} } = {}) {
  let passed = 0, failed = 0;
  const test = async (name, fn) => {
    try {
      await fn();
      passed++; onPass(name);
    } catch (e) {
      failed++; onFail(`${name} — ${e.message || e}`);
      if (trace) console.error(e);
    }
  };

  const totalStart = performance.now();
  onInfo('Starting verification with trace=' + trace);

  // 1) Boot / load
  await test('data.load() initializes state', async () => {
    await Data.load();
    const s = Data.snapshot();
    assert(Array.isArray(s.projects), 'state.projects must be array');
    assert(s.activeId != null, 'activeId should be set');
  });

  // 2) Project CRUD
  await test('create/delete project', async () => {
    const initialCount = Data.snapshot().projects.length;
    const p = Data.createProject({ title: 'Verify Project ' + Utils.uid() });
    const s1 = Data.snapshot();
    assert(s1.projects.length === initialCount + 1, 'project should be added');
    assert(s1.activeId === p.id, 'new project should be active');

    Data.setActive(p.id);
    Data.deleteActiveProject();
    const s2 = Data.snapshot();
    assert(s2.projects.length === initialCount, 'project should be deleted');
  });

  // 3) Update project + persistence
  await test('update project persists to localStorage', async () => {
    const p = Data.createProject({ title: 'Persist Me' });
    Data.setActive(p.id);
    Data.updateProject({ logline: 'A story about tests' });

    // Simulate reload by reloading state from localStorage:
    await Data.load(); // Your load() should rehydrate from storage
    const reloadedProject = Data.getActive();
    assert(reloadedProject.logline === 'A story about tests', 'logline persisted and reloaded');
  });

  // 4) Characters CRUD
  await test('add/remove character', async () => {
    const p = Data.getActive();
    const initialCharCount = p.characters.length;
    Data.addCharacter('Alex');
    let updatedProject = Data.getActive();
    assert(updatedProject.characters.length === initialCharCount + 1, 'character should be added');

    const charId = updatedProject.characters[initialCharCount].id;
    Data.removeCharacter(charId);
    updatedProject = Data.getActive();
    assert(updatedProject.characters.length === initialCharCount, 'character should be removed');
  });

  // 5) Episodes CRUD
  await test('add/remove episode', async () => {
    const p = Data.getActive();
    const initialEpCount = p.episodes.length;
    Data.addEpisode('Pilot');
    let updatedProject = Data.getActive();
    assert(updatedProject.episodes.length === initialEpCount + 1, 'episode should be added');

    const epId = updatedProject.episodes[initialEpCount].id;
    Data.removeEpisode(epId);
    updatedProject = Data.getActive();
    assert(updatedProject.episodes.length === initialEpCount, 'episode should be removed');
  });

  // 6) Event bus reactivity (data:changed -> observed)
  await test('event bus emits data:changed on mutation', async () => {
    let fired = false;
    const off = Utils.on('data:changed', () => { fired = true; });
    Data.updateProject({ synopsis: 'Test' });
    await delay(10);
    off && off();
    assert(fired, 'data:changed should have fired');
  });

  // 7) Mock AI outline + cancellation
  await test('AISession.generateOutline works and cancels', async () => {
    const ai = new API.AISession();
    const ctrl = new AbortController();
    const promise = ai.generateOutline({ title: 'T', logline: 'L' }, { signal: ctrl.signal });
    ctrl.abort();
    let cancelled = false;
    try { await promise; } catch (e) { cancelled = true; }
    assert(cancelled, 'AI generation should be cancellable');

    // normal call
    const outline = await new API.AISession().generateOutline({ title: 'T', logline: 'L' });
    assert(outline && Array.isArray(outline), 'outline should be an array');
  });

  // 8) UI smoke (mount + basic rerender)
  await test('ui.initUI mounts without throwing', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    await initUI({ mount });
    // Optional: poke one field via Data and ensure some DOM text updates if you expose a test hook.
  });

  const totalMs = Math.round(performance.now() - totalStart);
  onInfo(`Done in ${totalMs}ms`);
  return { passed, failed, total: passed + failed, durationMs: totalMs };
}