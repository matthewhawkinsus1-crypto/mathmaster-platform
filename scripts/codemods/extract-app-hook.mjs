#!/usr/bin/env node
/*
 * MOVE STATEMENTS OF A COMPONENT INTO A HOOK IT CALLS, VERBATIM.
 *
 *   node scripts/codemods/extract-app-hook.mjs <spec.json> [--dry-run] [--defer-imports]
 *   node scripts/codemods/extract-app-hook.mjs --settle-imports [source]
 *
 * spec: {
 *   "source": "src/App.jsx", "component": "App",
 *   "hook": "useSchoolClock", "file": "src/app/shell/useSchoolClock.js",
 *   "header": "comment text for the top of the new module",
 *   "statements": ["now", "L2107", "L2117-L2160", "~setInterval(() => setNow"],
 *       // a name a statement declares, the line a statement starts on, a range of
 *       // lines, or text exactly one statement contains
 *   "callAt": "first" | "last" | "<selector>"        // where the hook is called (default first)
 *   "callAfter": "<selector>"
 *       // optional, instead of callAt: call below a statement that stays, further down
 *       // than everything moved (for functions that read something declared late).
 *       // Refused when a moved statement calls a hook.
 *   "positional": true
 *       // optional: pass the inputs as plain arguments and return one array, so the
 *       // seam leaves no property names in the bundle (a test must then hold the
 *       // two sides to the same names in the same order)
 *   "from": { "object": "teacherKit", "fallback": "NO_TEACHER_CONTROLS" }
 *       // optional: the function is not imported by the source but reached through
 *       // an object of the component's scope that may not be there yet, as
 *       // `teacherKit ? teacherKit.createX({…}) : NO_TEACHER_CONTROLS`. The object's
 *       // module must export it (the tool does not edit that module), and the
 *       // statements may not call a hook.
 * }
 *
 * The statements' text, with the comments above each, is moved unchanged (but
 * for the path of a dynamic import, which is relative to its file). What
 * the tool works out is the seam:
 *
 *   inputs   every name of the component's scope the statements read, passed by name
 *   outputs  every name they declare that the rest of the component reads, returned by name
 *   imports  every module-scope name they use, imported in the new module;
 *            the source's imports nothing uses any more are removed
 *
 * and it refuses a move that could not behave the same:
 *
 *   - an input declared after the call site (the argument would be read in its dead zone);
 *   - an output read during render by a statement above the call site;
 *   - a statement that assigns to a variable of the component's scope;
 *   - a module-scope name that is not an import (the new module could not reach it).
 *
 * Effect order is not checked here: run scripts/app-hook-ledger.mjs after.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
// A function handed to one of these runs later, not during the render that passes it.
const DEFERRING_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect', 'useCallback']);

const childNodes = (node) => {
  const found = [];
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((item) => item && typeof item.type === 'string' && found.push([item, key]));
    else if (value && typeof value.type === 'string') found.push([value, key]);
  }
  return found;
};

const patternNames = (pattern, names = []) => {
  if (!pattern) return names;
  switch (pattern.type) {
    case 'Identifier': names.push(pattern.name); break;
    case 'ArrayPattern': pattern.elements.forEach((element) => patternNames(element, names)); break;
    case 'ObjectPattern': pattern.properties.forEach((property) => patternNames(property.type === 'RestElement' ? property.argument : property.value, names)); break;
    case 'AssignmentPattern': patternNames(pattern.left, names); break;
    case 'RestElement': patternNames(pattern.argument, names); break;
    default: break;
  }
  return names;
};

/** Names a block declares for itself: let, const, class and function declarations directly in it. */
const blockDeclarations = (statements) => {
  const names = [];
  for (const statement of statements || []) {
    if (statement.type === 'VariableDeclaration' && statement.kind !== 'var') statement.declarations.forEach((declarator) => patternNames(declarator.id, names));
    else if ((statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') && statement.id) names.push(statement.id.name);
  }
  return names;
};

const varDeclarations = (node, names = []) => {
  if (!node || FUNCTION_TYPES.has(node.type)) return names;
  if (node.type === 'VariableDeclaration' && node.kind === 'var') node.declarations.forEach((declarator) => patternNames(declarator.id, names));
  for (const [child] of childNodes(node)) varDeclarations(child, names);
  return names;
};

/**
 * The names a node reads from outside itself: Map name -> { eager, deferred, write }.
 * `eager` is a read made while the component renders; `deferred` one made inside a
 * function that runs later (a handler, an effect).
 */
export const freeNames = (root) => {
  const free = new Map();
  const note = (name, scopes, deferred, write) => {
    for (let index = scopes.length - 1; index >= 0; index -= 1) if (scopes[index].has(name)) return;
    const entry = free.get(name) || { eager: false, deferred: false, write: false };
    if (deferred) entry.deferred = true; else entry.eager = true;
    if (write) entry.write = true;
    free.set(name, entry);
  };
  const visitPattern = (pattern, scopes, deferred) => {
    if (!pattern) return;
    switch (pattern.type) {
      case 'Identifier': break;
      case 'ArrayPattern': pattern.elements.forEach((element) => visitPattern(element, scopes, deferred)); break;
      case 'ObjectPattern':
        for (const property of pattern.properties) {
          if (property.type === 'RestElement') { visitPattern(property.argument, scopes, deferred); continue; }
          if (property.computed) visit(property.key, scopes, deferred);
          visitPattern(property.value, scopes, deferred);
        }
        break;
      case 'AssignmentPattern': visitPattern(pattern.left, scopes, deferred); visit(pattern.right, scopes, deferred); break;
      case 'RestElement': visitPattern(pattern.argument, scopes, deferred); break;
      default: visit(pattern, scopes, deferred);
    }
  };
  const assignTarget = (target, scopes, deferred) => {
    if (target.type === 'Identifier') note(target.name, scopes, deferred, true);
    else if (target.type === 'ArrayPattern' || target.type === 'ObjectPattern' || target.type === 'AssignmentPattern' || target.type === 'RestElement') {
      for (const name of patternNames(target)) note(name, scopes, deferred, true);
      visitPattern(target, scopes, deferred);
    } else visit(target, scopes, deferred);
  };
  const visitFunction = (node, scopes, deferred) => {
    const scope = new Set();
    if (node.type === 'FunctionExpression' && node.id) scope.add(node.id.name);
    node.params.forEach((param) => patternNames(param, []).forEach((name) => scope.add(name)));
    if (node.body.type === 'BlockStatement') {
      varDeclarations(node.body).forEach((name) => scope.add(name));
      blockDeclarations(node.body.body).forEach((name) => scope.add(name));
    }
    const inner = [...scopes, scope];
    node.params.forEach((param) => visitPattern(param, inner, deferred));
    if (node.body.type === 'BlockStatement') node.body.body.forEach((statement) => visit(statement, inner, deferred));
    else visit(node.body, inner, deferred);
  };
  function visit(node, scopes, deferred) {
    if (!node) return;
    switch (node.type) {
      case 'Identifier': note(node.name, scopes, deferred, false); return;
      case 'JSXIdentifier': return;
      case 'JSXOpeningElement': case 'JSXClosingElement': {
        let name = node.name;
        while (name.type === 'JSXMemberExpression') name = name.object;
        if (name.type === 'JSXIdentifier' && (node.name.type === 'JSXMemberExpression' || /^[A-Z_$]/.test(name.name))) note(name.name, scopes, deferred, false);
        (node.attributes || []).forEach((attribute) => visit(attribute, scopes, deferred));
        return;
      }
      case 'JSXAttribute': visit(node.value, scopes, deferred); return;
      case 'MemberExpression': visit(node.object, scopes, deferred); if (node.computed) visit(node.property, scopes, deferred); return;
      case 'Property': if (node.computed) visit(node.key, scopes, deferred); visit(node.value, scopes, deferred); return;
      case 'MethodDefinition': case 'PropertyDefinition': if (node.computed) visit(node.key, scopes, deferred); visit(node.value, scopes, deferred); return;
      case 'LabeledStatement': visit(node.body, scopes, deferred); return;
      case 'BreakStatement': case 'ContinueStatement': return;
      case 'VariableDeclaration':
        for (const declarator of node.declarations) { visitPattern(declarator.id, scopes, deferred); visit(declarator.init, scopes, deferred); }
        return;
      case 'AssignmentExpression': assignTarget(node.left, scopes, deferred); visit(node.right, scopes, deferred); return;
      case 'UpdateExpression': assignTarget(node.argument, scopes, deferred); return;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': visitFunction(node, scopes, true); return;
      case 'CallExpression': {
        visit(node.callee, scopes, deferred);
        const callee = node.callee.type === 'Identifier' ? node.callee.name : null;
        for (const argument of node.arguments) {
          // A function passed to a call runs when that call chooses: during render
          // (useMemo, an array's map) unless the callee is known to keep it for later.
          if (FUNCTION_TYPES.has(argument.type)) visitFunction(argument, scopes, deferred || DEFERRING_HOOKS.has(callee));
          else visit(argument, scopes, deferred);
        }
        return;
      }
      case 'BlockStatement': case 'StaticBlock': {
        const inner = [...scopes, new Set(blockDeclarations(node.body))];
        node.body.forEach((statement) => visit(statement, inner, deferred));
        return;
      }
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
        const head = node.type === 'ForStatement' ? node.init : node.left;
        const scope = new Set(head?.type === 'VariableDeclaration' && head.kind !== 'var' ? head.declarations.flatMap((declarator) => patternNames(declarator.id)) : []);
        const inner = [...scopes, scope];
        if (head?.type === 'VariableDeclaration') visit(head, inner, deferred); else if (head) (node.type === 'ForStatement' ? visit : assignTarget)(head, inner, deferred);
        if (node.type === 'ForStatement') { visit(node.test, inner, deferred); visit(node.update, inner, deferred); } else visit(node.right, inner, deferred);
        visit(node.body, inner, deferred);
        return;
      }
      case 'CatchClause': {
        const inner = [...scopes, new Set(patternNames(node.param))];
        visitPattern(node.param, inner, deferred);
        visit(node.body, inner, deferred);
        return;
      }
      case 'SwitchStatement': {
        visit(node.discriminant, scopes, deferred);
        const inner = [...scopes, new Set(blockDeclarations(node.cases.flatMap((switchCase) => switchCase.consequent)))];
        node.cases.forEach((switchCase) => { visit(switchCase.test, inner, deferred); switchCase.consequent.forEach((statement) => visit(statement, inner, deferred)); });
        return;
      }
      case 'ClassDeclaration': case 'ClassExpression': {
        const inner = node.id ? [...scopes, new Set([node.id.name])] : scopes;
        visit(node.superClass, scopes, deferred);
        visit(node.body, inner, deferred);
        return;
      }
      default:
        for (const [child] of childNodes(node)) visit(child, scopes, deferred);
    }
  }
  // A function declaration's own body is deferred; a statement's own names are not free in it.
  const own = new Set(root.type === 'VariableDeclaration' ? root.declarations.flatMap((declarator) => patternNames(declarator.id)) : root.id ? [root.id.name] : []);
  visit(root, [own], false);
  return free;
};

const wrapList = (open, names, close, indent) => {
  const oneLine = `${open}${names.join(', ')}${close}`;
  if (oneLine.length + indent.length <= 118) return oneLine;
  const lines = [];
  let line = '';
  for (const name of names) {
    if (line && `${indent}  ${line}, ${name},`.length > 118) { lines.push(line); line = name; }
    else line = line ? `${line}, ${name}` : name;
  }
  if (line) lines.push(line);
  return `${open.trimEnd()}\n${lines.map((text) => `${indent}  ${text},`).join('\n')}\n${indent}${close.trimStart()}`;
};

export const planExtraction = (spec, read) => {
  const sourcePath = spec.source || 'src/App.jsx';
  const source = read(sourcePath);
  const { parseSync } = require('vite');
  const parsed = parseSync(sourcePath, source, { lang: 'jsx', sourceType: 'module' });
  if (parsed.errors?.length) throw new Error(parsed.errors[0].message);
  const program = parsed.program;
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) if (source[index] === '\n') lineStarts.push(index + 1);
  const lineOf = (position) => {
    let low = 0; let high = lineStarts.length - 1;
    while (low < high) { const mid = (low + high + 1) >> 1; if (lineStarts[mid] <= position) low = mid; else high = mid - 1; }
    return low + 1;
  };
  const lineEnd = (line) => (line < lineStarts.length ? lineStarts[line] : source.length); // offset just past line's newline

  const componentName = spec.component || 'App';
  const component = program.body.map((node) => (node.type === 'ExportDefaultDeclaration' || node.type === 'ExportNamedDeclaration' ? node.declaration : node))
    .find((node) => node?.type === 'FunctionDeclaration' && node.id?.name === componentName);
  if (!component) throw new Error(`${sourcePath} declares no function ${componentName}`);

  const statements = component.body.body.map((node, index) => ({
    index,
    node,
    startLine: lineOf(node.start),
    endLine: lineOf(node.end - 1),
    declares: node.type === 'VariableDeclaration' ? node.declarations.flatMap((declarator) => patternNames(declarator.id)) : node.type === 'FunctionDeclaration' ? [node.id.name] : [],
    hoisted: node.type === 'FunctionDeclaration',
  }));
  statements.forEach((statement, index) => {
    // Everything between the statement above and this one (blank lines, comments) moves with it.
    const previous = statements[index - 1];
    statement.textStart = previous ? lineEnd(previous.endLine) : lineEnd(lineOf(component.body.start));
    statement.textEnd = lineEnd(statement.endLine);
    if (source.slice(lineStarts[statement.startLine - 1], statement.node.start).trim() || source.slice(statement.node.end, statement.textEnd).trim().replace(/^\/\/.*$/, '')) {
      statement.sharesLine = true;
    }
    statement.free = freeNames(statement.node);
  });
  const owner = new Map();
  statements.forEach((statement) => statement.declares.forEach((name) => owner.set(name, statement)));

  const select = (selector) => {
    const range = /^L(\d+)-L(\d+)$/.exec(selector);
    if (range) {
      const found = statements.filter((statement) => statement.startLine >= Number(range[1]) && statement.endLine <= Number(range[2]));
      if (!found.length) throw new Error(`no statement lies within ${selector}`);
      return found;
    }
    if (selector.startsWith('~')) {
      const found = statements.filter((statement) => source.slice(statement.node.start, statement.node.end).includes(selector.slice(1)));
      if (found.length !== 1) throw new Error(`${found.length} statements of ${componentName} contain ${JSON.stringify(selector.slice(1))}`);
      return found;
    }
    const line = /^L(\d+)$/.exec(selector);
    const found = line ? statements.find((statement) => statement.startLine === Number(line[1])) : owner.get(selector);
    if (!found) throw new Error(`no statement of ${componentName} ${line ? `starts on line ${line[1]}` : `declares ${selector}`}`);
    return [found];
  };
  const moved = [...new Set(spec.statements.flatMap(select))].sort((a, b) => a.index - b.index);
  const movedSet = new Set(moved);
  const problems = [];
  for (const statement of moved) if (statement.sharesLine) problems.push(`line ${statement.startLine}: the statement shares a line with other code`);

  // callAfter: the call goes below a statement that stays, further down than everything
  // moved. Only for statements that call no hook (nothing about hook order may change)
  // and whose results nothing reads during render before that point.
  const after = spec.callAfter ? select(spec.callAfter)[0] : null;
  const callAt = after
    ? { index: after.index + 0.5, startLine: after.endLine + 1 }
    : !spec.callAt || spec.callAt === 'first' ? moved[0] : spec.callAt === 'last' ? moved[moved.length - 1] : select(spec.callAt)[0];
  if (after) {
    if (movedSet.has(after)) problems.push('callAfter must be a statement that stays');
    if (after.index < moved[moved.length - 1].index) problems.push('callAfter must be below every moved statement');
    for (const statement of moved) if (/\buse[A-Z]\w*\(/.test(source.slice(statement.textStart, statement.textEnd))) problems.push(`line ${statement.startLine}: calls a hook, so it cannot be called from further down (callAfter)`);
  } else if (!movedSet.has(callAt)) problems.push('callAt must be one of the moved statements');
  // A factory handed out by an object that may not be there yet is called behind
  // a check, so it cannot hold a hook: React needs the same hooks every render.
  if (spec.from) for (const statement of moved) if (/\buse[A-Z]\w*\(/.test(source.slice(statement.textStart, statement.textEnd))) problems.push(`line ${statement.startLine}: calls a hook, and ${spec.hook} would be called only when ${spec.from.object} is there`);

  // Module scope of the source: imports, and anything else declared at the top level.
  const imports = new Map();
  const moduleLocals = new Set();
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers) imports.set(specifier.local.name, { declaration: node, specifier });
    } else {
      const declaration = node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration' ? node.declaration : node;
      if (declaration?.type === 'VariableDeclaration') declaration.declarations.forEach((declarator) => patternNames(declarator.id).forEach((name) => moduleLocals.add(name)));
      else if (declaration?.id) moduleLocals.add(declaration.id.name);
    }
  }

  const inputs = new Set(); const usedImports = new Set(); const declared = new Set(moved.flatMap((statement) => statement.declares));
  for (const statement of moved) {
    for (const [name, use] of statement.free) {
      if (declared.has(name)) {
        // One moved statement reading another: their order is kept, so it is as before.
        continue;
      }
      if (owner.has(name)) {
        inputs.add(name);
        if (use.write) problems.push(`line ${statement.startLine}: assigns to ${name}, a variable of ${componentName}`);
        const declaredBy = owner.get(name);
        if (!declaredBy.hoisted && declaredBy.index > callAt.index) problems.push(`input ${name} (line ${declaredBy.startLine}) is declared after the call site (line ${callAt.startLine})`);
      } else if (imports.has(name)) usedImports.add(name);
      else if (moduleLocals.has(name)) problems.push(`line ${statement.startLine}: uses ${name}, declared at the top of ${sourcePath} and not importable`);
    }
  }
  const outputs = new Set();
  for (const statement of statements) {
    if (movedSet.has(statement)) continue;
    for (const [name, use] of statement.free) {
      if (!declared.has(name)) continue;
      outputs.add(name);
      if (use.write) problems.push(`line ${statement.startLine}: assigns to ${name}, which the hook would own`);
      if (use.eager && statement.index < callAt.index && !owner.get(name).hoisted) problems.push(`line ${statement.startLine}: reads output ${name} during render, above the call site (line ${callAt.startLine})`);
    }
  }
  // A moved statement gathered to a call site above its old place must not read, during
  // render, something declared between the two.
  for (const statement of moved) {
    for (const [name, use] of statement.free) {
      const declaredBy = owner.get(name);
      if (!declaredBy || movedSet.has(declaredBy) || declaredBy.hoisted) continue;
      if (use.eager && declaredBy.index > callAt.index && declaredBy.index < statement.index) problems.push(`line ${statement.startLine}: reads ${name} during render, declared at line ${declaredBy.startLine}, below the call site`);
    }
  }

  const order = (names) => [...names].sort((a, b) => (owner.get(a).index - owner.get(b).index) || a.localeCompare(b));
  const inputList = order(inputs);
  const outputList = [...outputs].sort((a, b) => {
    const left = owner.get(a); const right = owner.get(b);
    return left.index - right.index || left.declares.indexOf(a) - right.declares.indexOf(b);
  });

  // The new module's imports: the source's own declarations, cut down to what moved, re-aimed.
  const targetDirectory = posix.dirname(spec.file);
  const sourceDirectory = posix.dirname(sourcePath);
  const reAim = (specifier) => {
    if (!specifier.startsWith('.')) return specifier;
    const relative = posix.relative(targetDirectory, posix.join(sourceDirectory, specifier));
    return relative.startsWith('.') ? relative : `./${relative}`;
  };
  const importLines = [];
  const byDeclaration = new Map();
  for (const name of usedImports) {
    const { declaration, specifier } = imports.get(name);
    if (!byDeclaration.has(declaration)) byDeclaration.set(declaration, []);
    byDeclaration.get(declaration).push(specifier);
  }
  for (const [declaration, specifiers] of [...byDeclaration].sort((a, b) => a[0].start - b[0].start)) {
    const ordered = specifiers.sort((a, b) => a.start - b.start);
    const defaults = ordered.filter((specifier) => specifier.type === 'ImportDefaultSpecifier').map((specifier) => specifier.local.name);
    const namespaces = ordered.filter((specifier) => specifier.type === 'ImportNamespaceSpecifier').map((specifier) => `* as ${specifier.local.name}`);
    const named = ordered.filter((specifier) => specifier.type === 'ImportSpecifier').map((specifier) => (specifier.imported.name === specifier.local.name ? specifier.local.name : `${specifier.imported.name} as ${specifier.local.name}`));
    const clauses = [...defaults, ...namespaces];
    if (named.length) clauses.push(wrapList('{ ', named, ' }', ''));
    importLines.push(`import ${clauses.join(', ')} from '${reAim(declaration.source.value)}';`);
  }

  // A dynamic import's path is relative to the file it is written in: the one edit a move makes.
  const reAimed = [];
  const movedText = (statement) => {
    const edits = [];
    const find = (node) => {
      if (node.type === 'ImportExpression' && node.source.type === 'Literal' && typeof node.source.value === 'string' && node.source.value.startsWith('.')) edits.push(node.source);
      if (node.type === 'NewExpression' && node.callee.type === 'Identifier' && node.callee.name === 'URL' && node.arguments[0]?.type === 'Literal' && String(node.arguments[0].value).startsWith('.')) edits.push(node.arguments[0]);
      for (const [child] of childNodes(node)) find(child);
    };
    find(statement.node);
    let text = source.slice(statement.textStart, statement.textEnd);
    for (const literal of edits.sort((a, b) => b.start - a.start)) {
      const quote = source[literal.start];
      reAimed.push(literal.value);
      text = `${text.slice(0, literal.start - statement.textStart)}${quote}${reAim(literal.value)}${quote}${text.slice(literal.end - statement.textStart)}`;
    }
    return text;
  };
  const body = moved.map(movedText).join('').replace(/^\n+/, '');
  const header = spec.header ? `/*\n${spec.header.trim().split('\n').map((line) => (line ? ` * ${line}` : ' *')).join('\n')}\n */\n` : '';
  // By position, the seam leaves no property names in the bundle (see "from" above).
  const [openIn, closeIn, openOut, closeOut] = (spec.from?.positional || spec.positional) ? ['', '', '[', ']'] : ['{ ', ' }', '{ ', ' }'];
  const parameters = inputList.length ? wrapList(openIn, inputList, closeIn, '') : '';
  const returns = outputList.length ? `  return ${wrapList(openOut, outputList, closeOut, '  ')};\n` : '';
  const moduleText = `${header}${importLines.join('\n')}${importLines.length ? '\n\n' : ''}export function ${spec.hook}(${parameters}) {\n${body}${returns}}\n`;

  const invocation = `${spec.from ? `${spec.from.object}.` : ''}${spec.hook}(${inputList.length ? wrapList(openIn, inputList, closeIn, '  ') : ''})`;
  const call = `${outputList.length ? `const ${wrapList(openOut, outputList, closeOut, '  ')} = ` : ''}${spec.from ? `${spec.from.object} ? ${invocation} : ${spec.from.fallback}` : invocation};`;

  // Rewrite the source: cut each moved statement, put the call where callAt was.
  let rewritten = '';
  let at = 0;
  for (const statement of moved) {
    rewritten += source.slice(at, statement.textStart);
    if (statement === callAt) {
      // Keep the blank line (not the comments, which moved) that separated it from the code above.
      const lead = source.slice(statement.textStart, lineStarts[statement.startLine - 1]);
      rewritten += `${/^\s*\n/.test(lead) && !rewritten.endsWith('\n\n') ? '\n' : ''}  ${call}\n`;
    }
    at = statement.textEnd;
  }
  if (after) {
    rewritten += `${source.slice(at, after.textEnd)}\n  ${call}\n`;
    at = after.textEnd;
  }
  rewritten += source.slice(at);
  rewritten = rewritten.replace(/\n{3,}/g, (match, offset) => (offset > component.body.start ? '\n\n' : match));

  return { sourcePath, rewritten, moduleText, reAimed, inputList, outputList, usedImports: [...usedImports], problems, moved, callAt, hookImport: spec.from ? null : { name: spec.hook, from: `./${posix.relative(sourceDirectory, spec.file)}` } };
};

/** Add the hook's import and drop every import specifier the source no longer uses. */
export const settleImports = (sourcePath, text, hookImport) => {
  const { parseSync } = require('vite');
  const parse = (code) => { const result = parseSync(sourcePath, code, { lang: 'jsx', sourceType: 'module' }); if (result.errors?.length) throw new Error(result.errors[0].message); return result.program; };
  let program = parse(text);
  const importNodes = program.body.filter((node) => node.type === 'ImportDeclaration');
  if (hookImport && !importNodes.some((node) => node.source.value === hookImport.from)) {
    const last = importNodes[importNodes.length - 1];
    text = `${text.slice(0, last.end)}\nimport { ${hookImport.name} } from '${hookImport.from}';${text.slice(last.end)}`;
    program = parse(text);
  }
  const used = new Set();
  const collect = (node, parent, key) => {
    if (node.type === 'ImportDeclaration') return;
    if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
      const isProperty = parent && ((parent.type === 'MemberExpression' && key === 'property' && !parent.computed) || (parent.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand));
      if (!isProperty) used.add(node.name);
    }
    for (const [child, childKey] of childNodes(node)) collect(child, node, childKey);
  };
  collect(program, null, null);
  const removed = [];
  const edits = [];
  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration' || node.specifiers.length === 0) continue;
    const unused = node.specifiers.filter((specifier) => !used.has(specifier.local.name));
    if (!unused.length) continue;
    removed.push(...unused.map((specifier) => specifier.local.name));
    if (unused.length === node.specifiers.length) {
      let end = node.end;
      if (text[end] === '\n') end += 1;
      edits.push([node.start, end, '']);
      continue;
    }
    // Cut each unused specifier with the comma after it (and its own line, if it had
    // one), inside this declaration's text; then drop a comma left before the brace.
    const hadTrailingComma = /,\s*\}/.test(text.slice(node.start, node.end));
    let declaration = text.slice(node.start, node.end);
    for (const specifier of [...unused].sort((left, right) => right.start - left.start)) {
      let start = specifier.start - node.start; let end = specifier.end - node.start;
      const after = /^\s*,/.exec(declaration.slice(end));
      if (after) end += after[0].length;
      const lineStart = declaration.lastIndexOf('\n', start - 1) + 1;
      const lineEndAt = declaration.indexOf('\n', end);
      if (lineStart > 0 && lineEndAt !== -1 && !declaration.slice(lineStart, start).trim() && !declaration.slice(end, lineEndAt).trim()) { start = lineStart; end = lineEndAt + 1; }
      else if (declaration[end] === ' ') end += 1;
      else if (declaration[start - 1] === ' ' && declaration[end] !== '\n') start -= 1;
      declaration = declaration.slice(0, start) + declaration.slice(end);
    }
    if (!hadTrailingComma) declaration = declaration.replace(/,(\s*)\}/, '$1}');
    declaration = declaration.replace(/\{\s+\}/, '{}').replace(/\{(\S)/, '{ $1').replace(/[ \t]+\n/g, '\n');
    edits.push([node.start, node.end, declaration]);
  }
  edits.sort((a, b) => b[0] - a[0]);
  for (const [start, end, replacement] of edits) text = text.slice(0, start) + replacement + text.slice(end);
  parse(text);
  return { text, removed };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [specPath, ...flags] = process.argv.slice(2);
  // Several moves in a row: each adds its import with --defer-imports (so the lines
  // below the imports stay where the next spec expects them), and a last run
  // with --settle-imports <source> adds them all and drops what nothing uses.
  const pendingPath = `${ROOT}.extract-app-hook.pending.json`;
  const pending = existsSync(pendingPath) ? JSON.parse(readFileSync(pendingPath, 'utf8')) : [];
  if (specPath === '--settle-imports') {
    const sourcePath = flags[0] || 'src/App.jsx';
    let text = readFileSync(ROOT + sourcePath, 'utf8');
    let removed = [];
    for (const hookImport of [...pending, null]) ({ text, removed } = settleImports(sourcePath, text, hookImport));
    writeFileSync(ROOT + sourcePath, text);
    if (existsSync(pendingPath)) unlinkSync(pendingPath);
    console.log(`${sourcePath} no longer imports: ${removed.join(', ') || '(nothing dropped)'}`);
    process.exit(0);
  }
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const plan = planExtraction(spec, (path) => readFileSync(ROOT + path, 'utf8'));
  console.log(`${spec.hook}: ${plan.moved.length} statements, ${plan.moved.reduce((sum, statement) => sum + statement.endLine - statement.startLine + 1, 0)} lines`);
  console.log(`  inputs (${plan.inputList.length}): ${plan.inputList.join(', ')}`);
  console.log(`  outputs (${plan.outputList.length}): ${plan.outputList.join(', ')}`);
  console.log(`  imports (${plan.usedImports.length}): ${plan.usedImports.join(', ')}`);
  if (plan.reAimed.length) console.log(`  dynamic imports re-aimed (the one edit to moved code): ${plan.reAimed.join(', ')}`);
  if (plan.problems.length) {
    console.error(`REFUSED:\n${[...new Set(plan.problems)].map((problem) => `  - ${problem}`).join('\n')}`);
    process.exit(1);
  }
  if (flags.includes('--dry-run')) process.exit(0);
  if (existsSync(ROOT + spec.file)) { console.error(`${spec.file} already exists`); process.exit(1); }
  mkdirSync(dirname(ROOT + spec.file), { recursive: true });
  writeFileSync(ROOT + spec.file, plan.moduleText);
  if (flags.includes('--defer-imports')) {
    writeFileSync(ROOT + plan.sourcePath, plan.rewritten);
    writeFileSync(pendingPath, JSON.stringify([...pending, plan.hookImport]));
  } else {
    const settled = settleImports(plan.sourcePath, plan.rewritten, plan.hookImport);
    writeFileSync(ROOT + plan.sourcePath, settled.text);
    console.log(`  ${plan.sourcePath} no longer imports: ${settled.removed.join(', ') || '(nothing dropped)'}`);
  }
}
