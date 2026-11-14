/*
 * WHICH CLOUD FUNCTIONS A CHANGE REACHES: A STATIC IMPORT GRAPH OF functions/.
 *
 * Every function in the default codebase is uploaded with the whole of
 * functions/, but each one runs only the code its export reaches. A change
 * reaches a function when the function's export, read from the real entry
 * chain (package.json `main`: platformEntry.js -> entry.js -> index.js, and
 * the Classroom section entry merged into it), loads the changed file,
 * directly or not. scripts/release-firebase.mjs deploys those functions
 * instead of the whole fleet (releasePlan.mjs, buildReleasePlan's
 * `selectedFunctions`); `--functions` and `--only` still decide when given.
 *
 * HOW THE GRAPH IS READ
 *   Entry files, the ones whose exports are merged into `main`'s exports, are
 *   read statement by statement. Each top-level declaration and each
 *   `exports.NAME = ...` is a node, and a node depends on the top-level names
 *   its code uses, scoped: a parameter or a local that shadows a top-level
 *   name is not a use. So one export of the 28,000-line index.js depends on
 *   the helpers, constants and lazy loaders it calls, not on all of index.js.
 *   `base.NAME`, where `const base = require('./entry.js')`, reaches that one
 *   export of entry.js; `Object.assign(exports, base)` and
 *   `module.exports = { ... }` say which declaration each exported name is.
 *   Every other file is a single node and depends on every file it loads:
 *   `import` and `export ... from`, `require()` at the top or inside a
 *   function, a literal `import()`, and the loader maps in COMPUTED_LOADERS.
 *   An entry file's top-level statements that are not declarations
 *   (setGlobalOptions, initializeApp) run in every function, so what they
 *   use reaches every function.
 *
 * WHEN THE GRAPH CANNOT BE SURE, the plan deploys every function and says why
 * (selectFunctionsForChange's `all`):
 *   - a computed `import()` or `require()` that no loader map explains: it
 *     could load any file;
 *   - functions/package.json or its lock file: every function runs on them;
 *   - firebase.json's settings for the default codebase, or a script its
 *     predeploy runs: they decide what every function uploads;
 *   - a changed file under functions/ that no function's graph reaches but
 *     that may still be read by name: a data file (the Path seeds are read
 *     with fs from a directory and a file name), or a module whose name is
 *     spelled in a string in the functions code;
 *   - a changed entry statement that every function runs, an export the
 *     graph cannot follow, a deployable function it cannot find, or a file it
 *     cannot parse.
 *
 * WHAT IT ASSUMES
 *   - A module's top-level code belongs to the functions that use the module.
 *     Every function that loads it at start-up runs that code too, so a module
 *     that acted at load on other functions' behalf (patching a shared object)
 *     would be missed. None does: the global setup is index.js's own
 *     setGlobalOptions and initializeApp, which the graph treats as every
 *     function's.
 *   - Code runs only through require() and import(): functions/ starts no
 *     worker or child process from a file and evaluates no code from text. A
 *     file started that way would not be followed.
 *   - Comments and formatting are not code: a file, or an entry declaration,
 *     whose syntax tree did not change reaches nothing.
 *   - Data contracts between functions (one writes a field another reads) are
 *     not imports. Deploying only the functions whose code changed leaves the
 *     rest running the code they would have been redeployed with.
 *
 *   node scripts/lib/functionsImportGraph.mjs <base> [<head>] [--json]
 *     the functions a commit range reaches, read from git (nothing is checked
 *     out; <head> defaults to HEAD). Read-only: it deploys nothing.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'vite';
import {
  RELEASE_TARGETS,
  classifyChangedFiles,
  firebaseFunctionsSettingsChanged,
  functionSelectionLines,
  predeployScripts,
} from './releasePlan.mjs';

const posix = path.posix;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const DEFAULT_CODEBASE_DIR = 'functions';

/*
 * Computed loaders whose targets are known. Each names the file, the
 * function the loader is in, and the top-level map whose literal values are
 * what it loads. A computed import anywhere else, or one of these that no
 * longer matches its description, makes the graph unsure (every function
 * deploys) until it is described here.
 */
export const COMPUTED_LOADERS = Object.freeze([
  Object.freeze({
    file: 'functions/lib/weeklyPathServerPlan.js',
    within: 'loadWeeklyPlanner',
    map: 'PLANNER_ENTRIES',
    // import(pathToFileURL(path.join(root, PLANNER_ENTRIES[name])).href), where
    // root is the repository, or the copy of the same files that
    // scripts/sync-functions-weekly-planner.mjs vendors into functions/vendor
    // at predeploy, in the repository's own layout.
    relativeTo: 'repository',
    describe: 'the weekly planner (PLANNER_ENTRIES, vendored into functions/vendor at predeploy)',
  }),
]);

// Files under functions/ that the deployed code never loads.
const NOT_RUNTIME = [/\.md$/i, /\.txt$/i, /\.png$/i, /(^|\/)\.gitignore$/, /\.example$/];
const CODE_FILE = /\.(?:m|c)?js$/;
const CODE_EXTENSIONS = ['.js', '.mjs', '.cjs', '.json'];
const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/* ---------------------------------------------------------------------------
 * Where the files come from. A source answers a repository-relative path's
 * text (`read`, null when there is no such file) and whether it is a file
 * (`has`, without reading it: the Path seeds are megabytes of JSON).
 * ------------------------------------------------------------------------- */

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/** Files from an object of { 'functions/index.js': text } (tests). */
export const mapSource = (files) => ({
  read: (file) => (own(files, file) ? files[file] : null),
  has: (file) => own(files, file) && files[file] !== null,
});

/** Files of a checkout, read from disk. */
export const fsSource = (root = repoRoot) => {
  const cache = new Map();
  return {
    read(file) {
      if (!cache.has(file)) {
        let text = null;
        try {
          text = readFileSync(path.join(root, file), 'utf8');
        } catch {
          text = null;
        }
        cache.set(file, text);
      }
      return cache.get(file);
    },
    has(file) {
      if (cache.has(file)) return cache.get(file) !== null;
      try {
        return statSync(path.join(root, file)).isFile();
      } catch {
        return false;
      }
    },
  };
};

/**
 * Files of one commit, read with git: what that commit deploys, whatever is
 * checked out. The commit's file list is read once, so a path it does not
 * have is answered without git; the code under `prefetch` is read in one
 * `git cat-file` call, any other file when it is asked for.
 */
export const gitSource = (root = repoRoot, rev = 'HEAD', { prefetch = [DEFAULT_CODEBASE_DIR] } = {}) => {
  const git = (args, input) => spawnSync('git', args, {
    cwd: root, input: input === undefined ? undefined : Buffer.from(input, 'utf8'), encoding: 'buffer', maxBuffer: 512 * 1024 * 1024,
  });
  const resolved = git(['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
  const commit = resolved.status === 0 ? resolved.stdout.toString('utf8').trim() : '';
  if (!commit) throw new Error(`${rev} is not a commit in this checkout.`);
  const listed = git(['ls-tree', '-r', '-z', commit]);
  if (listed.status !== 0) throw new Error(`git ls-tree ${commit} failed: ${listed.stderr.toString('utf8').trim()}`);
  const blobs = new Map(); // path -> object id
  listed.stdout.toString('utf8').split('\0').filter(Boolean).forEach((line) => {
    const tab = line.indexOf('\t');
    const [, type, oid] = line.slice(0, tab).split(' ');
    if (type === 'blob') blobs.set(line.slice(tab + 1), oid);
  });
  const cache = new Map();
  const readBatch = (files) => {
    if (!files.length) return;
    const batch = git(['cat-file', '--batch'], `${files.map((file) => blobs.get(file)).join('\n')}\n`);
    if (batch.status !== 0) return;
    const out = batch.stdout;
    let offset = 0;
    for (const file of files) {
      const newline = out.indexOf(0x0a, offset);
      if (newline === -1) break;
      const header = out.toString('utf8', offset, newline).split(' ');
      const size = Number(header[2]);
      if (header[1] !== 'blob' || !Number.isFinite(size)) break;
      cache.set(file, out.toString('utf8', newline + 1, newline + 1 + size));
      offset = newline + 1 + size + 1;
    }
  };
  readBatch([...blobs.keys()].filter((file) => prefetch.some((dir) => file.startsWith(`${dir}/`))
    && (CODE_FILE.test(file) || /(^|\/)package\.json$/.test(file))));
  return {
    commit,
    read(file) {
      if (!blobs.has(file)) return null;
      if (!cache.has(file)) readBatch([file]);
      return cache.get(file) ?? null;
    },
    has: (file) => blobs.has(file),
  };
};

/** `base`, with some files replaced (a string) or absent (null). */
export const overlaySource = (base, overrides = {}) => ({
  read: (file) => (own(overrides, file) ? overrides[file] : base.read(file)),
  has: (file) => (own(overrides, file) ? overrides[file] !== null : base.has(file)),
});

/* ---------------------------------------------------------------------------
 * Parsing.
 * ------------------------------------------------------------------------- */

const lineIndex = (text) => {
  const starts = [0];
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) starts.push(index + 1);
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
};

// What a piece of code is, without where it sits: positions and the spelling
// of plain literals are dropped, so comments and formatting are not change.
const fingerprint = (node) => JSON.stringify(node, function replacer(key, value) {
  if (key === 'start' || key === 'end') return undefined;
  if (key === 'raw' && this?.type === 'Literal' && !this.regex && !this.bigint) return undefined;
  return typeof value === 'bigint' ? `${value}n` : value;
});

// CommonJS or ESM, as Node decides: the extension, then the nearest package.json.
const sourceTypeOf = (file, source) => {
  if (file.endsWith('.mjs')) return 'module';
  if (file.endsWith('.cjs')) return 'script';
  for (let dir = posix.dirname(file); ; dir = posix.dirname(dir)) {
    const manifest = source?.read(dir === '.' ? 'package.json' : `${dir}/package.json`);
    if (manifest) {
      try {
        return JSON.parse(manifest).type === 'module' ? 'module' : 'script';
      } catch {
        return 'script';
      }
    }
    if (dir === '.' || dir === '/' || !dir) return 'script';
  }
};

const parseCode = (file, text, source) => parseAst(text, { sourceType: sourceTypeOf(file, source), lang: 'js' });

/**
 * Whether two versions of a file differ as code: their syntax trees for a
 * module, their values for JSON, their text for anything else. Unparsable
 * code counts as changed.
 */
export const codeChanged = (file, before, after, { source = null } = {}) => {
  if (before === null || after === null) return before !== after;
  if (before === after) return false;
  if (/\.json$/i.test(file)) {
    try {
      return JSON.stringify(JSON.parse(before)) !== JSON.stringify(JSON.parse(after));
    } catch {
      return true;
    }
  }
  if (!CODE_FILE.test(file)) return true;
  try {
    return fingerprint(parseCode(file, before, source)) !== fingerprint(parseCode(file, after, source));
  } catch {
    return true;
  }
};

const isStringLiteral = (node) => node?.type === 'Literal' && typeof node.value === 'string';
const staticString = (node) => {
  if (isStringLiteral(node)) return node.value;
  if (node?.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis.map((part) => part.value.cooked).join('');
  return null;
};
const isRequireCall = (node) => node?.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'require';

/** Names a binding pattern declares. */
const patternNames = (pattern, out = []) => {
  if (!pattern) return out;
  if (pattern.type === 'Identifier') out.push(pattern.name);
  else if (pattern.type === 'ObjectPattern') pattern.properties.forEach((property) => patternNames(property.type === 'RestElement' ? property.argument : property.value, out));
  else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((element) => patternNames(element, out));
  else if (pattern.type === 'RestElement') patternNames(pattern.argument, out);
  else if (pattern.type === 'AssignmentPattern') patternNames(pattern.left, out);
  return out;
};

// Whether `node` is `inner` or holds it.
const containsNode = (node, inner) => {
  if (!node || typeof node !== 'object') return false;
  if (node === inner) return true;
  if (Array.isArray(node)) return node.some((child) => containsNode(child, inner));
  return Object.keys(node).some((key) => key !== 'start' && key !== 'end' && containsNode(node[key], inner));
};

// Whether `node` uses the identifier `name` anywhere.
const mentions = (node, name) => {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((child) => mentions(child, name));
  if (node.type === 'Identifier' && node.name === name) return true;
  return Object.keys(node).some((key) => key !== 'start' && key !== 'end' && mentions(node[key], name));
};

/*
 * One walk over a piece of code, with scopes. It reports:
 *   ref(name, member)        a use of a name no enclosing scope in the code
 *                            declares (member: `name.member`, `name['member']`)
 *   load(specifier, node)    a require() or import() of a literal path, and
 *                            `import`/`export ... from`
 *   computed(node, within)   a require() or import() whose path is computed,
 *                            and the named function it is written in
 *   string(value)            a string the code spells
 */
const walkCode = (root, { ref = () => {}, load = () => {}, computed = () => {}, string = () => {} }, { withinName = null } = {}) => {
  const scopes = [];
  const declared = (name) => scopes.some((scope) => scope.has(name));
  const declareAll = (scope, names) => names.forEach((name) => scope.add(name));

  // let/const/class/function declared directly in a block.
  const declareBlock = (statements, scope) => {
    for (const statement of statements || []) {
      if (statement?.type === 'VariableDeclaration' && statement.kind !== 'var') statement.declarations.forEach((declarator) => declareAll(scope, patternNames(declarator.id)));
      else if ((statement?.type === 'ClassDeclaration' || statement?.type === 'FunctionDeclaration') && statement.id) scope.add(statement.id.name);
    }
  };
  // A var belongs to its function, wherever in it it is written.
  const hoistVars = (node, scope) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((child) => hoistVars(child, scope));
      return;
    }
    if (FUNCTION_TYPES.has(node.type)) return;
    if (node.type === 'VariableDeclaration' && node.kind === 'var') node.declarations.forEach((declarator) => declareAll(scope, patternNames(declarator.id)));
    for (const key of Object.keys(node)) if (key !== 'start' && key !== 'end' && key !== 'type') hoistVars(node[key], scope);
  };

  const within = [];
  let visit = null;
  // A declaration's binding pattern: only its defaults and computed keys are code.
  const visitPattern = (pattern) => {
    if (!pattern) return;
    if (pattern.type === 'ObjectPattern') {
      pattern.properties.forEach((property) => {
        if (property.type === 'RestElement') visitPattern(property.argument);
        else {
          if (property.computed) visit(property.key);
          visitPattern(property.value);
        }
      });
    } else if (pattern.type === 'ArrayPattern') pattern.elements.forEach(visitPattern);
    else if (pattern.type === 'RestElement') visitPattern(pattern.argument);
    else if (pattern.type === 'AssignmentPattern') {
      visitPattern(pattern.left);
      visit(pattern.right);
    } else if (pattern.type !== 'Identifier') visit(pattern);
  };
  // An assignment's target: the names in it are uses (a lazy loader's cache).
  const visitTarget = (target) => {
    if (!target) return;
    if (target.type === 'ObjectPattern') {
      target.properties.forEach((property) => {
        if (property.type === 'RestElement') visitTarget(property.argument);
        else {
          if (property.computed) visit(property.key);
          visitTarget(property.value);
        }
      });
    } else if (target.type === 'ArrayPattern') target.elements.forEach(visitTarget);
    else if (target.type === 'RestElement') visitTarget(target.argument);
    else if (target.type === 'AssignmentPattern') {
      visitTarget(target.left);
      visit(target.right);
    } else visit(target);
  };
  const visitFunction = (node) => {
    const scope = new Set();
    if (node.type === 'FunctionExpression' && node.id) scope.add(node.id.name);
    node.params.forEach((param) => declareAll(scope, patternNames(param)));
    if (node.body?.type === 'BlockStatement') {
      hoistVars(node.body.body, scope);
      declareBlock(node.body.body, scope);
    }
    scopes.push(scope);
    node.params.forEach(visitPattern);
    visit(node.body?.type === 'BlockStatement' ? node.body.body : node.body);
    scopes.pop();
  };
  const loaderSite = (node, specifierNode) => {
    const specifier = staticString(specifierNode);
    if (specifier !== null) load(specifier, node);
    else computed(node, within.at(-1) || withinName);
  };

  visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    switch (node.type) {
      case 'Identifier':
        if (!declared(node.name)) ref(node.name, null);
        return;
      case 'Literal':
        if (typeof node.value === 'string') string(node.value);
        return;
      case 'TemplateElement':
        if (typeof node.value?.cooked === 'string') string(node.value.cooked);
        return;
      case 'MemberExpression': {
        const member = node.computed ? (isStringLiteral(node.property) ? node.property.value : null) : node.property?.name;
        if (node.object?.type === 'Identifier' && member != null) {
          if (!declared(node.object.name)) ref(node.object.name, member);
        } else visit(node.object);
        if (node.computed) visit(node.property);
        return;
      }
      case 'Property':
        if (node.computed) visit(node.key);
        visit(node.value);
        return;
      case 'MethodDefinition':
      case 'PropertyDefinition':
      case 'AccessorProperty':
        visit(node.decorators);
        if (node.computed) visit(node.key);
        visit(node.value);
        return;
      case 'PrivateIdentifier':
      case 'MetaProperty':
      case 'BreakStatement':
      case 'ContinueStatement':
        return;
      case 'LabeledStatement':
        visit(node.body);
        return;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        const name = node.id?.name || null;
        if (name) within.push(name);
        visitFunction(node);
        if (name) within.pop();
        return;
      }
      case 'ClassDeclaration':
      case 'ClassExpression':
        scopes.push(new Set(node.type === 'ClassExpression' && node.id ? [node.id.name] : []));
        visit(node.decorators);
        visit(node.superClass);
        visit(node.body);
        scopes.pop();
        return;
      case 'VariableDeclarator': {
        visitPattern(node.id);
        const name = node.id?.type === 'Identifier' && FUNCTION_TYPES.has(node.init?.type) ? node.id.name : null;
        if (name) within.push(name);
        visit(node.init);
        if (name) within.pop();
        return;
      }
      case 'BlockStatement':
      case 'StaticBlock': {
        const scope = new Set();
        declareBlock(node.body, scope);
        scopes.push(scope);
        visit(node.body);
        scopes.pop();
        return;
      }
      case 'SwitchStatement': {
        visit(node.discriminant);
        const scope = new Set();
        node.cases.forEach((clause) => declareBlock(clause.consequent, scope));
        scopes.push(scope);
        node.cases.forEach((clause) => {
          visit(clause.test);
          visit(clause.consequent);
        });
        scopes.pop();
        return;
      }
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement': {
        const head = node.type === 'ForStatement' ? node.init : node.left;
        const scope = new Set();
        if (head?.type === 'VariableDeclaration' && head.kind !== 'var') head.declarations.forEach((declarator) => declareAll(scope, patternNames(declarator.id)));
        scopes.push(scope);
        if (node.type === 'ForStatement') {
          visit(node.init);
          visit(node.test);
          visit(node.update);
        } else {
          if (head?.type === 'VariableDeclaration') visit(head);
          else visitTarget(node.left);
          visit(node.right);
        }
        visit(node.body);
        scopes.pop();
        return;
      }
      case 'CatchClause':
        scopes.push(new Set(patternNames(node.param)));
        visitPattern(node.param);
        visit(node.body);
        scopes.pop();
        return;
      case 'AssignmentExpression':
        visitTarget(node.left);
        visit(node.right);
        return;
      case 'ImportExpression':
        loaderSite(node, node.source);
        visit(node.source);
        visit(node.options);
        return;
      case 'CallExpression':
        // Any require(): an ESM file's own `const require = createRequire(...)` loads too.
        if (isRequireCall(node)) loaderSite(node, node.arguments[0]);
        visit(node.callee);
        visit(node.arguments);
        return;
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
        if (isStringLiteral(node.source)) load(node.source.value, node);
        return;
      case 'ExportNamedDeclaration':
        if (isStringLiteral(node.source)) load(node.source.value, node);
        visit(node.declaration);
        if (!node.source) node.specifiers?.forEach((specifier) => visit(specifier.local));
        return;
      default:
        for (const key of Object.keys(node)) if (key !== 'start' && key !== 'end' && key !== 'type') visit(node[key]);
    }
  };

  if (root?.type === 'Program') {
    const scope = new Set();
    hoistVars(root.body, scope);
    declareBlock(root.body, scope);
    root.body.forEach((statement) => {
      if (statement.type === 'ImportDeclaration') statement.specifiers.forEach((specifier) => scope.add(specifier.local.name));
    });
    scopes.push(scope);
    visit(root.body);
  } else visit(root);
};

/* ---------------------------------------------------------------------------
 * Resolving what a file loads.
 * ------------------------------------------------------------------------- */

// Node's resolution of a relative path: the file, the file with an extension,
// or a directory's index. A path to nothing that exists (a file written at
// predeploy) is kept as written, so a change to it still matches. A package
// name is outside the graph: its version is in package.json.
const resolveSpecifier = (fromFile, specifier, source, base = null) => {
  if (base === null && !specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  const target = posix.normalize(base === null ? posix.join(posix.dirname(fromFile), specifier) : posix.join(base, specifier));
  if (target.startsWith('..') || posix.isAbsolute(target)) return null;
  const candidates = [target, ...CODE_EXTENSIONS.map((ext) => `${target}${ext}`), ...['index.js', 'index.mjs', 'index.cjs'].map((name) => posix.join(target, name))];
  return candidates.find((candidate) => source.has(candidate)) || target;
};

/** The literal values of a top-level `const NAME = Object.freeze({ ... })`, a plain object or an array. */
const literalMapValues = (program, name) => {
  for (const statement of program.body) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const declarator of statement.declarations) {
      if (declarator.id?.type !== 'Identifier' || declarator.id.name !== name) continue;
      let init = declarator.init;
      if (init?.type === 'CallExpression' && init.callee?.type === 'MemberExpression'
        && init.callee.object?.name === 'Object' && init.callee.property?.name === 'freeze') [init] = init.arguments;
      const values = init?.type === 'ObjectExpression'
        ? init.properties.map((property) => (property.type === 'Property' ? staticString(property.value) : null))
        : init?.type === 'ArrayExpression' ? init.elements.map(staticString) : null;
      return values?.length && values.every((value) => value !== null) ? values : null;
    }
  }
  return null;
};

/* ---------------------------------------------------------------------------
 * Entry statements.
 * ------------------------------------------------------------------------- */

const isModuleExports = (node) => node?.type === 'MemberExpression' && !node.computed && node.object?.type === 'Identifier'
  && node.object.name === 'module' && node.property?.name === 'exports';

// `exports.NAME = value`, `module.exports.NAME = value` or `module.exports = value`.
const exportAssignment = (statement) => {
  const expression = statement.type === 'ExpressionStatement' ? statement.expression : null;
  if (expression?.type !== 'AssignmentExpression' || expression.operator !== '=') return null;
  const target = expression.left;
  if (isModuleExports(target)) return { name: null, value: expression.right };
  if (target?.type !== 'MemberExpression') return null;
  const member = target.computed ? (isStringLiteral(target.property) ? target.property.value : undefined) : target.property?.name;
  if (member === undefined) return null;
  if ((target.object?.type === 'Identifier' && target.object.name === 'exports') || isModuleExports(target.object)) return { name: member, value: expression.right };
  return null;
};

// `Object.assign(exports, a, b)` or `Object.assign(module.exports, ...)`: its sources.
const mergeIntoExports = (statement) => {
  const call = statement.type === 'ExpressionStatement' ? statement.expression : null;
  if (call?.type !== 'CallExpression' || call.callee?.type !== 'MemberExpression') return null;
  if (call.callee.object?.name !== 'Object' || call.callee.property?.name !== 'assign') return null;
  const [target, ...sources] = call.arguments;
  return (target?.type === 'Identifier' && target.name === 'exports') || isModuleExports(target) ? sources : null;
};

const statementKeyBase = (statement) => {
  if (statement.type === 'FunctionDeclaration' && statement.id) return `function ${statement.id.name}`;
  if (statement.type === 'ClassDeclaration' && statement.id) return `class ${statement.id.name}`;
  if (statement.type === 'VariableDeclaration') return `${statement.kind} ${statement.declarations.flatMap((declarator) => patternNames(declarator.id)).join(',')}`;
  const exported = exportAssignment(statement);
  if (exported) return exported.name === null ? 'module.exports' : `exports.${exported.name}`;
  if (mergeIntoExports(statement)) return 'Object.assign(exports)';
  return 'top-level';
};

// What a top-level `require()` binds: the module, or a member path of it.
const requireBindings = (declarator) => {
  let init = declarator.init;
  const memberPath = [];
  while (init?.type === 'MemberExpression' && !init.computed && init.property?.type === 'Identifier') {
    memberPath.unshift(init.property.name);
    init = init.object;
  }
  if (!isRequireCall(init) || !isStringLiteral(init.arguments[0])) return [];
  const specifier = init.arguments[0].value;
  const out = [];
  const bind = (pattern, at) => {
    if (pattern?.type === 'Identifier') out.push({ name: pattern.name, specifier, path: at, whole: false });
    else if (pattern?.type === 'ObjectPattern') {
      pattern.properties.forEach((property) => {
        if (property.type !== 'RestElement' && !property.computed && property.key?.type === 'Identifier') {
          bind(property.value?.type === 'AssignmentPattern' ? property.value.left : property.value, [...at, property.key.name]);
        } else patternNames(property.type === 'RestElement' ? property.argument : property.value).forEach((name) => out.push({ name, specifier, path: at, whole: true }));
      });
    } else patternNames(pattern).forEach((name) => out.push({ name, specifier, path: at, whole: true }));
  };
  bind(declarator.id, memberPath);
  return out;
};

/**
 * One entry file, statement by statement. Each statement has a key that is
 * the same in every version of the file (`function name`, `const a,b`,
 * `exports.NAME`, `module.exports`, `top-level#3`), so two versions compare by
 * key.
 */
const analyzeEntryText = ({ file, text, source, onComputed = () => [], onString = () => {} }) => {
  const analysis = { file, text, statements: [], byKey: new Map(), byName: new Map(), bindings: new Map(), globals: [], exportOps: [], error: null };
  if (text === null) {
    analysis.error = 'missing';
    return analysis;
  }
  let program;
  try {
    program = parseCode(file, text, source);
  } catch (failure) {
    analysis.error = String(failure?.message || failure).split('\n')[0];
    return analysis;
  }
  analysis.program = program;
  const lineOf = lineIndex(text);
  const counts = new Map();
  for (const statement of program.body) {
    const base = statementKeyBase(statement);
    const seen = (counts.get(base) || 0) + 1;
    counts.set(base, seen);
    const key = seen === 1 && base !== 'top-level' ? base : `${base}#${seen}`;
    const exported = exportAssignment(statement);
    const merged = exported ? null : mergeIntoExports(statement);
    const kind = /^(?:VariableDeclaration|FunctionDeclaration|ClassDeclaration)$/.test(statement.type) ? 'declaration'
      : exported ? 'export' : merged ? 'merge' : 'global';
    const record = { key, kind, line: lineOf(statement.start), names: [], refs: [], loads: [], node: statement, fingerprint: null };
    const bindingInits = [];
    if (statement.type === 'VariableDeclaration') {
      statement.declarations.forEach((declarator) => {
        record.names.push(...patternNames(declarator.id));
        const bindings = requireBindings(declarator);
        bindings.forEach((binding) => analysis.bindings.set(binding.name, { ...binding, key }));
        if (bindings.length) bindingInits.push(declarator.init);
      });
    } else if ((statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') && statement.id) {
      record.names.push(statement.id.name);
    }
    record.names.forEach((name) => analysis.byName.set(name, key));
    // An export's code is its value; a merge's is its sources.
    const code = kind === 'export' ? exported.value : kind === 'merge' ? merged : statement;
    walkCode(code, {
      ref: (name, member) => record.refs.push({ name, member }),
      load: (specifier, node) => {
        const target = resolveSpecifier(file, specifier, source);
        // `const base = require('./entry.js')` binds the module; what is
        // used of it is read where the binding is used.
        if (target) record.loads.push({ target, binding: bindingInits.some((init) => containsNode(init, node)) });
      },
      computed: (node, within) => onComputed(program, lineOf(node.start), node, within)
        .forEach((edge) => record.loads.push({ target: edge.target, binding: false, how: edge.how })),
      string: onString,
    }, { withinName: record.names[0] || null });
    if (kind === 'export') analysis.exportOps.push({ op: exported.name === null ? 'replace' : 'member', name: exported.name, value: exported.value, key });
    if (kind === 'merge') analysis.exportOps.push({ op: 'merge', sources: merged, key });
    if (kind === 'global' && !(statement.type === 'ExpressionStatement' && statement.directive)) analysis.globals.push(key);
    analysis.statements.push(record);
    analysis.byKey.set(key, record);
  }
  return analysis;
};

const statementFingerprint = (record) => {
  if (record.fingerprint === null) record.fingerprint = fingerprint(record.node);
  return record.fingerprint;
};

/* ---------------------------------------------------------------------------
 * The graph.
 * ------------------------------------------------------------------------- */

/**
 * The import graph of one codebase, read from `source`.
 *
 * Nodes are a file (`functions/lib/grading.js`) or, in an entry file, one
 * top-level statement (`functions/index.js#exports.syncGradeToClassroom`).
 * `closure(name)` is everything the export `name` reaches, as a map from each
 * node to the node it was reached from, so a reason can be traced back.
 */
export const buildFunctionsImportGraph = ({ source, codebaseDir = DEFAULT_CODEBASE_DIR, computedLoaders = COMPUTED_LOADERS } = {}) => {
  const uncertain = [];
  const unsure = (why) => {
    if (!uncertain.includes(why)) uncertain.push(why);
  };
  const short = (file) => (file.startsWith(`${codebaseDir}/`) ? file.slice(codebaseDir.length + 1) : file);

  let main = `${codebaseDir}/index.js`;
  try {
    main = posix.normalize(posix.join(codebaseDir, JSON.parse(source.read(`${codebaseDir}/package.json`)).main || 'index.js'));
  } catch {
    unsure(`${codebaseDir}/package.json could not be read, so the entry point is unknown`);
  }

  // Every string the reachable code spells, by file: "could an unreached file be read by name?"
  const strings = new Map();
  const noteString = (file) => (value) => {
    if (!strings.has(file)) strings.set(file, new Set());
    if (value && value.length <= 300) strings.get(file).add(value);
  };

  const computedSite = (file) => (program, line, node, within) => {
    const known = computedLoaders.find((loader) => loader.file === file && loader.within === within && mentions(node, loader.map));
    if (!known) {
      unsure(`${short(file)}:${line} loads a computed path${within ? ` in ${within}` : ''}, so the graph cannot tell which files it loads`);
      return [];
    }
    const values = literalMapValues(program, known.map);
    if (!values) {
      unsure(`${short(file)}:${line}: ${known.map} is no longer a map of literal paths, so ${known.describe} cannot be followed`);
      return [];
    }
    return values.map((value) => ({
      target: resolveSpecifier(file, value, source, known.relativeTo === 'repository' ? '' : posix.dirname(file)),
      how: known.describe,
    })).filter((edge) => edge.target);
  };

  /* -- Modules: one node per file. -------------------------------------- */
  const modules = new Map();
  const moduleEdges = (file) => {
    if (modules.has(file)) return modules.get(file);
    const edges = [];
    modules.set(file, edges);
    if (!CODE_FILE.test(file)) return edges;
    const text = source.read(file);
    if (text === null) return edges;
    let program;
    try {
      program = parseCode(file, text, source);
    } catch (failure) {
      unsure(`${short(file)} could not be parsed (${String(failure?.message || failure).split('\n')[0]})`);
      return edges;
    }
    const lineOf = lineIndex(text);
    const onComputed = computedSite(file);
    walkCode(program, {
      load: (specifier) => {
        const target = resolveSpecifier(file, specifier, source);
        if (target) edges.push(target);
      },
      computed: (node, within) => onComputed(program, lineOf(node.start), node, within).forEach((edge) => edges.push(edge.target)),
      string: noteString(file),
    });
    return edges;
  };

  /* -- Entry files: one node per top-level statement. -------------------- */
  const analyses = new Map();
  const analyzeEntry = (file) => {
    if (!analyses.has(file)) {
      const analysis = analyzeEntryText({ file, text: source.read(file), source, onComputed: computedSite(file), onString: noteString(file) });
      if (analysis.error) unsure(analysis.error === 'missing' ? `${short(file)} is missing` : `${short(file)} could not be parsed (${analysis.error})`);
      analyses.set(file, analysis);
    }
    return analyses.get(file);
  };

  /* -- Export tables: which node each exported name is. ------------------ */
  // A table maps a name to { node } (a statement) or { table } (an object of
  // them, like classroomSectionEntry's cloudFunctions). A file whose table is
  // read is an entry file.
  const entryFiles = new Set();
  const tables = new Map();
  const inProgress = new Set();
  const nodeId = (file, key) => `${file}#${key}`;
  const lookup = (table, memberPath) => {
    let value = { table };
    for (const member of memberPath) {
      if (!value?.table) return null;
      value = value.table.get(member) || null;
    }
    return value;
  };
  const mergeTable = (into, from) => from.forEach((value, name) => into.set(name, value));
  let exportTableOf = null;

  // A value exported: a merge source, `module.exports = ...`, or a property of it.
  const tableFromValue = (analysis, value, key) => {
    const { file } = analysis;
    const where = () => `${short(file)}:${lineIndex(analysis.text || '')(value?.start ?? 0)}`;
    if (value?.type === 'Identifier') {
      const binding = analysis.bindings.get(value.name);
      if (binding && !binding.whole) {
        const target = resolveSpecifier(file, binding.specifier, source);
        const found = target ? lookup(exportTableOf(target), binding.path) : null;
        if (found?.table) return found.table;
      } else {
        const declaredKey = analysis.byName.get(value.name);
        const init = declaredKey && analysis.byKey.get(declaredKey).node.declarations
          ?.find((declarator) => declarator.id?.type === 'Identifier' && declarator.id.name === value.name)?.init;
        if (init?.type === 'ObjectExpression') return tableFromValue(analysis, init, declaredKey);
      }
    } else if (value?.type === 'ObjectExpression') {
      const table = new Map();
      for (const property of value.properties) {
        if (property.type === 'SpreadElement') {
          mergeTable(table, tableFromValue(analysis, property.argument, key));
          continue;
        }
        const name = property.computed ? (isStringLiteral(property.key) ? property.key.value : null) : (property.key?.name ?? property.key?.value);
        if (name == null) {
          unsure(`${where()} exports a name the graph cannot read`);
          continue;
        }
        const propertyValue = property.value;
        const binding = propertyValue?.type === 'Identifier' ? analysis.bindings.get(propertyValue.name) : null;
        if (propertyValue?.type === 'ObjectExpression') table.set(name, { table: tableFromValue(analysis, propertyValue, key) });
        else if (binding && !binding.whole) {
          const target = resolveSpecifier(file, binding.specifier, source);
          table.set(name, (target && lookup(exportTableOf(target), binding.path)) || { node: nodeId(file, binding.key) });
        } else if (propertyValue?.type === 'Identifier' && analysis.byName.has(propertyValue.name)) {
          table.set(name, { node: nodeId(file, analysis.byName.get(propertyValue.name)) });
        } else table.set(name, { node: nodeId(file, key) });
      }
      return table;
    } else if (isRequireCall(value) && isStringLiteral(value.arguments[0])) {
      const target = resolveSpecifier(file, value.arguments[0].value, source);
      if (target) return exportTableOf(target);
    }
    unsure(`${where()} exports something the graph cannot follow`);
    return new Map();
  };

  exportTableOf = (file) => {
    if (tables.has(file)) return tables.get(file);
    if (inProgress.has(file)) {
      unsure(`${short(file)} re-exports itself`);
      return new Map();
    }
    inProgress.add(file);
    entryFiles.add(file);
    const analysis = analyzeEntry(file);
    let table = new Map();
    for (const op of analysis.exportOps) {
      if (op.op === 'member') table.set(op.name, { node: nodeId(file, op.key) });
      else if (op.op === 'merge') op.sources.forEach((value) => mergeTable(table, tableFromValue(analysis, value, op.key)));
      else table = tableFromValue(analysis, op.value, op.key);
    }
    inProgress.delete(file);
    tables.set(file, table);
    return table;
  };

  const mainTable = exportTableOf(main);
  const flatten = (table, out = []) => {
    table.forEach((value) => {
      if (value.node) out.push(value.node);
      else if (value.table) flatten(value.table, out);
    });
    return out;
  };
  const exportNames = [...mainTable.entries()].filter(([, value]) => value.node).map(([name]) => name).sort();
  const isEntry = (file) => entryFiles.has(file);

  /* -- Edges. ------------------------------------------------------------- */
  const splitNode = (node) => {
    const hash = node.indexOf('#');
    return hash === -1 ? { file: node, key: null } : { file: node.slice(0, hash), key: node.slice(hash + 1) };
  };
  // An entry file used as a whole value: every export it has.
  const wholeEntry = (file) => flatten(exportTableOf(file));
  const membersOf = (target, memberPath) => {
    const found = memberPath ? lookup(exportTableOf(target), memberPath) : null;
    if (found?.node) return [found.node];
    if (found?.table) return flatten(found.table);
    return wholeEntry(target);
  };

  const edgeCache = new Map();
  const edgesOf = (node) => {
    if (edgeCache.has(node)) return edgeCache.get(node);
    const { file, key } = splitNode(node);
    let out = [];
    if (key === null) {
      out = isEntry(file) ? wholeEntry(file) : moduleEdges(file).flatMap((target) => (isEntry(target) ? wholeEntry(target) : [target]));
    } else {
      const analysis = analyzeEntry(file);
      const record = analysis.byKey.get(key);
      for (const { name, member } of record?.refs || []) {
        if (name === 'exports') {
          // Another export of this file, read as `exports.other`.
          out.push(...membersOf(file, member ? [member] : null));
          continue;
        }
        if (name === 'module') {
          if (member === 'exports') out.push(...wholeEntry(file));
          continue;
        }
        const declaredKey = analysis.byName.get(name);
        if (!declaredKey) continue;
        out.push(nodeId(file, declaredKey));
        const binding = analysis.bindings.get(name);
        const target = binding ? resolveSpecifier(file, binding.specifier, source) : null;
        if (target && isEntry(target)) out.push(...membersOf(target, binding.whole ? null : [...binding.path, ...(member ? [member] : [])]));
      }
      for (const load of record?.loads || []) {
        if (!isEntry(load.target)) out.push(load.target);
        else if (!load.binding) out.push(...wholeEntry(load.target));
      }
    }
    out = [...new Set(out)];
    edgeCache.set(node, out);
    return out;
  };

  const walkFrom = (starts, stopAt = null) => {
    const seen = new Map();
    const queue = [];
    starts.forEach((start) => {
      if (!seen.has(start)) {
        seen.set(start, { from: null });
        queue.push(start);
      }
    });
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      if (stopAt?.has(current) && seen.get(current).from !== null) continue;
      for (const next of edgesOf(current)) {
        if (seen.has(next)) continue;
        seen.set(next, { from: current });
        queue.push(next);
      }
    }
    return seen;
  };

  // Top-level statements of every entry file run in every function.
  let globalClosure = null;
  const globals = () => {
    if (!globalClosure) {
      globalClosure = walkFrom([...entryFiles].flatMap((file) => analyzeEntry(file).globals.map((key) => nodeId(file, key))));
    }
    return globalClosure;
  };

  // What one export reaches, besides what every function reaches.
  const closures = new Map();
  const closure = (name) => {
    const found = mainTable.get(name);
    if (!found?.node) return null;
    if (!closures.has(name)) closures.set(name, walkFrom([found.node], globals()));
    return closures.get(name);
  };

  const label = (node) => {
    const { file, key } = splitNode(node);
    if (key === null) return short(file);
    const record = analyses.get(file)?.byKey.get(key);
    const where = short(file);
    if (!record) return `${key} in ${where}`;
    if (record.kind === 'global') return `the top-level code of ${where} (line ${record.line})`;
    if (record.kind !== 'declaration') return `${key.replace(/#\d+$/, '')} in ${where}`;
    const names = record.names.length > 3 ? `${record.names.slice(0, 3).join(', ')}, ...` : record.names.join(', ');
    return `${names}${record.node.type === 'FunctionDeclaration' ? '()' : ''} in ${where}`;
  };

  return {
    main,
    codebaseDir,
    source,
    uncertain,
    exportNames,
    entryFiles: () => [...entryFiles],
    isEntry,
    exportNode: (name) => mainTable.get(name)?.node || null,
    closure,
    globalClosure: globals,
    entryAnalysis: analyzeEntry,
    label,
    short,
    strings: () => strings,
    nodeId,
    splitNode,
  };
};

/* ---------------------------------------------------------------------------
 * From a change to the functions it reaches.
 * ------------------------------------------------------------------------- */

const pathTo = (reach, node) => {
  const chain = [];
  for (let at = node; at != null; at = reach.get(at)?.from ?? null) chain.unshift(at);
  return chain;
};

const via = (graph, chain) => {
  const steps = chain.map((node) => graph.label(node));
  return steps.length > 5 ? [...steps.slice(0, 2), '...', ...steps.slice(-2)].join(' → ') : steps.join(' → ');
};

/**
 * Which of `inventory` a change reaches.
 *
 *   changes   [{ file, before, after }]: the files the diff changed that map to
 *             the functions target, with their text at the base (null: added)
 *             and at the head (null: deleted)
 *   graph     buildFunctionsImportGraph of the head
 *   inventory the deployable function names (functionsInventory.mjs)
 *
 * Returns { all: [why], functions: [name], reasons: { name: why }, notes: [why] }.
 * A non-empty `all` means the graph cannot be sure: deploy every function.
 * Otherwise `functions` is the set to deploy, possibly empty.
 */
export const selectFunctionsForChange = ({ graph, changes = [], inventory = graph.exportNames, firebaseJson = null } = {}) => {
  const all = [];
  const notes = [];
  const say = (list, why) => {
    if (!list.includes(why)) list.push(why);
  };
  const { codebaseDir, source } = graph;
  const short = graph.short;
  const changed = new Map(); // node -> 'changed' | 'added'
  const predeploy = new Set(predeployScripts(firebaseJson ?? source.read('firebase.json') ?? '{}'));

  const entryChanges = [];
  for (const { file, before = null, after = null } of changes) {
    const inCodebase = file.startsWith(`${codebaseDir}/`);
    if ([`${codebaseDir}/package.json`, `${codebaseDir}/package-lock.json`, `${codebaseDir}/npm-shrinkwrap.json`].includes(file)) {
      say(all, `${file} changed: every function runs on the codebase's entry point and dependencies`);
    } else if (file === 'firebase.json') {
      if (firebaseFunctionsSettingsChanged(before, after, ['default']).default) say(all, 'firebase.json\'s settings for the default codebase changed: they decide what every function uploads and runs');
      else say(notes, 'firebase.json: the default codebase\'s settings are unchanged');
    } else if (predeploy.has(file)) {
      say(all, `${file} runs at the default codebase's predeploy and writes into what every function uploads`);
    } else if (inCodebase && /(^|\/)\.env(\.|$)/.test(short(file)) && !file.endsWith('.example')) {
      say(all, `${file} changed: environment files reach every function`);
    } else if (inCodebase && NOT_RUNTIME.some((pattern) => pattern.test(file))) {
      say(notes, `${short(file)}: not loaded by the deployed code`);
    } else if (after === null) {
      say(notes, `${short(file)} was deleted: whatever loaded it changed too`);
    } else if (graph.isEntry(file)) {
      entryChanges.push({ file, before, after });
    } else if (before !== null && !codeChanged(file, before, after, { source })) {
      say(notes, `${short(file)}: only comments or formatting changed`);
    } else {
      changed.set(file, before === null ? 'added' : 'changed');
    }
  }

  // Entry files: compare statement by statement.
  const newlyExported = new Map();
  if (entryChanges.length) {
    const overrides = Object.fromEntries(changes.map((change) => [change.file, change.before ?? null]));
    let old = null;
    try {
      old = buildFunctionsImportGraph({ source: overlaySource(source, overrides), codebaseDir });
    } catch (error) {
      say(all, `the entry files before this change could not be read (${error.message})`);
    }
    for (const { file } of entryChanges) {
      const now = graph.entryAnalysis(file);
      const then = old?.entryAnalysis(file);
      if (!then || then.error) {
        if (then?.error && then.error !== 'missing') say(all, `${short(file)} before this change could not be parsed (${then.error})`);
      }
      const thenByKey = then?.byKey || new Map();
      const globalsOf = (analysis) => (analysis?.globals || []).map((key) => statementFingerprint(analysis.byKey.get(key)));
      const nowGlobals = globalsOf(now);
      const thenGlobals = globalsOf(then);
      if (nowGlobals.join('\n') !== thenGlobals.join('\n')) {
        const index = nowGlobals.findIndex((print, at) => print !== thenGlobals[at]);
        const record = now.byKey.get(now.globals[index === -1 ? nowGlobals.length - 1 : index]);
        say(all, `a top-level statement of ${short(file)} changed${record ? ` (line ${record.line})` : ''}, and every function runs it`);
      }
      for (const record of now.statements) {
        if (record.kind === 'global' || record.kind === 'merge') continue;
        const before = thenByKey.get(record.key);
        if (!before || statementFingerprint(before) !== statementFingerprint(record)) changed.set(graph.nodeId(file, record.key), before ? 'changed' : 'added');
      }
    }
    // A name exported now that was not, or that is another declaration now.
    if (old) {
      inventory.forEach((name) => {
        const now = graph.exportNode(name);
        const then = old.exportNode(name);
        if (!now) return;
        if (!then) newlyExported.set(name, `is newly exported (${graph.label(now)})`);
        else if (then !== now) newlyExported.set(name, `is now ${graph.label(now)}, not ${old.label(then)}`);
      });
    }
  }

  // What every function reaches.
  const everyone = graph.globalClosure();
  for (const [node, how] of changed) {
    if (!everyone.has(node)) continue;
    const chain = pathTo(everyone, node);
    say(all, `${graph.label(node)} ${how === 'added' ? 'is new' : 'changed'}, and every function loads it (${via(graph, chain)})`);
  }

  // What each function reaches.
  const reasons = {};
  const reached = new Set(everyone.keys());
  const missing = inventory.filter((name) => !graph.exportNode(name));
  if (missing.length) say(all, `the graph does not find ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''} in the exports of ${short(graph.main)}`);
  for (const name of inventory) {
    const reach = graph.closure(name);
    if (!reach) continue;
    reach.forEach((_, node) => reached.add(node));
    const hits = [...changed.keys()].filter((node) => reach.has(node) && !everyone.has(node));
    if (!hits.length) {
      if (newlyExported.has(name)) reasons[name] = newlyExported.get(name);
      continue;
    }
    // The nearest change explains it best.
    hits.sort((left, right) => pathTo(reach, left).length - pathTo(reach, right).length);
    const [first] = hits;
    const chain = pathTo(reach, first);
    const middle = chain.slice(1, -1);
    const how = changed.get(first);
    const more = hits.length > 1 ? ` (and ${hits.length - 1} more change${hits.length === 2 ? '' : 's'} it reaches)` : '';
    let why;
    if (graph.splitNode(first).key === null) {
      why = `imports ${short(first)}${how === 'added' ? ' (new)' : ''}${middle.length ? ` via ${via(graph, middle)}` : ' directly'}`;
    } else if (chain.length === 1) {
      why = how === 'added' ? `is new in ${short(graph.splitNode(first).file)}` : `its own code in ${short(graph.splitNode(first).file)} changed`;
    } else {
      why = `uses ${graph.label(first)}, which ${how === 'added' ? 'is new' : 'changed'}${middle.length ? `, via ${via(graph, middle)}` : ''}`;
    }
    reasons[name] = `${why}${more}`;
  }

  // A changed file no function reaches.
  const spelled = new Map();
  graph.strings().forEach((values, file) => values.forEach((value) => {
    const last = value.split('/').pop();
    if (!spelled.has(last)) spelled.set(last, file);
  }));
  for (const [node, how] of changed) {
    if (reached.has(node)) continue;
    const { file, key } = graph.splitNode(node);
    if (key !== null) {
      say(notes, `${graph.label(node)} ${how === 'added' ? 'is new' : 'changed'}, and no function uses it`);
      continue;
    }
    const base = posix.basename(file);
    const stem = base.replace(/\.[^.]+$/, '');
    const spelledIn = spelled.get(base) || spelled.get(stem);
    if (!CODE_FILE.test(file) && file.startsWith(`${codebaseDir}/`)) {
      say(all, `${short(file)} is a data file no function loads by import, and the functions code reads files by name${spelledIn ? ` (its name is in ${short(spelledIn)})` : ''}`);
    } else if (spelledIn) {
      say(all, `${short(file)} is loaded by no function the graph can see, but its name is spelled in ${short(spelledIn)}, so it may be loaded by name`);
    } else if (!file.startsWith(`${codebaseDir}/`)) {
      say(all, `${file} maps to the functions target, but the graph finds no function that loads it`);
    } else {
      say(notes, `${short(file)}: no function loads it`);
    }
  }

  graph.uncertain.forEach((why) => say(all, why));
  const functions = all.length ? [] : Object.keys(reasons).sort();
  return {
    all,
    functions,
    reasons: all.length ? {} : reasons,
    notes,
  };
};

/* ---------------------------------------------------------------------------
 * node scripts/lib/functionsImportGraph.mjs <base> [<head>] [--json]
 * ------------------------------------------------------------------------- */

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const [base, head = 'HEAD'] = args.filter((arg) => !arg.startsWith('--'));
  if (!base) {
    console.error('usage: node scripts/lib/functionsImportGraph.mjs <base> [<head>] [--json]');
    process.exit(2);
  }
  const { listDeployableFunctions } = await import('./functionsInventory.mjs');
  const headSource = gitSource(repoRoot, head);
  const baseSource = gitSource(repoRoot, base, { prefetch: [] });
  const changedFiles = spawnSync('git', ['diff', '--name-only', `${baseSource.commit}..${headSource.commit}`], { cwd: repoRoot, encoding: 'utf8' })
    .stdout.split('\n').filter(Boolean);
  const settings = firebaseFunctionsSettingsChanged(baseSource.read('firebase.json'), headSource.read('firebase.json'));
  const { reasons: byTarget } = classifyChangedFiles(changedFiles, { functionsSettings: settings });
  const functionsFiles = byTarget[RELEASE_TARGETS.FUNCTIONS] || [];
  // Which of the head's exports are functions, as this checkout's inventory
  // says (only loading the code tells an endpoint from a helper). A function
  // the head had that has been removed since is left out.
  const graph = buildFunctionsImportGraph({ source: headSource });
  const today = new Set(listDeployableFunctions().functions.map((fn) => fn.name));
  const inventory = graph.exportNames.filter((name) => today.has(name));
  const selection = functionsFiles.length
    ? selectFunctionsForChange({
      graph,
      changes: functionsFiles.map((file) => ({ file, before: baseSource.read(file), after: headSource.read(file) })),
      inventory,
    })
    : { all: [], functions: [], reasons: {}, notes: [] };
  if (args.includes('--json')) {
    console.log(JSON.stringify({ base: baseSource.commit, head: headSource.commit, changedFiles: changedFiles.length, functionsFiles, ...selection, total: inventory.length }, null, 2));
  } else {
    console.log(`${baseSource.commit.slice(0, 12)}..${headSource.commit.slice(0, 12)}: ${changedFiles.length} changed file(s), ${functionsFiles.length} for the functions target`);
    if (!functionsFiles.length) console.log('Functions: none. No file this range changed maps to the functions target.');
    functionSelectionLines({ selection, total: inventory.length, mode: functionsFiles.length ? 'graph' : 'none' }).forEach((line) => console.log(line));
  }
}
