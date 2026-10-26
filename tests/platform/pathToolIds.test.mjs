// WHICH PATH TOOL A QUESTION NAMES, ANSWERED FROM THE NAMES ALONE (PF01, C1-103).
//
// functions/shared/pathToolIds.mjs holds the ids of the tools that have a Path
// Tool Contract and the authoring aliases for them. A student's Home resolves a
// Test Cycle family's tool from it, so the graders in pathToolContracts.mjs
// (about 90 KB of source) stay out of the first load
// (tests/platform/firstLoadPathToolGraders.test.mjs). That is only safe while
// the two agree. This holds them together: the ids, the aliases, and every
// answer resolvePathToolId gives, against the resolver as it was written when
// it lived next to the contracts.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PATH_TOOL_IDS,
  getPathToolContract,
  resolvePathToolId as resolveFromContracts,
} from '../../functions/shared/pathToolContracts.mjs';
import { PATH_CONTRACT_TOOL_IDS, PATH_TOOL_ALIASES, resolvePathToolId } from '../../functions/shared/pathToolIds.mjs';
import { describeFamily } from '../../functions/shared/testCycleBlueprint.mjs';
import { resolveSecureToolId } from '../../functions/shared/secureToolCertification.mjs';

// What authoring has always meant by these names, written out here and not read
// back from the module under test.
const ALIASES = Object.freeze({
  functionGraph: 'functionInvestigation',
  dataModeling: 'dataModelingLab',
});

// The resolver exactly as it was in pathToolContracts.mjs, with the registry
// stood in by an object holding the real contract ids (a plain object, as
// CONTRACTS is, so a name like "constructor" meets the same prototype it did).
const REGISTRY = Object.fromEntries(PATH_TOOL_IDS.map((id) => [id, {}]));
const resolveAsItWas = (question) => {
  const explicit = String(question?.pathToolId || question?.toolId || question?.type || '').trim();
  const resolved = ALIASES[explicit] || explicit;
  return REGISTRY[resolved] ? resolved : null;
};

test('the ids named in pathToolIds.mjs are the tools that have a contract: none missing, none extra', () => {
  const missing = PATH_TOOL_IDS.filter((id) => !PATH_CONTRACT_TOOL_IDS.includes(id));
  const extra = PATH_CONTRACT_TOOL_IDS.filter((id) => !PATH_TOOL_IDS.includes(id));
  assert.deepEqual(missing, [], `a contract in pathToolContracts.mjs has no id in pathToolIds.mjs: add ${missing.join(', ')} to PATH_CONTRACT_TOOL_IDS`);
  assert.deepEqual(extra, [], `pathToolIds.mjs names a tool with no contract: remove ${extra.join(', ')} from PATH_CONTRACT_TOOL_IDS`);
  assert.equal(new Set(PATH_CONTRACT_TOOL_IDS).size, PATH_CONTRACT_TOOL_IDS.length, 'an id is listed twice');
  assert.ok(PATH_TOOL_IDS.length > 0, 'no contracts were read: the registry is not being listed, so nothing above was compared');
});

test('an alias names a tool that has a contract, and never shadows a tool that has its own', () => {
  assert.deepEqual({ ...PATH_TOOL_ALIASES }, ALIASES);
  for (const [alias, target] of Object.entries(ALIASES)) {
    assert.ok(PATH_TOOL_IDS.includes(target), `${alias} points at ${target}, which has no contract`);
    assert.ok(!PATH_TOOL_IDS.includes(alias), `${alias} is an alias and also a tool with a contract of its own`);
    assert.ok(getPathToolContract(alias), `${alias} finds no contract`);
    assert.equal(getPathToolContract(alias), getPathToolContract(target), `${alias} finds a different contract from ${target}`);
  }
});

test('pathToolContracts.mjs still exports the resolver, and it is the one pathToolIds.mjs holds', () => {
  assert.equal(resolveFromContracts, resolvePathToolId);
});

test('every tool resolves to itself from any of the three fields a question can declare it in', () => {
  for (const id of PATH_TOOL_IDS) {
    for (const field of ['pathToolId', 'toolId', 'type']) {
      assert.equal(resolvePathToolId({ [field]: id }), id, `${field}: ${id}`);
    }
  }
});

test('an authoring alias resolves to the tool it means', () => {
  for (const [alias, target] of Object.entries(ALIASES)) {
    for (const field of ['pathToolId', 'toolId', 'type']) {
      assert.equal(resolvePathToolId({ [field]: alias }), target, `${field}: ${alias}`);
    }
  }
});

test('the first field a question fills decides, and an unknown one does not fall through to the next', () => {
  assert.equal(resolvePathToolId({ pathToolId: 'graphing2', toolId: 'algebra', type: 'system' }), 'graphing2');
  assert.equal(resolvePathToolId({ toolId: 'algebra', type: 'system' }), 'algebra');
  assert.equal(resolvePathToolId({ pathToolId: 'notATool', toolId: 'algebra', type: 'system' }), null,
    'a question that declares a tool with no contract fails closed; it does not borrow another field\'s tool');
});

test('names that are not a tool with a contract resolve to nothing', () => {
  for (const question of [
    null, undefined, 0, '', 'algebra', [], {},
    { type: '' }, { type: ' ' }, { type: null }, { type: 5 }, { type: {} },
    { type: 'Algebra' }, { type: 'ALGEBRA' }, { type: 'sequenceExplorer' }, { type: 'parabolaGeometryLab' },
    // `literal` can render on a contract's workspace but is deliberately not aliased to it.
    { type: 'literal' }, { questionType: 'response' },
    // Names every plain object inherits are not tools.
    { type: 'constructor' }, { type: 'toString' }, { type: 'valueOf' }, { type: 'hasOwnProperty' },
    { type: '__proto__' }, { type: 'isPrototypeOf' }, { toolId: 'constructor' }, { pathToolId: '__proto__' },
  ]) {
    assert.equal(resolvePathToolId(question), null, JSON.stringify(question) ?? String(question));
  }
});

test('a name is trimmed and compared exactly', () => {
  assert.equal(resolvePathToolId({ type: '  graphing2  ' }), 'graphing2');
  assert.equal(resolvePathToolId({ type: 'dataModeling\n' }), 'dataModelingLab');
  assert.equal(resolvePathToolId({ type: 'graphing 2' }), null);
});

test('resolvePathToolId gives the answer it always gave, on every spelling and field combination', () => {
  const names = [
    ...PATH_TOOL_IDS, ...Object.keys(ALIASES), ...Object.values(ALIASES),
    'sequenceExplorer', 'parabolaGeometryLab', 'literal', 'response', 'Algebra', 'ALGEBRA', 'graphing 2',
    '', ' ', '  graphing2  ', 'functionGraph ', 'dataModeling\n', '\tstepAlgebra',
    'constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf', 'prototype', 'length', 'name',
  ];
  const fields = ['pathToolId', 'toolId', 'type'];
  const questions = [null, undefined, 0, '', 'algebra', [], {}];
  for (const name of names) {
    for (const field of fields) questions.push({ [field]: name });
    for (const other of ['algebra', 'functionGraph', 'notATool']) {
      questions.push({ pathToolId: name, toolId: other }, { toolId: name, type: other }, { pathToolId: name, toolId: other, type: 'system' });
      questions.push({ pathToolId: other, toolId: name }, { toolId: other, type: name });
    }
  }
  assert.ok(questions.length > 500, `only ${questions.length} questions were tried`);
  const moved = questions
    .map((question) => ({ question, was: resolveAsItWas(question), now: resolvePathToolId(question) }))
    .filter(({ was, now }) => was !== now);
  assert.deepEqual(moved, [], `${moved.length} questions resolve to a different tool than before`);
  // The oracle is not vacuous: it finds tools for the names that have them.
  const found = new Set(questions.map(resolveAsItWas).filter(Boolean));
  assert.deepEqual([...found].sort(), [...PATH_TOOL_IDS].sort());
});

// The place Home reaches the resolver: a Test Cycle family describes itself
// with the tool it renders on (testCycleBlueprint.describeFamily).
test('a Test Cycle family describes its tool the way it did, aliases included', () => {
  for (const [spelling, tool] of [
    [{ type: 'graphing2' }, 'graphing2'],
    [{ type: 'functionGraph' }, 'functionInvestigation'],
    [{ toolId: 'dataModeling' }, 'dataModelingLab'],
    [{ pathToolId: 'relationMapping', type: 'ignored' }, 'relationMapping'],
    // A tool with no contract is named as declared; no tool at all is none.
    [{ type: 'sequenceExplorer' }, 'sequenceExplorer'],
    [{}, null],
  ]) {
    assert.equal(describeFamily({ id: 'family-1', alignmentKeys: ['A.1A'], ...spelling }).toolId, tool, JSON.stringify(spelling));
    assert.equal(resolveSecureToolId(spelling), tool, JSON.stringify(spelling));
  }
});
