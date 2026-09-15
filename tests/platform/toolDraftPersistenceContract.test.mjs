/*
 * THE GATE THAT STOPS A TOOL SHIPPING WITH THE STUDENT'S ANSWER IN `useState`.
 *
 * QuestionEngine remounts a question workspace on every navigation, so a
 * registry tool that keeps mathematics in component state loses it the moment
 * the student presses Next — and looks entirely healthy while doing so. It
 * renders, it grades, it passes its own tests. That is how twenty tools shipped
 * with the seam available and none of them using it.
 *
 * So the rule is enforced against the tools' own source: every `useState` in a
 * registry tool must be named in `toolStatePersistence.js` with a reason that
 * says it is presentation. Anything else has to go through
 * `usePersistentToolState`, which is what makes it survive.
 *
 * Failing here does NOT mean "add the field to the allowlist". It means: decide
 * whether a student can answer with that value. If they can, it belongs in the
 * draft-backed hook.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SHARED_TOOL_TRANSIENT_STATE,
  STUDENT_STATE_PERSISTENCE_MODES,
  TOOL_STATE_PERSISTENCE,
  draftBackedToolIds,
} from '../../src/tools/toolStatePersistence.js';
import { stripComments } from './helpers/stripComments.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const toolSource = (relative) => stripComments(read(`src/tools/${relative}`));

/** Every `const [name, setName] = useState(` in a file. */
const useStateFields = (source) => [
  ...source.matchAll(/const\s*\[\s*([A-Za-z0-9_$]+)\s*,\s*set[A-Za-z0-9_$]*\s*\]\s*=\s*useState\(/g),
].map((match) => match[1]);

const persistentFields = (source) => [
  ...source.matchAll(/usePersistentToolState\(\s*'([^']+)'/g),
].map((match) => match[1]);

const registryToolIds = () => [
  ...read('src/tools/toolRegistry.js').matchAll(/^\s{2}([A-Za-z0-9_]+):\s*\(\)\s*=>\s*import\(/gm),
].map((match) => match[1]);

test('every tool in the registry declares how student work persists', () => {
  const declared = Object.keys(TOOL_STATE_PERSISTENCE);
  assert.deepEqual(registryToolIds().sort(), declared.sort());
  declared.forEach((toolId) => {
    assert.ok(
      STUDENT_STATE_PERSISTENCE_MODES.includes(TOOL_STATE_PERSISTENCE[toolId].studentStatePersistence),
      `${toolId} declares an unknown persistence mode`,
    );
  });
});

test('no registry tool holds student mathematics in transient useState', () => {
  const offences = [];
  Object.entries(TOOL_STATE_PERSISTENCE).forEach(([toolId, contract]) => {
    contract.sources.forEach((relative) => {
      useStateFields(toolSource(relative)).forEach((field) => {
        if (contract.transientState[field]) return;
        offences.push(
          `${toolId} (${relative}) keeps "${field}" in useState. If a student can answer with it,`
          + ' move it to usePersistentToolState; if it is presentation, declare it in'
          + ' src/tools/toolStatePersistence.js with the reason.',
        );
      });
    });
  });
  assert.deepEqual(offences, [], offences.join('\n'));
});

test('a declared transient field is one that actually exists', () => {
  // A stale allowlist entry is how a real field sneaks back in under a name
  // somebody already excused.
  const stale = [];
  Object.entries(TOOL_STATE_PERSISTENCE).forEach(([toolId, contract]) => {
    const present = new Set(contract.sources.flatMap((relative) => useStateFields(toolSource(relative))));
    Object.keys(contract.transientState).forEach((field) => {
      if (!present.has(field)) stale.push(`${toolId} excuses "${field}", which no longer exists`);
    });
  });
  assert.deepEqual(stale, []);
});

test('every draft-backed tool actually persists through the shared hook', () => {
  draftBackedToolIds().forEach((toolId) => {
    const contract = TOOL_STATE_PERSISTENCE[toolId];
    const sources = contract.sources.map(toolSource);
    const imports = sources.some((source) => /import\s+usePersistentToolState.*usePersistentToolState\.js/.test(source));
    assert.ok(imports, `${toolId} is declared draft-backed but never imports the hook`);
    const fields = sources.flatMap(persistentFields);
    assert.ok(fields.length > 0, `${toolId} imports the hook but persists no field`);
  });
});

test('a read-only tool really has nothing a student can answer with', () => {
  Object.entries(TOOL_STATE_PERSISTENCE)
    .filter(([, contract]) => contract.studentStatePersistence === 'read-only')
    .forEach(([toolId, contract]) => {
      contract.sources.forEach((relative) => {
        const source = toolSource(relative);
        assert.doesNotMatch(
          source,
          /<input|<select|<textarea|MathInput|onPlot=|onMovePoint=/,
          `${toolId} declares read-only but ${relative} renders an editable control`,
        );
      });
    });
});

test('every tool component file is covered by the contract', () => {
  // A tool split across several files cannot hide its answer state in the one
  // nobody listed.
  const listed = new Set(Object.values(TOOL_STATE_PERSISTENCE).flatMap((contract) => contract.sources));
  const registryImports = [
    ...read('src/tools/toolRegistry.js').matchAll(/import\('\.\/([^']+)'\)/g),
  ].map((match) => match[1]);
  registryImports.forEach((relative) => {
    assert.ok(listed.has(relative), `${relative} is mounted by the registry but not declared in toolStatePersistence.js`);
  });
});

test('shared tool components own presentation only, never a draft', () => {
  Object.entries(SHARED_TOOL_TRANSIENT_STATE).forEach(([relative, allowed]) => {
    const source = toolSource(relative);
    useStateFields(source).forEach((field) => {
      assert.ok(allowed[field], `${relative} keeps "${field}" in useState without declaring why`);
    });
    // A shared component has no question identity of its own. Persisting from
    // here would write one tool's points under whichever key happened to be in
    // context.
    assert.doesNotMatch(source, /usePersistentToolState\(/, `${relative} must not own a draft`);
  });
});

test('the registry hands the persistence declaration out with the tool', () => {
  const registry = stripComments(read('src/tools/toolRegistry.js'));
  assert.match(registry, /getToolStatePersistence/);
  assert.match(registry, /studentStatePersistence:\s*persistence\?\.studentStatePersistence/);
});
