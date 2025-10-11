// ui.js
import { on, emit, debounce } from "./utils.js";
import {
  snapshot, getActive, setActive, updateSettings, persist,
  createProject, updateProject, deleteActiveProject,
  addEpisode, removeEpisode, addScene, updateScene, removeScene,
  addCharacter, removeCharacter, reorderProjects, reorderEpisodes, reorderCharacters,
  exportJSON, importJSON
} from "./data.js";
import { AISession } from "./api.js";

let ai = null;

const $ = (sel, parent = document) => parent.querySelector(sel);
const $$ = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));

const els = {};

export const initUI = ({ mount }) => {
  if (!mount) throw new Error("initUI requires a `mount` element.");

  // This is a simplified template. In a real app, you might use a more robust
  // templating library, but for this project, this is sufficient.
  mount.innerHTML = `
    <header class="app-header">
      <h1>Script Studio</h1>
      <div>
        <button id="save-btn" class="btn btn--primary" hidden>Save Changes</button>
        <button id="new-project-btn" class="btn">New Project</button>
      </div>
    </header>
    <main class="grid">
      <section aria-labelledby="projects-title" class="panel">
        <h2 id="projects-title">Projects</h2>
        <ul id="project-list" class="list"></ul>
      </section>
      <section aria-labelledby="editor-title" class="panel">
        <h2 id="editor-title">Editor</h2>
        <div class="field">
          <label for="project-title">Title</label>
          <input id="project-title" type="text" placeholder="Series or Film Title" />
        </div>
        <div class="tabs" role="tablist">
          <button data-tab="overview" class="tab tab--active" role="tab" aria-controls="tab-overview">Overview</button>
          <button data-tab="episodes" class="tab" role="tab" aria-controls="tab-episodes">Episodes</button>
          <button data-tab="characters" class="tab" role="tab" aria-controls="tab-characters">Characters</button>
          <button data-tab="settings" class="tab" role="tab" aria-controls="tab-settings">Settings</button>
        </div>
        <div id="tab-overview" class="tabpane tabpane--active" role="tabpanel" aria-labelledby="tab-overview">
          <div class="field">
            <label for="logline">Logline</label>
            <textarea id="logline" rows="3" placeholder="One-sentence hook…"></textarea>
          </div>
          <div class="field">
            <label for="synopsis">Synopsis</label>
            <div class="rich-text-editor">
              <div class="toolbar">
                <button data-command="bold" class="btn btn--tiny"><b>B</b></button>
                <button data-command="italic" class="btn btn--tiny"><i>I</i></button>
              </div>
              <div id="synopsis" class="editable" contenteditable="true" role="textbox" aria-multiline="true"></div>
            </div>
          </div>
          <button id="generate-outline-btn" class="btn btn--primary">AI: Generate Outline</button>
          <div id="ai-output" class="output" aria-live="polite"></div>
        </div>
        <div id="tab-episodes" class="tabpane">
          <button id="add-episode-btn" class="btn">Add Episode</button>
          <ul id="episode-list" class="list"></ul>
        </div>
        <div id="tab-characters" class="tabpane">
          <button id="add-character-btn" class="btn">Add Character</button>
          <ul id="character-list" class="list"></ul>
        </div>
        <div id="tab-settings" class="tabpane">
          <div class="field">
            <label for="project-type">Project Type</label>
            <select id="project-type">
              <option value="series">Series</option>
              <option value="film">Film</option>
            </select>
          </div>
          <label class="row">
            <span>Autosave</span>
            <input id="autosave-toggle" type="checkbox" checked />
          </label>
          <button id="export-json-btn" class="btn">Export JSON</button>
          <input id="import-json-input" type="file" accept="application/json" hidden />
          <button id="import-json-btn" class="btn">Import JSON</button>
          <button id="delete-project-btn" class="btn btn--danger">Delete Project</button>
        </div>
      </section>
    </main>
  `;

  // Cache elements
  els.projectList = $("#project-list", mount);
  els.newProjectBtn = $("#new-project-btn", mount);
  els.saveBtn = $("#save-btn");
  els.title = $("#project-title");
  els.logline = $("#logline");
  els.synopsis = $("#synopsis");
  els.tabs = $$(".tab");
  els.panes = {
    overview: $("#tab-overview"),
    episodes: $("#tab-episodes"),
    characters: $("#tab-characters"),
    settings: $("#tab-settings")
  };
  els.addEp = $("#add-episode-btn");
  els.epList = $("#episode-list");
  els.addChar = $("#add-character-btn");
  els.charList = $("#character-list");
  els.generate = $("#generate-outline-btn");
  els.aiOut = $("#ai-output");
  els.projectType = $("#project-type");
  els.autosave = $("#autosave-toggle");
  els.exportBtn = $("#export-json-btn");
  els.importBtn = $("#import-json-btn");
  els.importInput = $("#import-json-input");
  els.deleteBtn = $("#delete-project-btn");

  bindEvents();
  renderAll();
};

function bindEvents() {
  els.newProjectBtn.addEventListener("click", () => {
    const title = prompt("Project title?");
    if (title) {
        createProject({ title: title.trim() || "Untitled Project" });
    }
  });

  els.title.addEventListener("input", debounce((e) => {
    updateProject({ title: e.target.value });
  }, 200));

  els.logline.addEventListener("input", debounce((e) => {
    updateProject({ logline: e.target.value });
  }, 200));

  els.synopsis.addEventListener("input", debounce((e) => {
    updateProject({ synopsis: e.target.innerHTML });
  }, 200));

  els.projectType.addEventListener("change", (e) => {
    updateProject({ type: e.target.value });
  });

  els.tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      els.tabs.forEach(b => b.classList.remove("tab--active"));
      btn.classList.add("tab--active");
      const tab = btn.dataset.tab;
      Object.entries(els.panes).forEach(([k, pane]) =>
        pane.classList.toggle("tabpane--active", k === tab)
      );
    });
  });

  els.addEp.addEventListener("click", () => {
    const p = getActive();
    if (!p) return;
    const currentEpisodeCount = p.episodes.length;
    addEpisode("New Episode");

    // Wait for the re-render and then focus the new element.
    setTimeout(() => {
      const newEpisodeInput = els.epList.querySelector(`.list-item:nth-child(${currentEpisodeCount + 1}) input.inline-input`);
      if (newEpisodeInput) {
        newEpisodeInput.focus();
        newEpisodeInput.select();
      }
    }, 0);
  });

  els.addChar.addEventListener("click", () => {
    const p = getActive();
    if (!p) return;
    const currentCharacterCount = p.characters.length;
    addCharacter("New Character");

    // Wait for the re-render and then focus the new element.
    setTimeout(() => {
      const newCharacterInput = els.charList.querySelector(`.list-item:nth-child(${currentCharacterCount + 1}) input.inline-input`);
      if (newCharacterInput) {
        newCharacterInput.focus();
        newCharacterInput.select();
      }
    }, 0);
  });

  els.generate.addEventListener("click", async () => {
    try {
      ai?.abort();
      ai = new AISession();
      els.aiOut.textContent = "Generating…";
      const p = getActive();
      const text = await ai.generateOutline({
        title: p.title, logline: p.logline, type: p.type, episodes: p.episodes.length || 8
      });
      els.aiOut.textContent = text;
    } catch (e) {
      if (e.message !== 'aborted') {
        els.aiOut.textContent = "Generation failed.";
      } else {
        els.aiOut.textContent = "Generation cancelled.";
      }
    }
  });

  els.exportBtn.addEventListener("click", () => {
    const json = exportJSON();
    if (!json) return;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: "project.json" });
    a.click();
    URL.revokeObjectURL(url);
  });

  els.importBtn.addEventListener("click", () => els.importInput.click());
  els.importInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const text = await file.text();
    try { importJSON(text); } catch (err) { alert(err.message); }
    e.target.value = "";
  });

  els.autosave.addEventListener("change", (e) => {
    updateSettings({ autosave: e.target.checked });
  });

  els.saveBtn.addEventListener("click", () => {
    persist();
  });

  els.deleteBtn.addEventListener("click", () => {
    if (confirm("Delete current project?")) deleteActiveProject();
  });

  attachToolbarListeners(els.synopsis.parentElement);
  attachDragAndDropListeners(els.projectList, reorderProjects);
  attachDragAndDropListeners(els.epList, reorderEpisodes);
  attachDragAndDropListeners(els.charList, reorderCharacters);

  // Reactivity
  on("data:changed", renderAll);
}

function renderAll() {
  const snap = snapshot();
  els.saveBtn.hidden = snap.settings.autosave;
  renderProjectList(snap);
  const activeProject = getActive();
  if (activeProject) {
      renderEditor(activeProject, snap.settings);
  } else {
      // If there's no active project, clear the editor panel
      els.title.value = "";
      els.logline.value = "";
      els.synopsis.innerHTML = "";
      els.epList.innerHTML = "";
      els.charList.innerHTML = "";
      // Hide all tabs except overview
      els.tabs.forEach(tab => {
          const tabName = tab.dataset.tab;
          const pane = els.panes[tabName];
          if(pane) {
              const isActive = tabName === 'overview';
              tab.classList.toggle('tab--active', isActive);
              pane.classList.toggle('tabpane--active', isActive);
          }
      });
  }
}

function renderProjectList({ projects, activeId }) {
  els.projectList.innerHTML = "";
  projects.forEach(p => {
    const li = document.createElement("li");
    li.className = "list-item";
    li.setAttribute('draggable', true);
    li.innerHTML = `
      <button class="link ${p.id === activeId ? "is-active" : ""}" data-id="${p.id}">
        ${escapeHTML(p.title)}
      </button>`;
    li.querySelector("button").addEventListener("click", () => setActive(p.id));
    els.projectList.appendChild(li);
  });
}

function renderEditor(p, settings) {
  if (!p) return;
  els.title.value = p.title || "";
  els.logline.value = p.logline || "";
  els.synopsis.innerHTML = p.synopsis || "";
  els.projectType.value = p.type;
  els.autosave.checked = settings.autosave;

  // Conditionally show/hide the Episodes tab
  const episodesTab = els.tabs.find(tab => tab.dataset.tab === "episodes");
  if (episodesTab) {
    episodesTab.hidden = (p.type === 'film');
  }

  // If the episodes tab is now hidden but was active, switch to the overview tab
  if (episodesTab && episodesTab.hidden && episodesTab.classList.contains('tab--active')) {
    els.tabs.find(tab => tab.dataset.tab === 'overview').click();
  }

  renderEpisodes(p);
  renderCharacters(p);
}

function renderEpisodes(p) {
  els.epList.innerHTML = "";
  p.episodes.forEach((ep, index) => {
    const li = document.createElement("li");
    li.className = "list-item";
    li.setAttribute('draggable', true);
    li.innerHTML = `
      <div class="row">
        <strong>#${index + 1}</strong>
        <input class="inline-input" value="${escapeAttr(ep.title)}" />
        <button class="btn btn--tiny" data-action="del" aria-label="Delete Episode">×</button>
      </div>
      <div class="rich-text-editor">
        <div class="toolbar">
          <button data-command="bold" class="btn btn--tiny"><b>B</b></button>
          <button data-command="italic" class="btn btn--tiny"><i>I</i></button>
        </div>
        <div class="editable outline" contenteditable="true" role="textbox" aria-multiline="true">${ep.outline || ""}</div>
      </div>
      <div class="scene-controls">
        <button class="btn btn--tiny" data-action="add-scene">Add Scene</button>
      </div>
      <ul class="scene-list"></ul>
    `;
    const [titleInput, delBtn, outlineEditor, addSceneBtn, sceneList] = [
      li.querySelector("input"),
      li.querySelector('[data-action="del"]'),
      li.querySelector(".rich-text-editor"),
      li.querySelector('[data-action="add-scene"]'),
      li.querySelector('.scene-list')
    ];
    const outlineEditable = outlineEditor.querySelector('.editable');

    titleInput.addEventListener("input", debounce((e) => {
      const episode = p.episodes.find(item => item.id === ep.id);
      if(episode) {
        episode.title = e.target.value;
        updateProject({ episodes: p.episodes });
      }
    }, 200));

    outlineEditable.addEventListener("input", debounce((e) => {
      const episode = p.episodes.find(item => item.id === ep.id);
      if(episode) {
        episode.outline = e.target.innerHTML;
        updateProject({ episodes: p.episodes });
      }
    }, 200));

    attachToolbarListeners(outlineEditor);
    addSceneBtn.addEventListener("click", () => addScene(ep.id));
    delBtn.addEventListener("click", () => removeEpisode(ep.id));

    renderScenes(sceneList, ep.id, ep.scenes);

    els.epList.appendChild(li);
  });
}

function renderCharacters(p) {
  els.charList.innerHTML = "";
  p.characters.forEach(ch => {
    const li = document.createElement("li");
    li.className = "list-item";
    li.setAttribute('draggable', true);
    li.innerHTML = `
      <div class="row">
        <input class="inline-input" value="${escapeAttr(ch.name)}" />
        <button class="btn btn--tiny" data-action="del" aria-label="Delete Character">×</button>
      </div>
      <textarea rows="2" class="block" placeholder="Bio…">${escapeHTML(ch.bio || "")}</textarea>
      <textarea rows="2" class="block" placeholder="Goals…">${escapeHTML(ch.goals || "")}</textarea>
    `;
    const [nameInput, delBtn, bioTa, goalsTa] = [
      li.querySelector("input"),
      li.querySelector('[data-action="del"]'),
      li.querySelectorAll("textarea")
    ];
    const [bioEl, goalsEl] = [bioTa[0], bioTa[1]];
    nameInput.addEventListener("input", debounce((e) => {
        const character = p.characters.find(item => item.id === ch.id);
        if(character){
            character.name = e.target.value;
            updateProject({ characters: p.characters });
        }
    }, 200));
    bioEl.addEventListener("input", debounce((e) => {
        const character = p.characters.find(item => item.id === ch.id);
        if(character){
            character.bio = e.target.value;
            updateProject({ characters: p.characters });
        }
    }, 200));
    goalsEl.addEventListener("input", debounce((e) => {
        const character = p.characters.find(item => item.id === ch.id);
        if(character){
            character.goals = e.target.value;
            updateProject({ characters: p.characters });
        }
    }, 200));
    delBtn.addEventListener("click", () => removeCharacter(ch.id));
    els.charList.appendChild(li);
  });
}

function renderScenes(container, episodeId, scenes) {
  container.innerHTML = "";
  scenes.forEach(scene => {
    const li = document.createElement("li");
    li.className = "scene-item";
    li.innerHTML = `
      <div class="scene-header row">
        <input class="inline-input slugline" value="${escapeAttr(scene.slugline)}" placeholder="INT. LOCATION - DAY" />
        <button class="btn btn--tiny" data-action="del-scene" aria-label="Delete Scene">×</button>
      </div>
      <textarea class="block action" rows="3" placeholder="Action…">${escapeHTML(scene.action || "")}</textarea>
      <textarea class="block dialogue" rows="3" placeholder="Dialogue…">${escapeHTML(scene.dialogue || "")}</textarea>
    `;

    const sluglineInput = li.querySelector(".slugline");
    const actionTextarea = li.querySelector(".action");
    const dialogueTextarea = li.querySelector(".dialogue");
    const deleteBtn = li.querySelector("[data-action='del-scene']");

    sluglineInput.addEventListener("input", debounce((e) => {
      updateScene(episodeId, scene.id, { slugline: e.target.value });
    }, 200));

    actionTextarea.addEventListener("input", debounce((e) => {
      updateScene(episodeId, scene.id, { action: e.target.value });
    }, 200));

    dialogueTextarea.addEventListener("input", debounce((e) => {
      updateScene(episodeId, scene.id, { dialogue: e.target.value });
    }, 200));

    deleteBtn.addEventListener("click", () => {
      removeScene(episodeId, scene.id);
    });

    container.appendChild(li);
  });
}

function attachToolbarListeners(editorElement) {
    const toolbar = editorElement.querySelector('.toolbar');
    const editable = editorElement.querySelector('.editable');

    if (!toolbar || !editable) return;

    toolbar.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        e.preventDefault();
        const command = button.dataset.command;

        if (command) {
            document.execCommand(command, false, null);
            editable.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
}

function attachDragAndDropListeners(container, reorderFn) {
    let dragEl = null;

    container.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('list-item')) {
            dragEl = e.target;
            setTimeout(() => {
                e.target.classList.add('dragging');
            }, 0);
        }
    });

    container.addEventListener('dragend', (e) => {
        if (dragEl) {
            dragEl.classList.remove('dragging');
            dragEl = null;
        }
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const target = e.target.closest('.list-item');
        if (!target) return;

        const currentlyOver = container.querySelector('.drag-over');
        if (currentlyOver) currentlyOver.classList.remove('drag-over');

        target.classList.add('drag-over');
    });

    container.addEventListener('dragleave', (e) => {
        const target = e.target.closest('.list-item');
        if (target) {
            target.classList.remove('drag-over');
        }
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        const dropTarget = e.target.closest('.list-item');

        const currentlyOver = container.querySelector('.drag-over');
        if (currentlyOver) currentlyOver.classList.remove('drag-over');

        if (dragEl && dropTarget && dragEl !== dropTarget) {
            const fromIndex = Array.from(container.children).indexOf(dragEl);
            const toIndex = Array.from(container.children).indexOf(dropTarget);
            if (fromIndex > -1 && toIndex > -1) {
                reorderFn(fromIndex, toIndex);
            }
        }
    });
}

// — helpers
const escapeHTML = (s="") => s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const escapeAttr = escapeHTML;