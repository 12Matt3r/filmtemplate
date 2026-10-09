import assert from "node:assert/strict";
import { test } from "node:test";
import { compileTexelShots } from "../src/lib/texelExport.ts";
import type { CharacterEntity, SceneEntity, SetEntity, ShowMeta } from "../src/types.ts";

const show: ShowMeta = { id: "show", title: "Signal Test", genre: "Mystery", premise: "VHS broadcast textures", createdAt: 0, updatedAt: 0 };
const location: SetEntity = { id: "set", showId: "show", name: "ControlRoom", description: "A wall of teal CRT monitors", timeOfDay: "Night", createdAt: 0, updatedAt: 0 };
const character: CharacterEntity = { id: "operator", showId: "show", name: "Operator", role: "Protagonist", age: "40", gender: "Man", visualDescription: "A red-jacketed operator", voiceDescription: "Quiet", createdAt: 0, updatedAt: 0 };
const scene: SceneEntity = { id: "scene", episodeId: "episode", sceneName: "Control room", order: 1, targetSetId: "set", activeCharacterIds: ["operator"], action: "The operator reaches toward a monitor.\n\nThe building burns down.", dialogue: [], sceneNotes: "Blue practical lights", createdAt: 0, updatedAt: 0 };

test("keyframes expand the registered visual world, set, and cast for one beat", () => {
  const result = compileTexelShots(show, [scene], [location], [character]);
  const prompt = result[0].prompt;
  assert.match(prompt, /VHS broadcast textures/);
  assert.match(prompt, /wall of teal CRT monitors/);
  assert.match(prompt, /red-jacketed operator/);
  assert.match(prompt, /reaches toward a monitor/);
  assert.doesNotMatch(prompt, /building burns down/);
  assert.equal(result[0].scene_id, scene.id);
  assert.equal(result[0].duration_seconds, 6);
});

test("empty action and oversized scene selections cannot become generation plans", () => {
  assert.throws(() => compileTexelShots(show, [{ ...scene, action: " " }], [], []), /Add action/);
  assert.throws(() => compileTexelShots(show, [], [], []), /one to three/);
  assert.throws(() => compileTexelShots(show, [scene, scene, scene, scene], [], []), /one to three/);
});

test("oversized casts are flagged rather than silently excluding characters", () => {
  const cast = [0, 1, 2, 3].map((id) => ({ ...character, id: `character-${id}` }));
  assert.throws(() => compileTexelShots(show, [{ ...scene, activeCharacterIds: cast.map((c) => c.id) }], [], cast), /more than three characters/);
});
