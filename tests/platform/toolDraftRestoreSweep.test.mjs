/*
 * EVERY DRAFT-BACKED FIELD OF EVERY REGISTRY TOOL, RESTORED FROM EVERY KIND OF
 * DAMAGE (src/tools/shared/toolDraftShape.js, usePersistentToolState.js).
 *
 * A student's unfinished work is read back the moment the tool mounts, and a
 * shape the tool does not expect threw on every load and every device until the
 * draft was gone: a row with no type, a step with no equation, an index that
 * was a string. Every field now restores through its own `normalize` (a
 * structured field) or the platform's check of its kind (text, a boolean, a
 * number), so this sweep holds every field to three things, whatever its saved
 * value holds (tests/platform/helpers/hostileDraftValues.mjs):
 *
 *   - hydration never throws, and the value it hands the tool is of the
 *     field's own kind (a list stays a list, text stays text, and so on);
 *   - a repaired value needs no second repair (its normalize keeps it as is);
 *   - the tool opens on it: rendered as a reload renders it, nothing throws.
 *
 * The fields are found by rendering every scene (toolDraftRender.mjs), so a new
 * tool or field joins the sweep by being rendered; the first two tests fail if
 * one is not, or if a structured field has no normalize of its own.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { openToolDraftRenderer, errorText } from './helpers/toolDraftRender.mjs';
import { damagedCopies, hostileValues, rawHostileValues } from './helpers/hostileDraftValues.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const VALID = JSON.parse(read('tests/platform/fixtures/toolDraftValidRecords.json')).scenes;

let rendererPromise = null;
const renderer = () => { rendererPromise ||= openToolDraftRenderer({ cacheName: 'tool-draft-sweep' }); return rendererPromise; };
after(async () => { if (rendererPromise) await (await rendererPromise).close(); });

// Every field each scene renders, with its initial value and its normalize.
let fieldsPromise = null;
const sceneFields = () => {
  fieldsPromise ||= (async () => {
    const { scenes, open } = await renderer();
    const out = [];
    for (const scene of scenes) {
      const result = await open(scene);
      const seen = new Set();
      result.fields.forEach((field) => {
        if (seen.has(field.name)) return;
        seen.add(field.name);
        out.push({ scene, ...field });
      });
      // A later stage mounts more of a tool: every recorded draft's fields too.
      for (const record of VALID[scene.id] || []) {
        (await open(scene, { record })).fields.forEach((field) => {
          if (seen.has(field.name)) return;
          seen.add(field.name);
          out.push({ scene, ...field });
        });
      }
    }
    return out;
  })();
  return fieldsPromise;
};

const kindOf = (value) => (value === null ? 'null' : Array.isArray(value) ? 'list' : typeof value === 'object' ? 'map' : typeof value);
const STRUCTURED = new Set(['list', 'map', 'null', 'undefined']);

/*
 * Two fields restore without a normalize of their own, and why: the 3×3
 * reduction states are passed through the tool's own repair on EVERY read
 * (`repairReductionState`, `repairEliminationState`), which rebuilds the work
 * that is still true from known keys and accepts anything; the platform's
 * map guard keeps them maps. The test below checks the repair is still on the
 * read path, and the render sweep that the tools open on any damage.
 */
const REPAIRED_ON_READ = Object.freeze({
  'systemsWorkspace/SubstitutionReductionMode.jsx#reduction': /const reduction = useMemo\(\(\) => repairReductionState\(storedReduction, system\)/,
  'systemsWorkspace/EliminationReductionMode.jsx#elimination': /const elimination = useMemo\(\(\) => repairEliminationState\(storedElimination, system\)/,
});

/* ------------------------------------------------------------- coverage */

const toolSources = () => {
  const files = [];
  const walk = (dir) => readdirSync(new URL(`../../${dir}`, import.meta.url)).forEach((name) => {
    const path = `${dir}/${name}`;
    if (statSync(new URL(`../../${path}`, import.meta.url)).isDirectory()) walk(path);
    else if (path.endsWith('.jsx') && !path.startsWith('src/tools/shared/')) files.push(path);
  });
  walk('src/tools');
  return files;
};

test('every field a tool keeps in its draft is rendered by a scene, so none escapes the sweep', async () => {
  const fields = await sceneFields();
  const reached = new Set(fields.map((field) => `${field.file}#${field.name}`));
  const reachedFiles = new Set(fields.map((field) => field.file));
  const missing = [];
  let declared = 0;
  toolSources().forEach((path) => {
    const source = executableSource(read(path));
    const file = path.replace('src/tools/', '');
    for (const match of source.matchAll(/usePersistentToolState\(\s*([^,)]+)/g)) {
      declared += 1;
      const literal = match[1].trim().match(/^'([^']+)'$/);
      // A field named at runtime (MatrixCalculator's historyKey): its file is reached.
      if (literal ? !reached.has(`${file}#${literal[1]}`) : !reachedFiles.has(file)) missing.push(`${file}: ${match[1].trim()}`);
    }
  });
  assert.ok(declared >= 300, `${declared} draft-backed fields declared in src/tools`);
  assert.deepEqual(missing, [], `fields no scene renders (add a question to tests/platform/fixtures/toolDraftScenes.mjs):\n${missing.join('\n')}`);
});

test('every structured draft field states its shape with a normalize of its own', async () => {
  const fields = await sceneFields();
  const offences = new Set();
  fields.forEach((field) => {
    const key = `${field.file}#${field.name}`;
    if (!STRUCTURED.has(kindOf(field.initial)) || typeof field.normalize === 'function' || REPAIRED_ON_READ[key]) return;
    offences.add(`${key} starts as ${kindOf(field.initial)} and has no normalize (toolDraftShape.js)`);
  });
  assert.deepEqual([...offences], []);
  Object.entries(REPAIRED_ON_READ).forEach(([key, readPath]) => {
    const file = key.split('#')[0];
    assert.match(executableSource(read(`src/tools/${file}`)), readPath, `${key}: the tool still repairs the stored state on every read`);
  });
});

/* -------------------------------------------- hydration, field by field */

test('every field hydrates every hostile value without throwing, into its own kind, needing no second repair', async (t) => {
  const { load } = await renderer();
  const { hydrateToolDraftField } = await load('/src/tools/shared/usePersistentToolState.js');
  const { MAX_DRAFT_TEXT_LENGTH } = await load('/src/tools/shared/toolDraftShape.js');
  const fields = await sceneFields();
  const problems = [];
  let checked = 0;
  for (const field of fields) {
    const kind = kindOf(field.initial);
    const valids = [field.initial, ...(VALID[field.scene.id] || []).map((record) => record[field.name]).filter((value) => value !== undefined)];
    const cases = [
      ...hostileValues(),
      ...rawHostileValues(),
      ...valids.flatMap((valid) => damagedCopies(valid)),
    ];
    for (const [name, value] of cases) {
      checked += 1;
      let result;
      try {
        result = hydrateToolDraftField({ record: { [field.name]: value }, field: field.name, initialValue: field.initial, normalize: field.normalize });
      } catch (error) {
        problems.push(`${field.scene.id} ${field.name} ${name}: threw ${error.message}`);
        continue;
      }
      const restored = kindOf(result.value);
      const sameKind = kind === 'number' ? ['number', 'string'].includes(restored)
        : STRUCTURED.has(kind) && kind !== 'list' && kind !== 'map' ? true
          : restored === kind;
      if (!sameKind) problems.push(`${field.scene.id} ${field.name} ${name}: a ${kind} field restored a ${restored}`);
      if (typeof result.value === 'string' && result.value.length > MAX_DRAFT_TEXT_LENGTH) problems.push(`${field.scene.id} ${field.name} ${name}: ${result.value.length} characters restored`);
      if (result.restored && typeof field.normalize === 'function') {
        const again = field.normalize(result.value);
        if (!isDeepStrictEqual(again.value, result.value) || again.issues.length) problems.push(`${field.scene.id} ${field.name} ${name}: the repaired value needs repairing again (${again.issues.join(', ')})`);
      }
    }
  }
  t.diagnostic(`${fields.length} fields, ${checked} hydrations`);
  assert.ok(fields.length >= 290 && checked >= 20000, `${fields.length} fields, ${checked} hydrations`);
  assert.deepEqual(problems.slice(0, 40), [], `${problems.length} problems`);
});

/* ------------------------------------------------- the tools open on them */

// The damage the render sweep opens every field on (the full set runs through
// hydration above): one of each wrong kind, and each structured value damaged
// one part at a time.
const RENDERED = new Set(['null', 'zero', 'text', 'true', 'empty list', 'empty map', 'list of null', 'list of text', 'list of record', 'nested list', 'map of text', 'hostile keys']);

test('every registry tool opens on every damaged draft, and the parts of a draft that were valid come back', async (t) => {
  const { open } = await renderer();
  const fields = await sceneFields();
  const failures = [];
  let opened = 0;
  const byScene = new Map();
  fields.forEach((field) => { if (!byScene.has(field.scene)) byScene.set(field.scene, []); byScene.get(field.scene).push(field); });
  for (const [scene, list] of byScene) {
    // The empty draft and the richest recorded one: a later stage reads more.
    const recorded = VALID[scene.id] || [];
    const bases = [{}, ...(recorded.length ? [recorded[recorded.length - 1]] : [])];
    for (const base of bases) {
      for (const field of list) {
        const inContext = Object.keys(base).length > 0;
        if (inContext && base[field.name] === undefined) continue;
        const valid = inContext ? base[field.name] : field.initial;
        const cases = [
          ...(inContext ? [] : hostileValues({ long: false }).filter(([name]) => RENDERED.has(name))),
          ...(STRUCTURED.has(kindOf(field.initial)) ? damagedCopies(valid, { long: false }).slice(0, inContext ? 24 : 48) : []),
        ];
        for (const [name, value] of cases) {
          opened += 1;
          const record = { ...base, [field.name]: value };
          const result = await open(scene, { record });
          if (result.errors.length) {
            failures.push(`${scene.id} ${field.name} ${name}: ${errorText(result)[0]}`);
            continue;
          }
          // Every OTHER field of the draft was valid, and comes back exactly.
          result.hydrated.forEach((entry) => {
            if (entry.field === field.name || !Object.prototype.hasOwnProperty.call(base, entry.field)) return;
            if (!isDeepStrictEqual(entry.result.value, base[entry.field])) failures.push(`${scene.id} ${field.name} ${name}: the valid ${entry.field} did not come back as saved`);
          });
        }
      }
    }
  }
  t.diagnostic(`${opened} damaged drafts opened`);
  assert.ok(opened >= 5000, `${opened} damaged drafts opened`);
  assert.deepEqual(failures.slice(0, 40), [], `${failures.length} failures`);
});
