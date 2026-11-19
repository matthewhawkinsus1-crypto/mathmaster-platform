/*
 * THE BACKEND'S CODE, WHEREVER functions/index.js KEEPS IT.
 *
 * functions/index.js was one file holding every function of the default
 * codebase. In November 2026 its statements moved, verbatim, into one module
 * per domain beside it (gradingFunctions.js, classroomFunctions.js, ...) and
 * functionsCommon.js for the helpers two domains use. index.js sets the
 * global options and loads them (see its header).
 *
 * A contract that describes what the backend does, not which file a function
 * sits in, reads all of them through this helper:
 *
 *   functionsBackendSource()         index.js, the common helpers, then each
 *                                    domain module in the order index.js
 *                                    loads them
 *   functionsModuleDefining('name')  { path, source } of the one module that
 *                                    declares `name` at its top level (a
 *                                    function, a const, or `exports.name`)
 *   functionsDeclaration('name')     the text of that one top-level
 *                                    statement, whole: `exports.name = ...`,
 *                                    `function name() {...}` or the `const`
 *
 * functionsDeclaration is how a contract reads one function. A slice from a
 * function's first line to the first line of whatever followed it in the old
 * file breaks when the two are no longer neighbours, and it was never what
 * the contract meant: the statement is. Its bounds come from the release
 * planner's parser, so the comments above it are not part of it.
 *
 * The list of modules is read from index.js itself, so a module index.js does
 * not load is not part of "the backend", and one it starts loading is. A
 * forbidden pattern (doesNotMatch) over functionsBackendSource() is refused in
 * every module, so it cannot return by moving.
 *
 * functions/entry.js, platformEntry.js and the Classroom section entries were
 * always separate files and are not included: read them by name.
 */
import { readFileSync } from 'node:fs';

import { buildFunctionsImportGraph, fsSource } from '../../../scripts/lib/functionsImportGraph.mjs';

const read = (repoPath) => readFileSync(new URL(`../../../${repoPath}`, import.meta.url), 'utf8');

export const FUNCTIONS_INDEX_PATH = 'functions/index.js';
export const FUNCTIONS_COMMON_PATH = 'functions/functionsCommon.js';

const LOADED_MODULE = /^\s*require\("\.\/([A-Za-z]+Functions)"\),?$/gm;

/** The domain modules index.js loads, in its order. */
export const functionsDomainPaths = () => {
  const paths = [...read(FUNCTIONS_INDEX_PATH).matchAll(LOADED_MODULE)].map(([, name]) => `functions/${name}.js`);
  if (paths.length < 2) throw new Error('functions/index.js no longer loads its domain modules with require("./<name>Functions"); update functionsBackendSource.mjs');
  return paths;
};

/** index.js, the common helpers and every domain module. */
export const functionsBackendPaths = () => [FUNCTIONS_INDEX_PATH, FUNCTIONS_COMMON_PATH, ...functionsDomainPaths()];

/** The text of all of them, joined. */
export const functionsBackendSource = () => functionsBackendPaths().map(read).join('\n');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The one module that declares `name` at its top level. */
export const functionsModuleDefining = (name) => {
  const declares = new RegExp(`^(?:exports\\.${escapeRegExp(name)} = |(?:async )?function ${escapeRegExp(name)}\\(|(?:const|let) ${escapeRegExp(name)} = )`, 'm');
  const found = functionsBackendPaths().map((path) => ({ path, source: read(path) })).filter(({ source }) => declares.test(source));
  if (found.length !== 1) throw new Error(`${found.length} backend modules declare ${name} at their top level (${found.map(({ path }) => path).join(', ') || 'none'})`);
  return found[0];
};

let graph = null;
const analysisOf = (path) => {
  if (!graph) graph = buildFunctionsImportGraph({ source: fsSource() });
  const analysis = graph.entryAnalysis(path);
  if (analysis.error) throw new Error(`${path} could not be read: ${analysis.error}`);
  return analysis;
};

/**
 * The text of the one top-level statement of the backend that declares
 * `name`: `exports.name = ...` when a module exports it, otherwise the
 * function, class, const or let of that name. Throws when no module, or more
 * than one, declares it.
 */
export const functionsDeclaration = (name) => {
  const found = [];
  for (const path of functionsBackendPaths()) {
    const analysis = analysisOf(path);
    const key = analysis.byKey.has(`exports.${name}`) ? `exports.${name}` : analysis.byName.get(name);
    // A name a module only requires is declared in the module it comes from.
    if (!key || analysis.bindings.get(name)?.key === key) continue;
    const { node } = analysis.byKey.get(key);
    found.push({ path, text: analysis.text.slice(node.start, node.end) });
  }
  if (found.length !== 1) throw new Error(`${found.length} backend modules declare ${name} at their top level (${found.map(({ path }) => path).join(', ') || 'none'})`);
  return found[0].text;
};

/**
 * The text of the top-level statement that declares `name`, cut out of
 * `source`: the backend's text as the caller holds it, comments stripped
 * (executableSource) or not. Use it where a contract already has that text
 * and wants one function of it:
 *
 *   const index = executableSource(functionsBackendSource());
 *   const sync = topLevelDeclaration(index, 'syncGradeToClassroom');
 *
 * The statement starts at `exports.name = `, `function name(`, `const name`
 * or `let name` at the start of a line. It runs to the last line before the
 * next thing that starts at column 0, a closing bracket at column 0 being
 * part of it: every top-level statement of the backend is laid out that way
 * (functionsDomainModules.test.mjs checks each against the parser). Where a
 * module both declares `function name` and exports `name`, say which:
 * 'exports.name' or 'function name'.
 */
export const topLevelDeclaration = (source, name) => {
  const [, kind, bare] = name.match(/^(exports\.|function )?(.+)$/);
  const escaped = escapeRegExp(bare);
  const forms = {
    'exports.': `exports\\.${escaped} = `,
    'function ': `(?:async )?function ${escaped}\\(`,
    declared: `(?:const|let) ${escaped}\\b`,
  };
  const wanted = kind ? [forms[kind]] : Object.values(forms);
  const starts = [...source.matchAll(new RegExp(`^(?:${wanted.join('|')})`, 'gm'))];
  if (starts.length !== 1) {
    throw new Error(`${starts.length} top-level declarations of ${name} in the text given (expected one${starts.length > 1 ? `; say 'exports.${bare}' or 'function ${bare}'` : ''})`);
  }
  const start = starts[0].index;
  const lines = source.slice(start).split('\n');
  let last = 0;
  for (let at = 1; at < lines.length; at += 1) {
    const line = lines[at];
    if (line === '' || /^\s/.test(line)) continue;
    if (/^[\])}]/.test(line)) {
      last = at;
      continue;
    }
    break;
  }
  // Indented lines after the last closing bracket belong to it too (a
  // chained call that ends without one); blank lines after it do not.
  for (let at = last + 1; at < lines.length && (lines[at] === '' || /^\s/.test(lines[at])); at += 1) if (lines[at].trim()) last = at;
  return lines.slice(0, last + 1).join('\n');
};

export default functionsBackendSource;
