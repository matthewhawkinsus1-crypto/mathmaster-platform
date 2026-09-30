/*
 * A TOOL MUST NOT BE ABLE TO STOP THE SERVER BACKUP WITHOUT A TEST NOTICING.
 *
 * The workspace sync refuses a whole tool record over one forbidden key (an
 * `isCorrect`, a `score`, an answer key) or one oversized field, and until the
 * student UX pass it refused SILENTLY. PR #397's board persisted per-card
 * verdicts and the first Check ended backup of the entire board; #390 put a
 * sixty-entry Undo stack in a record and did the same by size.
 *
 * The guard is right and stays exactly as strict. This file holds the two
 * things that were missing:
 *
 *   1. The refusal is now REPORTED, with the offending path, and never to the
 *      student (draftSyncDiagnostics.js).
 *   2. A registry-wide contract: no draft-backed tool may name a persisted
 *      field after a forbidden key, or write a forbidden key literally into a
 *      persisted setter. Spreads and computed objects cannot be seen from
 *      source, which is what the development-time write audit and the browser
 *      sweep (tests/browser/toolDraftSyncSweep.mjs, findings asserted below)
 *      are for.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FORBIDDEN_DRAFT_KEYS,
  MAX_WORKSPACE_DRAFT_VALUE_BYTES,
  explainWorkspaceDraftRejection,
  sanitizeWorkspaceDraftValue,
} from '../../functions/shared/workspaceDraftSchema.mjs';
import {
  auditDraftWrite,
  clearDraftSyncRejections,
  listDraftSyncRejections,
  reportDraftSyncRejection,
} from '../../src/platform/persistence/draftSyncDiagnostics.js';
import { createWorkspaceDraftSync } from '../../src/platform/persistence/workspaceDraftSync.js';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { TOOL_STATE_PERSISTENCE, draftBackedToolIds } from '../../src/tools/toolStatePersistence.js';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const withConsole = (fn) => {
  const original = { error: console.error, warn: console.warn };
  const calls = { error: [], warn: [] };
  console.error = (...args) => calls.error.push(args.join(' '));
  console.warn = (...args) => calls.warn.push(args.join(' '));
  try {
    fn(calls);
  } finally {
    console.error = original.error;
    console.warn = original.warn;
  }
  return calls;
};

const studentKey = (questionIndex = 0) => `${buildQuestionDraftKey({
  studentId: 's1', assignmentId: 'a1', questionIndex, variantIndex: 0, sessionMode: 'graded',
})}:work:tool`;

/* ------------------------------------------------------ the guard is intact */

test('the guard still refuses a forbidden key at any depth and an oversized record', () => {
  assert.equal(sanitizeWorkspaceDraftValue({ cardChecks: { slope: { isCorrect: true } } }).ok, false);
  assert.equal(sanitizeWorkspaceDraftValue({ rows: [{ x: 1, score: 1 }] }).ok, false);
  assert.equal(sanitizeWorkspaceDraftValue({ history: 'x'.repeat(MAX_WORKSPACE_DRAFT_VALUE_BYTES + 1) }).ok, false);
  assert.equal(sanitizeWorkspaceDraftValue({ slope: '-2/3', points: [[0, 4], [3, 2]] }).ok, true);
});

/* ----------------------------------------------- and it now says where/why */

test('a refusal names the path of the first forbidden key', () => {
  const explained = explainWorkspaceDraftRejection({ tableRows: [{ x: '1' }], cardChecks: { slope: { fingerprint: 'a', isCorrect: true } } });
  assert.equal(explained.ok, false);
  assert.equal(explained.reason, 'forbidden-key');
  assert.equal(explained.path, 'cardChecks.slope.isCorrect');
  assert.equal(explainWorkspaceDraftRejection({ steps: [{ ok: 1 }, { accepted: true }] }).path, 'steps[1].accepted');
});

test('an oversized refusal names the fields that grew', () => {
  const explained = explainWorkspaceDraftRejection({ answer: 'y = 2x', undoStack: Array.from({ length: 400 }, (_, i) => ({ step: i, value: 'x'.repeat(40) })) });
  assert.equal(explained.reason, 'too-large');
  assert.equal(explained.largest[0].path, 'undoStack');
  assert.ok(explained.bytes > MAX_WORKSPACE_DRAFT_VALUE_BYTES);
});

test('explaining never changes the verdict', () => {
  for (const value of [{ a: 1 }, { isCorrect: false }, { nested: { answerKey: [] } }, undefined]) {
    assert.equal(explainWorkspaceDraftRejection(value).ok, sanitizeWorkspaceDraftValue(value).ok);
  }
});

test('the sync reports a refused record once, with its path, and still refuses it', () => {
  clearDraftSyncRejections();
  const sync = createWorkspaceDraftSync({ studentId: 's1', assignmentId: 'a1', flush: () => Promise.resolve(), scheduler: { set: () => 1, clear: () => {} } });
  const key = studentKey(3);
  const calls = withConsole(() => {
    assert.equal(sync.record({ key, value: { cardChecks: { m: { isCorrect: true } } }, savedAt: 1 }), false);
    assert.equal(sync.record({ key, value: { cardChecks: { m: { isCorrect: false } } }, savedAt: 2 }), false);
  });
  assert.deepEqual(sync.pendingKeys(), [], 'a refused record must never be queued for the server');
  assert.equal(sync.stats().rejected['forbidden-key'], 2);
  const reported = listDraftSyncRejections();
  assert.equal(reported.length, 1, 'the same refusal on every keystroke is one report');
  assert.equal(reported[0].path, 'cardChecks.m.isCorrect');
  assert.equal(reported[0].key, key);
  const messages = [...calls.error, ...calls.warn];
  assert.equal(messages.length, 1);
  assert.match(messages[0], /cardChecks\.m\.isCorrect/);
  assert.match(messages[0], /forbidden-key/);
});

test('a development build hears about a bad record at the write, before any sync exists', () => {
  clearDraftSyncRejections();
  const calls = withConsole(() => {
    assert.equal(auditDraftWrite(studentKey(1), { points: [[1, 2]] }), null, 'a clean record is silent');
    const entry = auditDraftWrite(studentKey(1), { verdicts: [{ score: 1 }] });
    assert.equal(entry?.path, 'verdicts[0].score');
    assert.equal(auditDraftWrite(`${studentKey(1)}:preview`, { score: 1 }), null, 'preview keys never sync, so they are not reported');
  });
  assert.equal(calls.error.length, 1, 'node runs as a development build: console.error, once');
});

test('the student is never shown the diagnostic', () => {
  // The reporter writes to the console and to an in-memory list. Nothing in it
  // may reach the DOM or raise a toast: a student cannot act on a key path.
  const source = executableSource(read('src/platform/persistence/draftSyncDiagnostics.js'));
  assert.doesNotMatch(source, /document\.|toast|alert\(|setState|React/);
  assert.equal(reportDraftSyncRejection({ key: 'k', explanation: { ok: true } }), null);
});

test('the write path and the sync are both wired to the reporter', () => {
  const storage = executableSource(read('src/questionDraftStorage.js'));
  const writer = storage.slice(storage.indexOf('export const writeQuestionDraft'), storage.indexOf('export const questionDraftSavedAt'));
  assert.match(writer, /auditDraftWrite\(key, value\);[\s\S]*notifyDraftWritten\(key, value, savedAt\)/,
    'writeQuestionDraft must audit every draft before it is offered to the sync');
  assert.match(storage, /import \{ auditDraftWrite \} from '\.\/platform\/persistence\/draftSyncDiagnostics\.js'/);
  const sync = executableSource(read('src/platform/persistence/workspaceDraftSync.js'));
  const record = sync.slice(sync.indexOf('record({'), sync.indexOf('setResume('));
  assert.match(record, /if \(!sanitizeWorkspaceDraftValue\(value\)\.ok\) \{[\s\S]*reportDraftSyncRejection\(\{ key, explanation/);
  assert.match(record, /return false;[\s\S]*pending\.set\(key/, 'a refused value must return before it is queued');
});

/* --------------------------------------------- registry-wide source contract */

const setterCalls = (source, setter) => {
  const calls = [];
  const pattern = new RegExp(`\\b${setter}\\(`, 'g');
  let match;
  while ((match = pattern.exec(source))) {
    let depth = 1;
    let index = match.index + match[0].length;
    const start = index;
    while (index < source.length && depth > 0) {
      const char = source[index];
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      index += 1;
    }
    calls.push(source.slice(start, index - 1));
  }
  return calls;
};

const persistedSetters = (source) => [
  ...source.matchAll(/const\s*\[\s*([A-Za-z0-9_$]+)\s*,\s*(set[A-Za-z0-9_$]*)\s*\]\s*=\s*usePersistentToolState\(\s*'([^']+)'/g),
].map((match) => ({ field: match[3], setter: match[2] }));

const forbiddenLiteral = new RegExp(`(?:[{,]\\s*|\\b)(${FORBIDDEN_DRAFT_KEYS.join('|')})\\s*(?::|,\\s*[}\\]]|\\s*\\})`);

test('no draft-backed tool names a persisted field after a forbidden key', () => {
  const offences = [];
  let fields = 0;
  Object.entries(TOOL_STATE_PERSISTENCE).forEach(([toolId, contract]) => {
    contract.sources.forEach((relative) => {
      const source = executableSource(read(`src/tools/${relative}`));
      [...source.matchAll(/usePersistentToolState\(\s*['"]([^'"]+)['"]/g)].forEach((match) => {
        fields += 1;
        if (FORBIDDEN_DRAFT_KEYS.includes(match[1])) offences.push(`${toolId} (${relative}) persists "${match[1]}"`);
      });
    });
  });
  assert.ok(fields > 100, `expected the registry's persisted fields, found ${fields}`);
  assert.deepEqual(offences, []);
});

test('no draft-backed tool writes a forbidden key literally into a persisted setter', () => {
  const offences = [];
  let checked = 0;
  draftBackedToolIds().forEach((toolId) => {
    TOOL_STATE_PERSISTENCE[toolId].sources.forEach((relative) => {
      const source = executableSource(read(`src/tools/${relative}`));
      persistedSetters(source).forEach(({ field, setter }) => {
        setterCalls(source, setter).forEach((argument) => {
          checked += 1;
          const hit = argument.match(forbiddenLiteral);
          if (hit) offences.push(`${toolId}: ${setter}(…${hit[1]}…) would stop server backup of the "${field}" record`);
        });
      });
    });
  });
  assert.ok(checked > 100, `expected to inspect the registry's persisted setter calls, inspected ${checked}`);
  assert.deepEqual(offences, []);
});

test('the source contract can fail', () => {
  // The two regexes above, pointed at the shape of PR #397's original bug.
  const bug = "const [cardChecks, setCardChecks] = usePersistentToolState('cardChecks', {});\n"
    + 'const run = () => setCardChecks((prev) => ({ ...prev, [id]: { fingerprint, isCorrect: verdict.ok } }));\n'
    + 'const again = () => setCardChecks((prev) => ({ ...prev, [id]: { score } }));';
  const setters = persistedSetters(bug);
  assert.deepEqual(setters, [{ field: 'cardChecks', setter: 'setCardChecks' }]);
  const hits = setterCalls(bug, 'setCardChecks').map((argument) => argument.match(forbiddenLiteral)?.[1]);
  assert.deepEqual(hits, ['isCorrect', 'score']);
});

/* ---------------------------------------------- the runtime sweep's findings */

test('the browser sweep found no refused tool record, and covered every draft-backed tool', () => {
  const fixture = JSON.parse(read('tests/platform/fixtures/toolDraftSyncFindings.json'));
  assert.deepEqual(fixture.findings, [], fixture.findings.map((finding) => `${finding.toolId}: ${finding.detail}`).join('\n'));
  const swept = new Set(fixture.tools.filter((tool) => tool.mounted).map((tool) => tool.toolId));
  const missing = draftBackedToolIds().filter((toolId) => !swept.has(toolId));
  assert.deepEqual(missing, [], 'rerun tests/browser/toolDraftSyncSweep.mjs --write after adding a tool');
});
