/*
 * THE ORDER APP'S HOOKS RUN IN, WHEREVER THEIR CODE SITS.
 *
 * App.jsx is being split into hooks under src/app/** that App calls where the
 * code used to be. State stays in App's fiber, so renders and batching cannot
 * change. Effect order can: gathering scattered effects into one hook moves
 * them to that hook's call site, and React runs effects in call order.
 *
 * This reads a component, follows every hook it calls into the module that
 * declares it (any relative import), and lists each built-in hook call in the
 * order React sees it, with a hash of its code. Two ledgers taken before and
 * after a move then say exactly what the move did:
 *
 *   same hashes, same order         nothing React can see changed
 *   an effect at a new position     listed, with the effects it passed
 *   a hash on one side only         the code itself changed
 *
 * Hashes ignore whitespace and comments between tokens (never inside a string,
 * template or regular expression), so a re-indented move is the same code, and read a dynamic import's relative path as the file it names. They do not ignore names: a renamed variable is a change to look at.
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { posix } from 'node:path';

const require = createRequire(import.meta.url);

const BUILT_IN = new Set([
  'useState', 'useReducer', 'useRef', 'useMemo', 'useCallback', 'useEffect', 'useLayoutEffect',
  'useInsertionEffect', 'useContext', 'useId', 'useSyncExternalStore', 'useTransition',
  'useDeferredValue', 'useImperativeHandle', 'useDebugValue',
]);
export const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
const RESOLVE_SUFFIXES = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx'];
const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

const children = (node) => {
  const found = [];
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) { for (const item of value) if (item && typeof item.type === 'string') found.push(item); }
    else if (value && typeof value.type === 'string') found.push(value);
  }
  return found;
};

/** Source with comments and all whitespace removed: what a verbatim move keeps. */
export const normalizeCode = (source, comments = []) => {
  let text = '';
  let at = 0;
  for (const comment of comments) { text += source.slice(at, comment.start); at = comment.end; }
  return (text + source.slice(at)).replace(/\s+/g, '');
};

const hashOf = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);

/**
 * @param {(path: string) => string | null} read  repo-relative path -> source, or null when absent
 */
export const createHookLedger = (read) => {
  const modules = new Map();

  const load = (path) => {
    if (modules.has(path)) return modules.get(path);
    const source = read(path);
    if (source == null) { modules.set(path, null); return null; }
    const result = require('vite').parseSync(path, source, { lang: path.endsWith('.jsx') ? 'jsx' : 'js', sourceType: 'module' });
    if (result.errors?.length) throw new Error(`${path}: ${result.errors[0].message}`);
    const program = result.program;
    const comments = (result.comments || []).slice().sort((a, b) => a.start - b.start);
    const lineStarts = [0];
    for (let index = 0; index < source.length; index += 1) if (source[index] === '\n') lineStarts.push(index + 1);
    const lineOf = (position) => {
      let low = 0; let high = lineStarts.length - 1;
      while (low < high) { const mid = (low + high + 1) >> 1; if (lineStarts[mid] <= position) low = mid; else high = mid - 1; }
      return low + 1;
    };
    const imports = new Map();
    const functions = new Map();
    const exported = new Map();
    const declare = (node) => {
      if (node.type === 'FunctionDeclaration' && node.id) functions.set(node.id.name, node);
      if (node.type === 'VariableDeclaration') {
        for (const declarator of node.declarations) {
          if (declarator.id.type === 'Identifier' && declarator.init && FUNCTION_TYPES.has(declarator.init.type)) functions.set(declarator.id.name, declarator.init);
        }
      }
    };
    for (const node of program.body) {
      if (node.type === 'ImportDeclaration') {
        for (const specifier of node.specifiers) {
          imports.set(specifier.local.name, {
            from: node.source.value,
            name: specifier.type === 'ImportDefaultSpecifier' ? 'default' : specifier.type === 'ImportSpecifier' ? specifier.imported.name : '*',
          });
        }
      } else if (node.type === 'ExportNamedDeclaration') {
        if (node.declaration) {
          declare(node.declaration);
          if (node.declaration.id) exported.set(node.declaration.id.name, node.declaration.id.name);
          for (const declarator of node.declaration.declarations || []) if (declarator.id.type === 'Identifier') exported.set(declarator.id.name, declarator.id.name);
        }
        for (const specifier of node.specifiers || []) {
          if (node.source) imports.set(`export:${specifier.exported.name}`, { from: node.source.value, name: specifier.local.name });
          exported.set(specifier.exported.name, node.source ? `export:${specifier.exported.name}` : specifier.local.name);
        }
      } else if (node.type === 'ExportDefaultDeclaration') {
        if (FUNCTION_TYPES.has(node.declaration.type)) { functions.set('default', node.declaration); if (node.declaration.id) functions.set(node.declaration.id.name, node.declaration); exported.set('default', 'default'); }
        else if (node.declaration.type === 'Identifier') exported.set('default', node.declaration.name);
      } else declare(node);
    }
    const loaded = { path, source, comments, lineOf, imports, functions, exported };
    modules.set(path, loaded);
    return loaded;
  };

  const resolvePath = (fromPath, specifier) => {
    if (!specifier.startsWith('.')) return null;
    const base = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
    for (const suffix of RESOLVE_SUFFIXES) if (load(base + suffix)) return base + suffix;
    return null;
  };

  /** The function a local name stands for, following imports and re-exports. */
  const resolveFunction = (module, localName, seen = new Set()) => {
    const key = `${module.path}#${localName}`;
    if (seen.has(key)) return null;
    seen.add(key);
    if (module.functions.has(localName)) return { module, node: module.functions.get(localName) };
    const imported = module.imports.get(localName);
    if (!imported) return null;
    const target = resolvePath(module.path, imported.from);
    if (!target) return null;
    const targetModule = load(target);
    const inner = targetModule.exported.get(imported.name);
    return inner ? resolveFunction(targetModule, inner, seen) : null;
  };

  // A dynamic import's path is relative to the file it is written in, so a moved
  // `import('./x.js')` has to be rewritten. Compared as the file it names.
  const relativeImports = (node, found = []) => {
    const literal = node.type === 'ImportExpression' ? node.source
      : node.type === 'NewExpression' && node.callee.type === 'Identifier' && node.callee.name === 'URL' ? node.arguments[0] : null;
    if (literal?.type === 'Literal' && typeof literal.value === 'string' && literal.value.startsWith('.')) found.push(literal);
    for (const child of children(node)) relativeImports(child, found);
    return found;
  };

  // Text whose spaces are part of what the code does: strings, template text, regular expressions.
  const literalSpans = (node, found = []) => {
    if (node.type === 'TemplateElement' || (node.type === 'Literal' && (typeof node.value === 'string' || node.regex)) || node.type === 'JSXText') found.push(node);
    for (const child of children(node)) literalSpans(child, found);
    return found;
  };

  const codeOf = (module, node) => {
    const comments = module.comments.filter((comment) => comment.start >= node.start && comment.end <= node.end);
    const reAimed = new Map(relativeImports(node).map((literal) => [literal, posix.normalize(posix.join(posix.dirname(module.path), literal.value))]));
    // Whitespace and comments go from the code between literals; a literal is kept as written.
    const kept = literalSpans(node).sort((left, right) => left.start - right.start);
    let text = '';
    let at = node.start;
    const between = (from, to) => normalizeCode(
      module.source.slice(from, to),
      comments.filter((comment) => comment.start >= from && comment.end <= to).map((comment) => ({ start: comment.start - from, end: comment.end - from })),
    );
    for (const literal of kept) {
      if (literal.start < at) continue;
      text += between(at, literal.start);
      text += reAimed.has(literal) ? `'${reAimed.get(literal)}'` : module.source.slice(literal.start, literal.end);
      at = literal.end;
    }
    return text + between(at, node.end);
  };

  const hookName = (call) => {
    const callee = call.callee;
    if (callee.type === 'Identifier') return /^use[A-Z0-9]/.test(callee.name) ? callee.name : null;
    if (callee.type === 'MemberExpression' && !callee.computed && callee.object.type === 'Identifier' && callee.object.name === 'React' && /^use[A-Z0-9]/.test(callee.property.name)) return callee.property.name;
    return null;
  };

  /** Hook calls in a function's own body, in source order; nested functions are not entered. */
  const hookCallsIn = (body) => {
    const calls = [];
    const visit = (node) => {
      if (FUNCTION_TYPES.has(node.type)) return;
      if (node.type === 'CallExpression') {
        const name = hookName(node);
        // Arguments are evaluated before the call, so a hook inside them runs first.
        for (const child of children(node)) visit(child);
        if (name) calls.push({ name, node });
        return;
      }
      for (const child of children(node)) visit(child);
    };
    visit(body);
    return calls;
  };

  const declaredNames = (pattern, names = []) => {
    if (!pattern) return names;
    if (pattern.type === 'Identifier') names.push(pattern.name);
    else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((element) => declaredNames(element, names));
    else if (pattern.type === 'ObjectPattern') pattern.properties.forEach((property) => declaredNames(property.type === 'RestElement' ? property.argument : property.value, names));
    else if (pattern.type === 'AssignmentPattern') declaredNames(pattern.left, names);
    else if (pattern.type === 'RestElement') declaredNames(pattern.argument, names);
    return names;
  };

  const walk = (module, fn, via, entries, stack) => {
    const body = fn.body;
    // The name a hook's result is bound to, where its statement is a plain declaration.
    const boundAs = new Map();
    for (const statement of body.body || []) {
      if (statement.type !== 'VariableDeclaration') continue;
      for (const declarator of statement.declarations) if (declarator.init?.type === 'CallExpression') boundAs.set(declarator.init, declaredNames(declarator.id).join(','));
    }
    for (const { name, node } of hookCallsIn(body)) {
      const label = boundAs.get(node) || '';
      const local = node.callee.type === 'Identifier' ? node.callee.name : name;
      const custom = BUILT_IN.has(name) ? null : resolveFunction(module, local);
      if (custom && !stack.includes(custom.node)) {
        walk(custom.module, custom.node, [...via, name], entries, [...stack, custom.node]);
        continue;
      }
      entries.push({
        hook: name,
        name: label,
        hash: hashOf(codeOf(module, node)),
        file: module.path,
        line: module.lineOf(node.start),
        via,
        opaque: !BUILT_IN.has(name),
      });
    }
  };

  return {
    /** Every hook the component runs, in React's order. */
    ledger(path, componentName) {
      const module = load(path);
      if (!module) throw new Error(`${path} cannot be read`);
      const component = resolveFunction(module, componentName);
      if (!component) throw new Error(`${path} declares no function ${componentName}`);
      const entries = [];
      walk(component.module, component.node, [], entries, [component.node]);
      return entries;
    },
  };
};

const lcsPairs = (before, after) => {
  const rows = before.length; const columns = after.length;
  const table = Array.from({ length: rows + 1 }, () => new Uint16Array(columns + 1));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = columns - 1; j >= 0; j -= 1) table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const pairs = [];
  for (let i = 0, j = 0; i < rows && j < columns;) {
    if (before[i] === after[j]) { pairs.push([i, j]); i += 1; j += 1; }
    else if (table[i + 1][j] >= table[i][j + 1]) i += 1; else j += 1;
  }
  return pairs;
};

/**
 * What a change did to the hooks React runs.
 *
 * `effects` compares only the effect hooks, whose order is behaviour: `moved`
 * are effects whose code is unchanged but which now run before or after
 * different effects, each with the effects it crossed. `hooks` compares every
 * hook call, whose order is only identity (state slots).
 */
export const compareLedgers = (before, after) => {
  const compare = (left, right) => {
    const key = (entry) => `${entry.hook}:${entry.hash}`;
    const leftKeys = left.map(key); const rightKeys = right.map(key);
    const pairs = lcsPairs(leftKeys, rightKeys);
    const keptLeft = new Set(pairs.map(([i]) => i)); const keptRight = new Set(pairs.map(([, j]) => j));
    const looseLeft = left.map((entry, index) => ({ entry, index })).filter(({ index }) => !keptLeft.has(index));
    const looseRight = right.map((entry, index) => ({ entry, index })).filter(({ index }) => !keptRight.has(index));
    const moved = []; const removed = [];
    const unclaimed = [...looseRight];
    for (const item of looseLeft) {
      const match = unclaimed.findIndex((candidate) => key(candidate.entry) === key(item.entry));
      if (match === -1) { removed.push(item.entry); continue; }
      const [target] = unclaimed.splice(match, 1);
      // The kept hooks it used to run after and now runs before, or the reverse.
      const crossed = pairs.filter(([i, j]) => (i < item.index) !== (j < target.index)).map(([, j]) => right[j]);
      moved.push({ before: item.entry, after: target.entry, crossed });
    }
    return { same: looseLeft.length === 0 && looseRight.length === 0, moved, removed, added: unclaimed.map(({ entry }) => entry) };
  };
  const effectsOf = (entries) => entries.filter((entry) => EFFECT_HOOKS.has(entry.hook));
  return { effects: compare(effectsOf(before), effectsOf(after)), hooks: compare(before, after) };
};

export const describeEntry = (entry) => `${entry.hook}${entry.name ? ` ${entry.name}` : ''} (${entry.file}:${entry.line}${entry.via.length ? `, in ${entry.via.join(' > ')}` : ''})`;
