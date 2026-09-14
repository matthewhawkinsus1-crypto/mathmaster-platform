import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const compiler = require('../../functions/lib/pathContentCompiler.js');
const shape = require('../../functions/lib/pathFirestoreShape.js');

const {
  COMPILER_ERROR,
  compilePathQuestionDocument,
  compilePathQuestionPackage,
  certifyCompiledDocument,
  certifyFirestoreValue,
  pathContentHash,
  pathDocumentContentHash,
} = compiler;

// What Firestore actually refuses, checked the way Firestore would see it.
const directNestedArrayPaths = (value, path = '$', found = []) => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      if (Array.isArray(entry)) found.push(`${path}[${index}]`);
      directNestedArrayPaths(entry, `${path}[${index}]`, found);
    });
    return found;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => directNestedArrayPaths(entry, `${path}.${key}`, found));
  }
  return found;
};

const containsUndefined = (value) => {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(containsUndefined);
  if (value && typeof value === 'object') return Object.values(value).some(containsUndefined);
  return false;
};

const ok = (result) => {
  assert.equal(result.ok, true, result.errors?.map((error) => `${error.code} ${error.path}`).join('; '));
  return result;
};

// 1. A table at the top-level stimulus.
test('a top-level stimulus table compiles to Firestore-safe row maps', () => {
  const result = ok(compilePathQuestionDocument({
    id: 'table-top-level',
    stimulus: { kind: 'table', table: { headers: ['x', 'y'], rows: [[1, 2], [3, 4]] } },
  }));

  assert.deepEqual(result.document.stimulus.table.rows, [{ cells: [1, 2] }, { cells: [3, 4] }]);
  assert.deepEqual(directNestedArrayPaths(result.document), []);
});

// 2. The same table, inside a variant — the hole PR #228 closed, now certified
//    by the one compiler rather than by a second copy of the rule.
test('a table inside a variant compiles exactly like a top-level one', () => {
  const result = ok(compilePathQuestionDocument({
    id: 'table-in-variant',
    variants: [{
      coverageKey: 'variant-a',
      stimulus: { kind: 'multipleRepresentation', table: { headers: ['In', 'Out'], rows: [['{{x0}}', '{{y0}}'], ['{{x1}}', '{{y1}}']] } },
    }],
  }));

  assert.deepEqual(result.document.variants[0].stimulus.table.rows, [
    { cells: ['{{x0}}', '{{y0}}'] },
    { cells: ['{{x1}}', '{{y1}}'] },
  ]);
  assert.deepEqual(directNestedArrayPaths(result.document), []);
});

// 3. An array of arrays somewhere with no defined storage shape must FAIL, with
//    the property path, rather than be reshaped into something nothing reads.
test('an illegal array-inside-array elsewhere fails with its exact property path', () => {
  const result = compilePathQuestionDocument({
    id: 'illegal-nesting',
    variants: [
      {},
      {},
      { stimulus: { diagram: { segments: [['a', 'b'], ['c', 'd']] } } },
    ],
  });

  assert.equal(result.ok, false);
  const nested = result.errors.filter((error) => error.code === COMPILER_ERROR.NESTED_ARRAY);
  assert.equal(nested.length, 2);
  assert.equal(nested[0].path, 'variants[2].stimulus.diagram.segments[0]');
  assert.equal(nested[0].questionId, 'illegal-nesting');
  assert.match(nested[0].message, /array/i);
});

test('the property path a failure reports is the one a human can go and read', () => {
  const result = compilePathQuestionDocument({
    id: 'deep-path',
    variants: [{}, {}, { stimulus: { table: { rows: [['ok'], 'not-a-row'] } } }],
    responseFields: [{ id: 'a', matrix: { grid: [[1, 2]] } }],
  });
  assert.equal(result.ok, false);
  const paths = result.errors.map((error) => error.path);
  assert.ok(paths.includes('responseFields[0].matrix.grid[0]'), paths.join(', '));
});

// 4. undefined, at any depth.
test('undefined is removed from objects and becomes null in arrays, at any depth', () => {
  const result = ok(compilePathQuestionDocument({
    id: 'undefined-everywhere',
    unusedTopLevel: undefined,
    stimulus: {
      title: undefined,
      metadata: { unit: undefined, source: 'authored' },
      ordered: ['first', undefined, 'third'],
      nested: { deep: { deeper: { gone: undefined, kept: 1 } } },
    },
    variants: [{ note: undefined, keep: true }],
  }));

  assert.equal(containsUndefined(result.document), false);
  assert.equal(Object.hasOwn(result.document, 'unusedTopLevel'), false);
  assert.equal(Object.hasOwn(result.document.stimulus, 'title'), false);
  assert.equal(Object.hasOwn(result.document.stimulus.metadata, 'unit'), false);
  assert.deepEqual(result.document.stimulus.ordered, ['first', null, 'third']);
  assert.deepEqual(result.document.stimulus.nested.deep.deeper, { kept: 1 });
  assert.deepEqual(result.document.variants[0], { keep: true });
});

// 5. Ordinary arrays stay ordinary arrays.
test('ordinary arrays keep their type, order and contents', () => {
  const result = ok(compilePathQuestionDocument({
    id: 'ordinary-arrays',
    alignmentKeys: ['texas:A.2A', 'texas:A.2B'],
    supportHints: ['first', 'second', 'third'],
    responseFields: [{ id: 'a', accepted: ['1', '1.0', 'one'] }],
  }));

  assert.deepEqual(result.document.alignmentKeys, ['texas:A.2A', 'texas:A.2B']);
  assert.deepEqual(result.document.supportHints, ['first', 'second', 'third']);
  assert.deepEqual(result.document.responseFields[0].accepted, ['1', '1.0', 'one']);
  assert.ok(Array.isArray(result.document.supportHints));
});

// 6. Generator choice arrays are ordinary arrays and must survive untouched.
test('generator choice arrays survive compilation unchanged', () => {
  const generator = {
    seedKey: 'family',
    parameters: [
      { name: 'a', choices: [2, 3, 5, 7] },
      { name: 'label', choices: ['red', 'blue'] },
    ],
    constraints: ['a != 0'],
  };
  const result = ok(compilePathQuestionDocument({ id: 'generator-choices', generator }));

  assert.deepEqual(result.document.generator, generator);
  assert.deepEqual(directNestedArrayPaths(result.document), []);
});

// 7. The authored object is evidence. Compiling must not change it.
test('compiling never mutates the authored source object', () => {
  const authored = {
    id: 'immutable-source',
    stimulus: { table: { headers: ['x'], rows: [[1], [2]] } },
    points: [[0, 1], [1, 4]],
    optional: undefined,
    variants: [{ stimulus: { table: { rows: [[3]] } } }],
  };
  const before = JSON.stringify(authored, (key, value) => (value === undefined ? '<undefined>' : value));

  const result = ok(compilePathQuestionDocument(authored));

  const after = JSON.stringify(authored, (key, value) => (value === undefined ? '<undefined>' : value));
  assert.equal(after, before);
  assert.ok(Array.isArray(authored.stimulus.table.rows[0]), 'the authored 2-D row is still a 2-D row');
  assert.ok(Array.isArray(authored.points[0]));
  assert.equal(Object.hasOwn(authored, 'optional'), true);
  // And the compiled document really is a different object.
  assert.notEqual(result.document.stimulus.table.rows[0], authored.stimulus.table.rows[0]);
});

test('a deeply frozen authored document still compiles', () => {
  const deepFreeze = (value) => {
    if (value && typeof value === 'object') Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  };
  const authored = deepFreeze({
    id: 'frozen',
    stimulus: { table: { rows: [['a', 'b']] } },
    variants: [{ points: [[1, 2]] }],
  });
  const result = ok(compilePathQuestionDocument(authored));
  assert.deepEqual(result.document.stimulus.table.rows, [{ cells: ['a', 'b'] }]);
  assert.deepEqual(result.document.variants[0].points, [{ x: 1, y: 2 }]);
});

// 8. Stable hashes.
test('the content hash is stable across key order and repeated compilation', () => {
  const left = compilePathQuestionDocument({
    id: 'stable', courseId: 'algebra1', difficultyBand: 3,
    stimulus: { table: { rows: [[1, 2]] } },
  });
  const right = compilePathQuestionDocument({
    difficultyBand: 3, stimulus: { table: { rows: [[1, 2]] } },
    courseId: 'algebra1', id: 'stable',
  });

  assert.equal(left.contentHash, right.contentHash);
  assert.equal(left.contentHash, compilePathQuestionDocument({ id: 'stable', courseId: 'algebra1', difficultyBand: 3, stimulus: { table: { rows: [[1, 2]] } } }).contentHash);
  assert.match(left.contentHash, /^[0-9a-f]{64}$/);
});

test('a content change changes the hash and release bookkeeping does not', () => {
  const base = ok(compilePathQuestionDocument({ id: 'hashed', prompt: 'Solve for x.' }));
  const changed = ok(compilePathQuestionDocument({ id: 'hashed', prompt: 'Solve for y.' }));
  assert.notEqual(base.contentHash, changed.contentHash);

  // Fields the release machinery writes are excluded, so re-activating a release
  // does not make every document look changed.
  const stored = {
    ...base.document,
    seededAt: { seconds: 1 },
    seededBy: 'uid-admin',
    pathReleaseId: 'course-path-v2-0123456789abcdef',
    pathContentHash: base.contentHash,
    builtInPathSeedRelease: 'course-path-v2-0123456789abcdef',
  };
  assert.equal(pathDocumentContentHash(stored), base.contentHash);
});

test('the hash ignores nothing that a student would see', () => {
  const a = pathContentHash({ prompt: 'x', supportHints: ['a', 'b'] });
  const b = pathContentHash({ prompt: 'x', supportHints: ['b', 'a'] });
  assert.notEqual(a, b, 'array ORDER is content');
});

// Certification is an independent read of the compiled output.
test('certification rejects values Firestore cannot store, naming each path', () => {
  const errors = certifyFirestoreValue({
    fine: 'yes',
    nested: { pairs: [[1, 2]] },
    broken: Number.NaN,
    missing: undefined,
    reserved: { __name__: 1 },
  });
  const byCode = Object.fromEntries(errors.map((error) => [error.code, error.path]));

  assert.equal(byCode[COMPILER_ERROR.NESTED_ARRAY], '$.nested.pairs[0]');
  assert.equal(byCode[COMPILER_ERROR.NON_FINITE_NUMBER], '$.broken');
  assert.equal(byCode[COMPILER_ERROR.UNDEFINED_VALUE], '$.missing');
  assert.equal(byCode[COMPILER_ERROR.INVALID_FIELD_NAME], '$.reserved.__name__');
});

test('certification rejects unsafe prototypes but allows Firebase value classes', () => {
  class Sneaky { constructor() { this.value = 1; } }
  const unsafe = certifyFirestoreValue({ item: new Sneaky() });
  assert.equal(unsafe[0].code, COMPILER_ERROR.UNSUPPORTED_PROTOTYPE);
  assert.equal(unsafe[0].path, '$.item');

  assert.deepEqual(certifyFirestoreValue({ when: new Date('2026-01-01T00:00:00Z') }), []);
  class Timestamp { constructor() { this.seconds = 1; } }
  assert.deepEqual(certifyFirestoreValue({ when: new Timestamp() }), []);

  assert.equal(certifyFirestoreValue({ run: () => 1 })[0].code, COMPILER_ERROR.UNSUPPORTED_VALUE);
  assert.equal(certifyFirestoreValue({ tag: Symbol('x') })[0].code, COMPILER_ERROR.UNSUPPORTED_VALUE);
});

test('invalid document ids are refused where a human can still fix them', () => {
  assert.equal(compilePathQuestionDocument({ id: '' }).errors[0].code, COMPILER_ERROR.MISSING_DOCUMENT_ID);
  assert.equal(compilePathQuestionDocument({ id: 'a/b' }).errors[0].code, COMPILER_ERROR.INVALID_DOCUMENT_ID);
  assert.equal(compilePathQuestionDocument({ id: '..' }).errors[0].code, COMPILER_ERROR.INVALID_DOCUMENT_ID);
  assert.equal(compilePathQuestionDocument({ id: '__name__' }).errors[0].code, COMPILER_ERROR.INVALID_DOCUMENT_ID);
  assert.equal(compilePathQuestionDocument({ id: 'x'.repeat(1501) }).errors[0].code, COMPILER_ERROR.INVALID_DOCUMENT_ID);
});

test('an individual document larger than Firestore allows is refused', () => {
  const errors = certifyCompiledDocument({ id: 'huge', prompt: 'x'.repeat(1100000) }, { id: 'huge' });
  assert.ok(errors.some((error) => error.code === COMPILER_ERROR.DOCUMENT_TOO_LARGE), errors.map((e) => e.code).join());
});

test('a package reports every failure at once and refuses duplicate ids', () => {
  const result = compilePathQuestionPackage([
    { id: 'a', stimulus: { table: { rows: [[1]] } } },
    { id: 'b', pairs: [[1, 2], [3, 4]] },
    { id: 'a' },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === COMPILER_ERROR.NESTED_ARRAY && error.path.startsWith('items[1]')));
  assert.ok(result.errors.some((error) => /duplicates items\[0\]/.test(error.detail || '')));
});

// One implementation, not two. The historical boundary now delegates.
test('the legacy Firestore-shape boundary is the compiler', () => {
  const record = { id: 'legacy', stimulus: { table: { rows: [['1', '2']] } }, dropped: undefined };
  assert.deepEqual(shape.firestoreSafeValue(record), compiler.compilePathValue(record).value);
  assert.deepEqual(shape.firestoreSafePathRecord(record).stimulus, compilePathQuestionDocument(record).document.stimulus);
  assert.equal(typeof shape.compilePathRecordForStorage, 'function');
  assert.equal(shape.compiler, compiler);
});

// The shapes that were actually failing in production, in the live seed content.
test('coordinate points and matrix rows have a defined storage shape', () => {
  const result = ok(compilePathQuestionDocument({
    id: 'regression-family',
    points: [[-2, '{{ym2}}'], [-1, '{{ym1}}']],
    matrix: { rows: [[1, 1, 1, '{{c1}}'], [2, -1, 1, '{{c2}}'], [1, 2, -1, '{{c3}}']] },
    stimulus: { graph: { curves: [{ label: 'Quadratic', points: [['{{h}}', '{{k}}'], ['{{x}}', '{{y}}']] }] } },
  }));

  assert.deepEqual(result.document.points, [{ x: -2, y: '{{ym2}}' }, { x: -1, y: '{{ym1}}' }]);
  assert.deepEqual(result.document.matrix.rows[0], { cells: [1, 1, 1, '{{c1}}'] });
  assert.deepEqual(result.document.stimulus.graph.curves[0].points[0], { x: '{{h}}', y: '{{k}}' });
  assert.deepEqual(directNestedArrayPaths(result.document), []);
});

test('a point that is not a pair is a failure, not a guess', () => {
  const result = compilePathQuestionDocument({ id: 'bad-point', points: [[1, 2, 3]] });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, COMPILER_ERROR.NESTED_ARRAY);
  assert.equal(result.errors[0].path, 'points[0]');
  assert.match(result.errors[0].message, /exactly two values/);
});

test('already-compiled content compiles to itself', () => {
  const once = ok(compilePathQuestionDocument({
    id: 'idempotent',
    stimulus: { table: { rows: [['1', '2']] } },
    points: [[1, 2]],
  }));
  const twice = ok(compilePathQuestionDocument(once.document));
  assert.deepEqual(twice.document, once.document);
  assert.equal(twice.contentHash, once.contentHash);
});

// The legacy seed importer is on the same boundary. It used to hand Firestore
// whatever a best-effort sanitizer produced and find out at commit time.
test('the legacy Path seed importer compiles strictly and reports the property path', () => {
  const source = fs.readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const importer = region(source, 'async function processPathSeedImport', 'const rejectionSummary', 'seed import validation');

  assert.match(importer, /compilePathRecordForStorage\(\{ \.\.\.item, id, active: item\.active !== false \}\)/);
  assert.match(importer, /if \(!compiled\.ok\)/);
  assert.match(importer, /propertyPath: first\?\.path \|\| null/);
  assert.match(importer, /compilerCode: first\?\.code \|\| null/);
  // And the issuer checks the COMPILED document, which is what production stores.
  assert.match(importer, /safeBuildTemplateIssuePlan\(compiled\.document/);
  assert.match(importer, /accepted\.push\(compiled\.document\)/);
  assert.doesNotMatch(executableSource(importer), /firestoreSafePathRecord/);
});

test('the shapes that broke production all compile, so the legacy refresh paths work too', () => {
  // ASVAB authors `{ kind: 'table', rows: [[…]] }` directly on the stimulus, with
  // no `table` wrapper. The old boundary rewrote only `table.rows`, so those
  // documents were sent to Firestore as illegal nested arrays.
  const asvabShaped = compilePathQuestionDocument({
    id: 'asvab-style-rows',
    stimulus: { kind: 'table', columns: ['Hours', 'Made'], rows: [['{{h1}}', '{{v1}}'], ['{{h2}}', '{{v2}}']] },
  });
  assert.equal(asvabShaped.ok, true, asvabShaped.errors?.map((error) => error.path).join());
  assert.deepEqual(asvabShaped.document.stimulus.rows, [
    { cells: ['{{h1}}', '{{v1}}'] },
    { cells: ['{{h2}}', '{{v2}}'] },
  ]);
  assert.deepEqual(directNestedArrayPaths(asvabShaped.document), []);
});
