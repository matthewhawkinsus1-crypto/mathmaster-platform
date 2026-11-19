// functions/index.js LOADS ONE MODULE PER DOMAIN, AND THE SEAMS HOLD.
//
// In November 2026 index.js's 28,000 lines moved, statement for statement,
// into one module per domain beside it and functionsCommon.js for the helpers
// two domains use. Nothing a deploy sees changed: every function kept its
// name, trigger and options (node scripts/functions-manifest.mjs --compare
// <commit> proves that for any change).
//
// What can go wrong afterwards is in how the modules are joined, and none of
// it fails loudly:
//   - a module loaded before setGlobalOptions runs defines its functions
//     without the 512 MiB floor, the public invoker and the provenance labels;
//   - two modules that export the same name: Object.assign keeps the later
//     one and the other function silently stops being deployed;
//   - a domain module that loads another domain module, or the common module
//     loading a domain: a cycle hands back a half-built module, and a helper
//     is `undefined` only when a handler first calls it;
//   - a `let` exported from the common module: the importer gets the value
//     it had at load, not the variable.
// These tests read the real files with the release planner's parser.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildFunctionsImportGraph, fsSource, STATEMENT_LEVEL_MODULES } from '../../scripts/lib/functionsImportGraph.mjs';
import { listDeployableFunctions } from '../../scripts/lib/functionsInventory.mjs';
import { compareManifests } from '../../scripts/functions-manifest.mjs';
import {
  FUNCTIONS_COMMON_PATH,
  FUNCTIONS_INDEX_PATH,
  functionsBackendPaths,
  functionsBackendSource,
  functionsDomainPaths,
  functionsModuleDefining,
} from './helpers/functionsBackendSource.mjs';

const graph = buildFunctionsImportGraph({ source: fsSource() });
const analysisOf = (file) => {
  const analysis = graph.entryAnalysis(file);
  assert.equal(analysis.error, null, `${file} parses`);
  return analysis;
};
const domains = functionsDomainPaths();
const index = analysisOf(FUNCTIONS_INDEX_PATH);
const calls = (record, callee) => record.node.type === 'ExpressionStatement' && record.node.expression.type === 'CallExpression'
  && record.node.expression.callee.name === callee;
// The modules of functions/ a file loads with a literal require(), anywhere in it.
const loadedBackendModules = (file) => {
  const backend = new Set(functionsBackendPaths());
  const text = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
  return [...text.matchAll(/require\(\s*["']\.\/([A-Za-z]+)(?:\.js)?["']\s*\)/g)]
    .map(([, name]) => `functions/${name}.js`)
    .filter((path) => backend.has(path));
};

test('index.js sets the global options and starts the Admin SDK before it loads any domain module', () => {
  const order = index.statements.map((record) => (
    calls(record, 'setGlobalOptions') ? 'setGlobalOptions'
      : calls(record, 'initializeApp') ? 'initializeApp'
        : record.kind === 'merge' ? 'load the domains'
          : record.kind
  ));
  assert.deepEqual(order.filter((step) => step !== 'declaration'), ['setGlobalOptions', 'initializeApp', 'load the domains']);
  // Nothing index.js declares loads a domain module early: its declarations
  // are the three requires the set-up reads and the memory floor.
  index.statements.filter((record) => record.kind === 'declaration').forEach((record) => {
    record.loads.forEach(({ target }) => assert.ok(!functionsBackendPaths().includes(target), `${record.key} loads ${target} before the global options are set`));
  });
  assert.ok(domains.length >= 5, 'the domain modules are read from index.js');
  assert.deepEqual(graph.uncertain, [], 'the release planner follows every load');
});

test('index.js defines no function itself: every export is a domain module\'s', () => {
  assert.deepEqual(index.statements.filter((record) => record.kind === 'export').map((record) => record.key), []);
  const merged = index.statements.filter((record) => record.kind === 'merge');
  assert.equal(merged.length, 1);
  assert.deepEqual(loadedBackendModules(FUNCTIONS_INDEX_PATH), domains, 'index.js loads the domain modules and nothing else of the backend');
});

test('no two domain modules export the same name', () => {
  const owners = new Map();
  for (const file of domains) {
    for (const record of analysisOf(file).statements) {
      if (record.kind === 'merge' || record.key === 'module.exports') assert.fail(`${file} line ${record.line}: a domain module exports with \`exports.NAME = ...\`, one name a statement`);
      if (record.kind !== 'export') continue;
      const name = record.key.replace(/^exports\./, '').replace(/#\d+$/, '');
      if (!owners.has(name)) owners.set(name, []);
      owners.get(name).push(file);
    }
  }
  const twice = [...owners.entries()].filter(([, files]) => files.length > 1).map(([name, files]) => `${name}: ${files.join(', ')}`);
  assert.deepEqual(twice, [], 'Object.assign would keep one and drop the other');
  // Every deployable function index.js's own chain defines is one of them.
  const deployable = listDeployableFunctions().functions.map((fn) => fn.name);
  assert.ok(owners.size > 150 && deployable.length >= owners.size, `${owners.size} exports, ${deployable.length} deployable functions`);
  [...owners.keys()].forEach((name) => assert.ok(deployable.includes(name), `${name} is exported by a domain module and deployed`));
});

test('a domain module loads the common helpers and never another domain; the common module loads neither', () => {
  for (const file of domains) {
    const loaded = loadedBackendModules(file);
    assert.deepEqual(loaded.filter((path) => path !== FUNCTIONS_COMMON_PATH), [], `${file} loads another backend module`);
  }
  assert.deepEqual(loadedBackendModules(FUNCTIONS_COMMON_PATH), [], 'functionsCommon.js loads no domain module and not index.js');
});

test('the common module exports declarations by name, never a variable that changes, and only declares', () => {
  assert.deepEqual(STATEMENT_LEVEL_MODULES, [FUNCTIONS_COMMON_PATH], 'the release planner reads it statement by statement');
  const common = analysisOf(FUNCTIONS_COMMON_PATH);
  assert.deepEqual(common.globals, [], 'no top-level statement of it acts at load');
  const exported = common.statements.filter((record) => record.kind === 'export');
  assert.deepEqual(exported.map((record) => record.key), ['module.exports']);
  assert.equal(common.statements.at(-1).key, 'module.exports', 'the exports come last, after everything they name');
  const properties = exported[0].node.expression.right.properties;
  assert.ok(properties.length > 20, 'the real export list was read');
  for (const property of properties) {
    assert.ok(property.type === 'Property' && property.shorthand, 'each export is a declaration\'s own name');
    const name = property.key.name;
    const record = common.byKey.get(common.byName.get(name));
    assert.ok(record, `${name} is declared in functionsCommon.js`);
    const kind = record.node.type === 'VariableDeclaration' ? record.node.kind : 'function';
    assert.notEqual(kind, 'let', `${name} is a \`let\`: an importer would get its value at load, not the variable`);
    assert.notEqual(kind, 'var', `${name} is a \`var\``);
  }
});

test('every name a domain module takes from the common module is one it exports, and is used', () => {
  const common = analysisOf(FUNCTIONS_COMMON_PATH);
  const exported = new Set(common.statements.at(-1).node.expression.right.properties.map((property) => property.key.name));
  const taken = new Set();
  for (const file of domains) {
    const analysis = analysisOf(file);
    const used = new Set(analysis.statements.flatMap((record) => record.refs.map((ref) => ref.name)));
    for (const [name, binding] of analysis.bindings) {
      if (!/^\.\/functionsCommon(?:\.js)?$/.test(binding.specifier)) continue;
      assert.ok(!binding.whole && binding.path.length === 1, `${file} takes ${name} from the common module by name`);
      assert.ok(exported.has(binding.path[0]), `${file} takes ${binding.path[0]}, which functionsCommon.js does not export: it would be undefined`);
      assert.ok(used.has(name), `${file} takes ${name} from the common module and never uses it`);
      taken.add(binding.path[0]);
    }
  }
  assert.deepEqual([...exported].filter((name) => !taken.has(name)), [], 'functionsCommon.js exports a helper no domain module takes: it belongs to no one, or to one domain\'s file');
});

test('the backend-source helper reads the modules index.js loads, and finds a declaration\'s module', () => {
  const source = functionsBackendSource();
  assert.match(source, /^exports\.ingestStudentSubmissions = /m);
  assert.match(source, /^setGlobalOptions\(/m);
  assert.match(functionsModuleDefining('ingestStudentSubmissions').path, /^functions\/\w+Functions\.js$/);
  assert.equal(functionsModuleDefining('FUNCTION_MEMORY_FLOOR').path, FUNCTIONS_INDEX_PATH);
  assert.throws(() => functionsModuleDefining('noSuchBackendDeclaration'), /0 backend modules declare/);
});

test('the manifest comparison names what was added, removed and changed', () => {
  const callable = (memory) => ({ endpoint: { platform: 'gcfv2', availableMemoryMb: memory, callableTrigger: {} }, requiredAPIs: [], trigger: null });
  const before = { kept: callable(512), resized: callable(512), dropped: callable(512) };
  const after = { kept: callable(512), resized: callable(1024), fresh: callable(512) };
  assert.deepEqual(compareManifests(before, after), {
    added: ['fresh'],
    removed: ['dropped'],
    changed: { resized: ['endpoint.availableMemoryMb'] },
    same: false,
  });
  assert.equal(compareManifests(before, structuredClone(before)).same, true);
});
