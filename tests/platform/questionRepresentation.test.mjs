// WHAT A QUESTION SHOWS A STUDENT, ANSWERED WITHOUT THE AUTHORING CATALOG (PF01).
//
// functions/shared/questionRepresentation.mjs holds, for each question type, what
// the student sees (REPRESENTATION_BY_TYPE) and the rules that read a question
// against it (getQuestionRepresentation). A student's Home asks it for the
// live-presence tile, so the question type catalog (about 13 KB gzip with the
// validators and recipes under it) stays out of the first load
// (tests/platform/firstLoadQuestionTypeCatalog.test.mjs). That is only safe
// while three things hold, and this holds them: the catalog and the module list
// the same types and the catalog's entries read the module's answer; the catalog
// still hands out the very function and names the module defines; and the
// function gives the answer it always gave, for every type and every question,
// against the function as it was written when it lived in the catalog.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOGUED_TYPES,
  QUESTION_TYPE_CATALOG,
  REPRESENTATIONS as CATALOG_REPRESENTATIONS,
  getQuestionRepresentation as fromCatalog,
} from '../../src/platform/contract/questionTypeCatalog.js';
import * as serverCatalog from '../../functions/shared/questionTypeCatalog.mjs';
import {
  REPRESENTATIONS,
  REPRESENTATION_BY_TYPE,
  getQuestionRepresentation,
} from '../../functions/shared/questionRepresentation.mjs';

// What each catalogued type has always shown a student, written out here and not
// read back from the module under test. A type added to the catalog later is not
// in this list (the sync tests below ask for its line in the module); a type
// whose representation is changed ON PURPOSE changes here too, in the same commit.
const WAS = Object.freeze({
  algebra: 'symbolic',
  fraction: 'symbolic',
  numberLine: 'numberLine',
  intervalNumberLine: 'numberLine',
  graphing: 'graph',
  functionGraph: 'graph',
  functionInvestigation: 'graph',
  graphAnalysis: 'graph',
  functionCharacteristics: 'graph',
  stepAlgebra: 'symbolic',
  literal: 'symbolic',
  system: 'symbolic',
  table: 'table',
  orderedPair: 'orderedPairs',
  multiAnswer: 'symbolic',
  relationshipModel: 'interactive',
  graphScenarioMatch: 'graph',
  graphComparison: 'graph',
  graphStory: 'graph',
  contextInterpretation: 'graph',
  relationMapping: 'mapping',
  modelingLab: 'interactive',
});

// The function exactly as it was in questionTypeCatalog.js, with the catalog
// stood in by a plain frozen object holding each type's entry (a plain object,
// as QUESTION_TYPE_CATALOG is, so a name like "constructor" meets the same
// prototype it did).
const asItWas = (() => {
  const REPRESENTATIONS = Object.freeze({
    GRAPH: 'graph',
    NUMBER_LINE: 'numberLine',
    TABLE: 'table',
    MAPPING: 'mapping',
    ORDERED_PAIRS: 'orderedPairs',
    SYMBOLIC: 'symbolic',
    TEXT: 'text',
    INTERACTIVE: 'interactive',
  });
  const QUESTION_TYPE_CATALOG = Object.freeze(Object.fromEntries(
    Object.entries(WAS).map(([type, representation]) => [type, { representation }]),
  ));

  const has = (value) => value !== undefined && value !== null && value !== '';
  const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const nonEmptyArray = (value) => Array.isArray(value) && value.length > 0;
  const get = (question, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), question);
  const getTypeEntry = (type) => QUESTION_TYPE_CATALOG[type] || null;

  const nativeStimulusRepresentation = (stimulus, depth = 0) => {
    if (!isObject(stimulus) || depth > 2) return null;
    const supplied = [
      isObject(stimulus.graph) ? REPRESENTATIONS.GRAPH : null,
      nonEmptyArray(stimulus.table?.rows) ? REPRESENTATIONS.TABLE : null,
      nonEmptyArray(stimulus.orderedPairs) ? REPRESENTATIONS.ORDERED_PAIRS : null,
      ...(Array.isArray(stimulus.panels) ? stimulus.panels : [])
        .map((panel) => nativeStimulusRepresentation(panel, depth + 1)),
    ];
    return [REPRESENTATIONS.GRAPH, REPRESENTATIONS.TABLE, REPRESENTATIONS.ORDERED_PAIRS]
      .find((representation) => supplied.includes(representation)) || null;
  };

  return (question = {}) => {
    const stimulusRepresentation = nativeStimulusRepresentation(question?.stimulus);
    if (stimulusRepresentation) return stimulusRepresentation;
    const type = question?.toolId || question?.type;
    const entry = getTypeEntry(type);
    if (entry) {
      if (entry.representation === REPRESENTATIONS.GRAPH) {
        const hasGraph = isObject(question.graph) || isObject(question.visual)
          || has(get(question, 'functionSpec.type')) || nonEmptyArray(question.graphs);
        if (!hasGraph) return REPRESENTATIONS.TEXT;
      }
      if (entry.representation === REPRESENTATIONS.SYMBOLIC && isObject(question.graph)) {
        return REPRESENTATIONS.GRAPH;
      }
      if (entry.representation === REPRESENTATIONS.SYMBOLIC && isObject(question.table)) {
        return REPRESENTATIONS.TABLE;
      }
      return entry.representation;
    }
    return type ? REPRESENTATIONS.INTERACTIVE : REPRESENTATIONS.TEXT;
  };
})();

const catalogs = [
  ['the catalog', { CATALOGUED_TYPES, QUESTION_TYPE_CATALOG }],
  ['the server\'s copy of the catalog', serverCatalog],
];

test('the catalog and questionRepresentation.mjs list the same types: none missing, none extra', () => {
  assert.ok(CATALOGUED_TYPES.length > 0, 'no catalogued types were read, so nothing below was compared');
  const listed = Object.keys(REPRESENTATION_BY_TYPE);
  for (const [name, catalog] of catalogs) {
    const missing = catalog.CATALOGUED_TYPES.filter((type) => !listed.includes(type));
    const extra = listed.filter((type) => !catalog.CATALOGUED_TYPES.includes(type));
    assert.deepEqual(missing, [], `${name} has a type REPRESENTATION_BY_TYPE (functions/shared/questionRepresentation.mjs) does not: add ${missing.map((type) => `${type}: REPRESENTATIONS.<what the student sees>`).join(', ')}`);
    assert.deepEqual(extra, [], `REPRESENTATION_BY_TYPE names a type ${name} does not have: remove ${extra.join(', ')} from it`);
  }
  assert.equal(new Set(listed).size, listed.length);
});

test('each catalog entry shows what REPRESENTATION_BY_TYPE says, and it is a representation the platform defines', () => {
  const defined = Object.values(REPRESENTATIONS);
  for (const [name, catalog] of catalogs) {
    for (const [type, entry] of Object.entries(catalog.QUESTION_TYPE_CATALOG)) {
      assert.equal(entry.representation, REPRESENTATION_BY_TYPE[type], `${name}: ${type} shows ${entry.representation}, the module says ${REPRESENTATION_BY_TYPE[type]}: write \`representation: REPRESENTATION_BY_TYPE.${type}\` in the entry`);
      assert.ok(defined.includes(entry.representation), `${name}: ${type} shows "${entry.representation}", which is not one of ${defined.join(', ')}`);
    }
  }
});

test('the catalog hands out the module\'s own function and names, so there is one of each', () => {
  assert.equal(fromCatalog, getQuestionRepresentation);
  assert.equal(CATALOG_REPRESENTATIONS, REPRESENTATIONS);
  assert.equal(serverCatalog.getQuestionRepresentation, getQuestionRepresentation);
  assert.equal(serverCatalog.REPRESENTATIONS, REPRESENTATIONS);
});

test('every type the catalog had shows a student what it always showed', () => {
  assert.ok(Object.keys(WAS).length >= 22, 'WAS has lost types');
  for (const [type, representation] of Object.entries(WAS)) {
    // A type added to the catalog since is not in WAS; it has to be in the module (the sync test above).
    assert.equal(REPRESENTATION_BY_TYPE[type], representation, `${type} no longer shows ${representation} in REPRESENTATION_BY_TYPE: if that is deliberate, change WAS in this test with it`);
    assert.equal(QUESTION_TYPE_CATALOG[type]?.representation, representation, `${type} is no longer in the catalog, or shows something else: if that is deliberate, change WAS in this test with it`);
  }
});

// --- the same answer, for every type and every question ----------------------

const nest = (levels, leaf) => (levels === 0 ? leaf : { panels: [nest(levels - 1, leaf)] });
const label = (question) => {
  try { return JSON.stringify(question) ?? String(question); } catch { return String(question); }
};

// Names for the type field: every catalogued type, types no catalog has,
// spellings that are not quite a type, nothing at all, and the names every
// plain object inherits (the lookup meets the same prototype it always did).
const TYPE_NAMES = [
  ...Object.keys(WAS),
  'graphing2', 'dataModelingLab', 'sequenceExplorer', 'systemsWorkspace', 'regressionCalculator', 'response', 'foo',
  'Algebra', 'ALGEBRA', ' algebra', 'algebra ', 'graph', 'text', 'symbolic',
  '', ' ', undefined, null, 0, false, 5, [], {}, ['algebra'], ['graphing2'],
  'constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
];

// Where a question can name its type: `toolId` wins over `type`, and a falsy one does not.
const NAMED = [
  (name) => ({ type: name }),
  (name) => ({ toolId: name }),
  (name) => ({ toolId: name, type: 'algebra' }),
  (name) => ({ toolId: name, type: 'graphing' }),
  (name) => ({ toolId: '', type: name }),
  (name) => ({ toolId: 'graphing2', type: name }),
  (name) => ({ toolId: undefined, type: name }),
];

// What a question can carry that the rules read.
const CARRIED = [
  {},
  { graph: {} }, { graph: { functions: [] } }, { graph: [] }, { graph: null }, { graph: 'g' },
  { visual: {} }, { visual: [] }, { visual: 'v' },
  { functionSpec: { type: 'linear' } }, { functionSpec: { type: '' } }, { functionSpec: {} }, { functionSpec: null }, { functionSpec: 'linear' },
  { graphs: [{}] }, { graphs: [] }, { graphs: {} },
  { table: {} }, { table: { rows: [] } }, { table: [] }, { table: 'rows' },
  { graph: {}, table: {} }, { graph: [], table: {} }, { visual: {}, table: {} },
];

const STIMULI = [
  undefined, null, 0, 'text', [], {},
  { graph: {} }, { graph: [] }, { graph: null },
  { table: { rows: [{}] } }, { table: { rows: [] } }, { table: {} }, { table: { rows: 'x' } },
  { orderedPairs: [[1, 2]] }, { orderedPairs: [] }, { orderedPairs: 'x' },
  { graph: {}, table: { rows: [{}] } }, { table: { rows: [{}] }, orderedPairs: [[1, 2]] }, { graph: {}, orderedPairs: [[1, 2]] },
  { panels: [] }, { panels: 'x' }, { panels: {} }, { panels: [null, 5, 'x', []] },
  { panels: [{ graph: {} }] }, { panels: [{ table: { rows: [{}] } }] }, { panels: [{ orderedPairs: [[1, 2]] }] },
  { panels: [{ table: { rows: [{}] } }, { graph: {} }] }, { panels: [{ orderedPairs: [[1, 2]] }, { table: { rows: [{}] } }] },
  { table: { rows: [{}] }, panels: [{ graph: {} }] },
  // Panels inside panels count to a depth of two, and no further.
  ...[0, 1, 2, 3, 4].flatMap((levels) => [
    nest(levels, { graph: {} }), nest(levels, { table: { rows: [{}] } }), nest(levels, { orderedPairs: [[1, 2]] }),
    nest(levels, { graph: {}, table: { rows: [{}] } }),
  ]),
  { panels: [nest(2, { graph: {} }), { table: { rows: [{}] } }] },
  { panels: [nest(3, { graph: {} }), { table: { rows: [{}] } }] },
];

// A type from each kind, to carry every stimulus.
const STIMULUS_TYPES = ['algebra', 'graphing', 'numberLine', 'table', 'orderedPair', 'relationshipModel', 'relationMapping', 'graphing2', '', undefined];

const questions = () => {
  const all = [];
  for (const name of TYPE_NAMES) {
    for (const named of NAMED) for (const carried of CARRIED) all.push({ ...named(name), ...carried });
  }
  for (const stimulus of STIMULI) {
    for (const type of STIMULUS_TYPES) all.push({ type, stimulus }, { type, stimulus, graph: {} }, { type, stimulus, table: {} });
  }
  // Not questions at all: whatever a caller hands over.
  all.push(undefined, null, 0, 1, '', 'algebra', 'graphing', true, false, [], [{ type: 'algebra' }], () => ({ type: 'algebra' }), Symbol.iterator);
  return all;
};

test('getQuestionRepresentation gives the answer it always gave, for every type and every question', () => {
  const asked = questions();
  assert.ok(asked.length > 5000, `only ${asked.length} questions were tried`);
  const moved = [];
  for (const question of asked) {
    const was = asItWas(question);
    for (const [from, ask] of [['the module', getQuestionRepresentation], ['the catalog', fromCatalog], ['the server\'s catalog', serverCatalog.getQuestionRepresentation]]) {
      const now = ask(question);
      if (!Object.is(now, was)) moved.push(`${from}: ${label(question)} was ${String(was)}, now ${String(now)}`);
    }
  }
  assert.deepEqual(moved.slice(0, 10), [], `${moved.length} answers moved`);
  assert.equal(moved.length, 0);
  // The oracle is not vacuous: it reaches every representation, and the undefined
  // a name every object inherits has always been given.
  const answers = new Set(asked.map(asItWas));
  for (const representation of Object.values(REPRESENTATIONS)) assert.ok(answers.has(representation), `no question was answered "${representation}"`);
  assert.ok(answers.has(undefined), 'no question reached the lookup of an inherited name');
});

test('the answers a student\'s Home depends on', () => {
  // A type that can carry a graph, without one, is text; with one, a graph.
  assert.equal(getQuestionRepresentation({ type: 'graphAnalysis' }), REPRESENTATIONS.TEXT);
  assert.equal(getQuestionRepresentation({ type: 'graphAnalysis', functionSpec: { type: 'line' } }), REPRESENTATIONS.GRAPH);
  // A symbolic type that carries a graph or a table shows that instead.
  assert.equal(getQuestionRepresentation({ type: 'algebra' }), REPRESENTATIONS.SYMBOLIC);
  assert.equal(getQuestionRepresentation({ type: 'algebra', graph: { functions: [] } }), REPRESENTATIONS.GRAPH);
  assert.equal(getQuestionRepresentation({ type: 'algebra', table: { rows: [] } }), REPRESENTATIONS.TABLE);
  // What the stimulus carries comes first, graph before table before pairs.
  assert.equal(getQuestionRepresentation({ type: 'algebra', stimulus: { table: { rows: [{}] }, graph: {} } }), REPRESENTATIONS.GRAPH);
  assert.equal(getQuestionRepresentation({ type: 'multiAnswer', stimulus: { panels: [{ panels: [{ table: { rows: [{ cells: [1, 2] }] } }] }] } }), REPRESENTATIONS.TABLE);
  // A tool the catalog has no entry for renders its own workspace; no type at all is text.
  assert.equal(getQuestionRepresentation({ type: 'graphing2' }), REPRESENTATIONS.INTERACTIVE);
  assert.equal(getQuestionRepresentation({}), REPRESENTATIONS.TEXT);
  assert.equal(getQuestionRepresentation(), REPRESENTATIONS.TEXT);
  assert.equal(getQuestionRepresentation(null), REPRESENTATIONS.TEXT);
});
