/*
 * WHERE A FIXED COLOUR REACHES A STYLE WITHOUT BEING WRITTEN IN IT
 * (scripts/audit-theme-colors.mjs, its third ratchet).
 *
 * The audit reads a colour where it is written: a hex in `color: '#174ea6'`.
 * The live proctor monitor's session status was `color: statusColor(status)`,
 * and statusColor() returned the light theme's #174ea6, so on the dark theme's
 * rows it read 2.13:1 and the audit saw nothing: the hex was in a helper, not
 * in the property. This follows a colour from the style it reaches back to the
 * literal it started as, the way the code computes it:
 *
 *   - a helper's returns (`statusColor(x)`), a ternary or `||`, a constant, a
 *     destructured or defaulted binding, a reassignment;
 *   - a map or a tuple (`TONES[k][1]`, `TONE.locked`): the entry the code names,
 *     or every entry when it names none; `Object.values()` / `Object.entries()`
 *     and the callbacks of `.map()` and its kin;
 *   - a function's parameters, from its calls (`pill('#fce8e6', '#a50e0e')`),
 *     and a component's props, from the JSX that renders it
 *     (`<Badge tone="#174ea6">`), in any file;
 *   - imports between files of src;
 *   - a CSS custom property with no dark value anywhere (`--wf-tint: #eaf2ff`,
 *     read by `background: var(--wf-tint)`), whether a stylesheet, CSS a script
 *     writes, or a style object defines it.
 *
 * WHAT A STYLE IS. A `color`, `background`, `border` or `outline` property (or
 * a longhand of one) of a style object: a JSX `style` (or `*Style`) attribute,
 * an object spread into one, or an object with another CSS property. Any
 * `background`, `border` or `outline` key. A declaration in CSS a script writes
 * (`color: ${tone};`), and `el.style.color = …` / `style.setProperty(…)`.
 * NOT a style, on purpose (the audit's baselines keep them): SVG presentation
 * attributes and fill/stroke keys, canvas (`ctx.fillStyle`), print rules, and
 * a `color` key in a record that is data, such as a chart series
 * `{ label, color }`, until it is read into a style.
 *
 * A literal is classified for the role it reaches with src/theme/
 * themeColorRoles.js, as the audit classifies a written one, so a colour that
 * reads on both themes (a saturated fill, white text) is not reported. One the
 * audit already counts where it is written is not counted again.
 *
 * WHAT IT DOES NOT SEE. It reads names, not the elements a rule reaches: a
 * custom property is themed once any dark rule defines it, so a dark block
 * that leaves out one family's rule is not caught here (its own test catches
 * the workflow focus mode's). A colour that comes from the server or from
 * storage has no literal to follow, nor does one passed through a call it
 * cannot name (a method of an object it did not build, a callback stored and
 * called later). A parameter takes every argument its function is called with
 * in src, so it may count a colour that one particular call never passes.
 */
import path from 'node:path';
import { classifyThemeColor, roleForProperty } from '../../src/theme/themeColorRoles.js';

const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
// A placeholder for a template's ${…} in the CSS text a script writes.
const SLOT = '\u0001';
// Tone-record keys roleForProperty knows: a record's own name for a colour,
// not a CSS property. What reads the record into a style is followed instead.
const TONE_KEYS = new Set(['bg', 'fg', 'text', 'chip', 'surface', 'selfBorder']);
// CSS properties other than colours: two CSS keys make an object a style, where
// `{ label, color }` is a chart series' data.
const CSS_KEYS = new Set([
  'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingInline', 'paddingBlock',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginInline', 'marginBlock',
  'font', 'fontSize', 'fontWeight', 'fontStyle', 'fontFamily', 'lineHeight', 'letterSpacing', 'textAlign',
  'textTransform', 'textDecoration', 'whiteSpace', 'display', 'position', 'top', 'left', 'right', 'bottom', 'inset',
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'flex', 'flexWrap', 'flexDirection',
  'flexShrink', 'flexGrow', 'gap', 'rowGap', 'columnGap', 'alignItems', 'alignSelf', 'justifyContent', 'placeItems',
  'gridTemplateColumns', 'gridColumn', 'borderRadius', 'boxShadow', 'opacity', 'overflow', 'overflowX', 'overflowY',
  'cursor', 'zIndex', 'transform', 'transition', 'boxSizing', 'textOverflow', 'verticalAlign', 'outlineOffset',
]);
// Array methods whose callback is handed the array's elements.
const ELEMENT_CALLBACKS = new Set(['map', 'forEach', 'filter', 'find', 'findLast', 'findIndex', 'some', 'every', 'flatMap', 'sort']);
// The theme's own modules: what their helpers return is a token.
const THEME_MODULE = /^src\/theme\//;
// Calls whose value is their first argument.
const RETURNS_ARGUMENT = new Set(['freeze', 'memo', 'forwardRef', 'useCallback']);

/** The role a CSS property (camel or kebab case) gives a colour, or null. */
export const cssRole = (name) => {
  const key = String(name || '').replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
  if (TONE_KEYS.has(key)) return null;
  return roleForProperty(key);
};

const isNode = (value) => value && typeof value === 'object' && typeof value.type === 'string';
const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const isFunction = (node) => Boolean(node && FUNCTION_TYPES.has(node.type));
const SCOPE_TYPES = new Set(['Program', 'BlockStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'CatchClause', 'SwitchStatement', 'StaticBlock']);

// A node's children, read once: every pass walks the same trees.
const kids = new WeakMap();
const children = (node) => {
  let out = kids.get(node);
  if (out) return out;
  out = [];
  for (const key in node) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) { for (const item of value) if (isNode(item)) out.push(item); } else if (isNode(value)) out.push(value);
  }
  kids.set(node, out);
  return out;
};

const keyName = (property) => {
  const key = property?.key;
  if (!key) return null;
  if (property.computed) return key.type === 'Literal' && typeof key.value === 'string' ? key.value : null;
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'Literal') return String(key.value);
  return null;
};
// The key a member access names, when the code names one.
const memberKey = (member) => {
  const p = member.property;
  if (!member.computed) return p.type === 'Identifier' ? p.name : null;
  if (p.type === 'Literal' && (typeof p.value === 'string' || typeof p.value === 'number')) return String(p.value);
  if (p.type === 'TemplateLiteral' && p.expressions.length === 0) return p.quasis[0].value.cooked;
  return null;
};
const calleeName = (callee) => {
  const target = callee.type === 'ChainExpression' ? callee.expression : callee;
  if (target.type === 'Identifier') return target.name;
  if (target.type === 'MemberExpression' && !target.computed && target.property.type === 'Identifier') return target.property.name;
  return null;
};

// The names a pattern binds, each with the steps from the value it destructures.
const patternBindings = (pattern, steps = [], out = []) => {
  if (!pattern) return out;
  if (pattern.type === 'Identifier') out.push({ id: pattern, steps });
  else if (pattern.type === 'AssignmentPattern') patternBindings(pattern.left, [...steps, { fallback: pattern.right }], out);
  else if (pattern.type === 'RestElement') patternBindings(pattern.argument, [...steps, { rest: true }], out);
  else if (pattern.type === 'ObjectPattern') {
    for (const property of pattern.properties) {
      if (property.type === 'RestElement') patternBindings(property.argument, [...steps, { rest: true }], out);
      else patternBindings(property.value, [...steps, { key: keyName(property) }], out);
    }
  } else if (pattern.type === 'ArrayPattern') {
    pattern.elements.forEach((element, index) => {
      if (element?.type === 'RestElement') patternBindings(element.argument, [...steps, { rest: true }], out);
      else if (element) patternBindings(element, [...steps, { key: String(index) }], out);
    });
  }
  return out;
};

const lineAt = (source) => {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) if (source.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
};

/* ------------------------------------------------------------------ CSS text */

/*
 * The declarations of some CSS, each with what decides whether a custom
 * property it defines is themed: a dark selector or media block around it, or
 * a print block. Nested rules keep their outer preludes. `offset` is where the
 * value starts in `css`.
 */
export const cssDeclarations = (css) => {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const out = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i <= text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') { stack.push(text.slice(start, i)); start = i + 1; continue; }
    if (ch !== '}' && ch !== ';' && i !== text.length) continue;
    const piece = text.slice(start, i);
    const match = /^(\s*)(--[\w-]+|[a-zA-Z-]+)(\s*:\s*)([\s\S]*?)\s*$/.exec(piece);
    if (match) {
      const context = stack.join(' ');
      out.push({
        property: match[2], value: match[4], offset: start + match[1].length + match[2].length + match[3].length,
        dark: /data-theme=['"]?dark|prefers-color-scheme:\s*dark/.test(context),
        print: /@media[^{]*\bprint\b/.test(context),
      });
    }
    if (ch === '}') stack.pop();
    start = i + 1;
  }
  return out;
};

// The CSS a string or template of a script may hold, with each ${…} as SLOT,
// quotes and angle brackets as declaration breaks (an inline style="…" in
// HTML a script writes), and a map from its offsets back to the source.
const scriptCss = (module, node) => {
  if (node.type === 'Literal') {
    const raw = module.source.slice(node.start + 1, node.end - 1);
    return { text: raw.replace(/["'<>]/g, ';'), at: (i) => node.start + 1 + i, slots: [] };
  }
  const starts = [];
  let text = '';
  node.quasis.forEach((quasi, index) => {
    starts.push(text.length);
    text += module.source.slice(quasi.start, quasi.end).replace(/["'<>]/g, ';');
    if (index < node.expressions.length) text += SLOT;
  });
  const at = (i) => {
    let k = starts.length - 1;
    while (k > 0 && starts[k] > i) k -= 1;
    return node.quasis[k].start + (i - starts[k]);
  };
  return { text, at, slots: node.expressions };
};
const looksLikeCss = (text) => /(?:^|[\s;{])(?:--[\w-]+|[a-z-]+)\s*:/.test(text);

/* ------------------------------------------------------------------ modules */

const indexModule = (module) => {
  const scopes = new Map(); // scope node -> Map(name -> binding)
  const scopeOf = new Map(); // identifier -> its scope chain
  const parents = new Map();
  const assignments = [];
  const exportsMap = new Map();
  const starExports = [];
  const declare = (scopeNode, name, binding) => {
    if (!scopes.has(scopeNode)) scopes.set(scopeNode, new Map());
    const table = scopes.get(scopeNode);
    if (!table.has(name)) table.set(name, { module, assigned: [], ...binding });
  };
  const nodes = [];
  const visit = (node, parent, scopeChain) => {
    nodes.push(node);
    if (node.type === 'Property') parents.set(node, parent); // an object's key, or a pattern's
    const chain = SCOPE_TYPES.has(node.type) || isFunction(node) ? [...scopeChain, node] : scopeChain;
    const functionScope = [...chain].reverse().find((n) => isFunction(n) || n.type === 'Program');
    const blockScope = chain[chain.length - 1];
    if (node.type === 'VariableDeclaration') {
      for (const declarator of node.declarations) {
        for (const { id, steps } of patternBindings(declarator.id)) {
          declare(node.kind === 'var' ? functionScope : blockScope, id.name, { kind: node.kind, id, steps, init: declarator.init });
        }
      }
    } else if (node.type === 'FunctionDeclaration' && node.id) {
      declare(scopeChain[scopeChain.length - 1] || node, node.id.name, { kind: 'function', id: node.id, fn: node });
    } else if (node.type === 'ClassDeclaration' && node.id) {
      declare(blockScope, node.id.name, { kind: 'class', id: node.id });
    } else if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers) {
        let imported = '*';
        if (specifier.type === 'ImportDefaultSpecifier') imported = 'default';
        else if (specifier.type === 'ImportSpecifier') imported = specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value;
        declare(chain[0], specifier.local.name, { kind: 'import', id: specifier.local, from: node.source.value, imported });
      }
    } else if (node.type === 'ExportNamedDeclaration') {
      const d = node.declaration;
      if (d?.type === 'VariableDeclaration') d.declarations.forEach((v) => patternBindings(v.id).forEach(({ id }) => exportsMap.set(id.name, { local: id.name })));
      else if (d?.id) exportsMap.set(d.id.name, { local: d.id.name });
      for (const specifier of node.specifiers || []) {
        const name = (n) => (n.type === 'Identifier' ? n.name : n.value);
        exportsMap.set(name(specifier.exported), node.source ? { from: node.source.value, name: name(specifier.local) } : { local: name(specifier.local) });
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      const d = node.declaration;
      exportsMap.set('default', (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id ? { local: d.id.name } : { node: d });
    } else if (node.type === 'ExportAllDeclaration') {
      if (node.exported) exportsMap.set(node.exported.type === 'Identifier' ? node.exported.name : node.exported.value, { from: node.source.value, name: '*' });
      else starExports.push(node.source.value);
    } else if (node.type === 'CatchClause' && node.param) {
      patternBindings(node.param).forEach(({ id }) => declare(node, id.name, { kind: 'catch', id }));
    } else if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') {
      assignments.push(node);
    }
    if (isFunction(node)) {
      node.params.forEach((param, index) => {
        for (const { id, steps } of patternBindings(param)) declare(node, id.name, { kind: 'param', id, steps, fn: node, index });
      });
      if (node.type === 'FunctionExpression' && node.id) declare(node, node.id.name, { kind: 'function', id: node.id, fn: node });
    }
    if (node.type === 'Identifier' || node.type === 'JSXIdentifier') scopeOf.set(node, chain);
    for (const child of children(node)) visit(child, node, chain);
  };
  visit(module.ast, null, []);
  Object.assign(module, { scopes, parents, nodes, exports: exportsMap, starExports });
  module.resolve = (identifier) => {
    const chain = scopeOf.get(identifier) || [module.ast];
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const binding = scopes.get(chain[i])?.get(identifier.name);
      if (binding) return binding;
    }
    return null;
  };
  for (const assignment of assignments) module.resolve(assignment.left)?.assigned.push(assignment.right);
};

/* ------------------------------------------------------------------ the program */

/**
 * files: [{ path: 'src/…', source }] (.js, .jsx and .css). parse(source, path)
 * gives an ESTree Program with offsets (vite's parseAst, lang 'jsx'). direct:
 * Map(path -> Set of `${offset}:${role}`): each literal the audit already
 * counts where it is written, in the role it counts it in. Returns findings { file, line, offset, hex, role, token, sink }, sink
 * being { file, line, property, expression }: the style the colour reaches.
 * onReach(file, offset, hex, role), if given, hears every literal that reaches
 * a style, before it is classified.
 */
export const indirectThemeColors = ({ files, parse, direct = new Map(), onReach = null }) => {
  const modules = new Map();
  const stylesheets = [];
  for (const file of files) {
    if (file.path.endsWith('.css')) { stylesheets.push(file); continue; }
    const module = { path: file.path, source: file.source, line: lineAt(file.source) };
    try {
      module.ast = parse(file.source, file.path);
    } catch (error) {
      throw new Error(`${file.path} could not be parsed: ${error.message.split('\n')[0]}`);
    }
    indexModule(module);
    modules.set(file.path, module);
  }
  const moduleFor = (from, specifier) => {
    if (!/^\.\.?\//.test(specifier)) return null;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    for (const candidate of [base, `${base}.js`, `${base}.jsx`, `${base}/index.js`, `${base}/index.jsx`]) {
      if (modules.has(candidate)) return modules.get(candidate);
    }
    return null;
  };

  /*
   * VALUES. What an expression can evaluate to, as the nodes that build it:
   * { m, n } (a literal, template, object, array or function of module m),
   * { m, namespace } (an `import * as`), { m, props } (a JSX element's
   * attributes, as a component's props), { pairs } (what Object.entries()
   * returns) and { pair } (one [key, value] of it).
   */
  const memo = new Map();
  const active = new Set();
  let paramsReady = false;
  const identity = (value) => value.n || value.props || value.pairs || value.pair || value.m;
  const union = (...lists) => {
    const seen = new Set();
    const out = [];
    for (const value of lists.flat()) {
      const id = value.namespace ? `${value.m.path}#*` : identity(value);
      if (!seen.has(id)) { seen.add(id); out.push(value); }
    }
    return out;
  };
  const valuesOf = (m, node) => {
    if (!node) return [];
    if (memo.has(node)) return memo.get(node);
    if (active.has(node)) return [];
    active.add(node);
    const result = union(computeValues(m, node));
    active.delete(node);
    memo.set(node, result);
    return result;
  };
  const computeValues = (m, node) => {
    switch (node.type) {
      case 'Literal': case 'TemplateLiteral': case 'ObjectExpression': case 'ArrayExpression':
      case 'FunctionExpression': case 'ArrowFunctionExpression': case 'FunctionDeclaration':
        return [{ m, n: node }];
      case 'ConditionalExpression': return [...valuesOf(m, node.consequent), ...valuesOf(m, node.alternate)];
      case 'LogicalExpression': return [...valuesOf(m, node.left), ...valuesOf(m, node.right)];
      case 'SequenceExpression': return valuesOf(m, node.expressions[node.expressions.length - 1]);
      case 'AssignmentExpression': return valuesOf(m, node.right);
      case 'ChainExpression': case 'ParenthesizedExpression': case 'TSAsExpression': case 'TSNonNullExpression':
        return valuesOf(m, node.expression);
      case 'JSXExpressionContainer': return node.expression.type === 'JSXEmptyExpression' ? [] : valuesOf(m, node.expression);
      case 'Identifier': { const binding = m.resolve(node); return binding ? bindingValues(binding) : []; }
      case 'MemberExpression': return project(valuesOf(m, node.object), { key: memberKey(node) });
      case 'CallExpression': return callValues(m, node);
      default: return [];
    }
  };
  // One step into each value: the entry a key names, every entry when it names
  // none, or the whole value for a rest element. `within` holds the objects
  // and elements whose spreads are being read, so a spread of itself ends.
  const project = (values, step, within = new Set()) => {
    if (step.fallback) return values; // the binding adds the default itself
    const out = [];
    for (const value of values) {
      if (step.rest) { out.push(value); continue; }
      const self = value.props || value.n;
      if (self && within.has(self)) continue;
      const inner = self ? new Set([...within, self]) : within;
      if (value.namespace) { if (step.key != null) out.push(...exportValues(value.m, step.key)); continue; }
      if (value.pairs) { if (step.key == null || /^\d+$/.test(step.key)) out.push({ pair: value.pairs }); continue; }
      if (value.pair) { if (step.key == null || step.key === '1') out.push(...value.pair); continue; }
      if (value.props) {
        for (const attribute of value.props.attributes) {
          if (attribute.type === 'JSXSpreadAttribute') out.push(...project(valuesOf(value.m, attribute.argument), step, inner));
          else if ((step.key == null || attribute.name.name === step.key) && attribute.value) out.push(...valuesOf(value.m, attribute.value));
        }
        continue;
      }
      const { m, n } = value;
      if (n.type === 'ObjectExpression') {
        for (const property of n.properties) {
          if (property.type === 'SpreadElement') { out.push(...project(valuesOf(m, property.argument), step, inner)); continue; }
          if (property.type !== 'Property' || property.kind !== 'init' || property.method) continue;
          const name = keyName(property);
          if (step.key == null || name == null || name === step.key) out.push(...valuesOf(m, property.value));
        }
      } else if (n.type === 'ArrayExpression') {
        n.elements.forEach((element, index) => {
          if (!element) return;
          if (element.type === 'SpreadElement') out.push(...project(valuesOf(m, element.argument), { key: null }, inner));
          else if (step.key == null || String(index) === step.key) out.push(...valuesOf(m, element));
        });
      }
    }
    return union(out);
  };
  const bindingValues = (binding) => {
    const m = binding.module;
    let base = [];
    if (binding.kind === 'function') base = [{ m, n: binding.fn }];
    else if (binding.kind === 'import') {
      const target = moduleFor(m.path, binding.from);
      base = target ? exportValues(target, binding.imported) : [];
    } else if (binding.kind === 'param') base = paramValues(binding);
    else if (binding.init) base = valuesOf(m, binding.init);
    if (binding.kind !== 'param') {
      for (const step of binding.steps || []) {
        base = project(base, step);
        if (step.fallback) base = union(base, valuesOf(m, step.fallback));
      }
    }
    return union(base, binding.assigned.flatMap((expression) => valuesOf(m, expression)));
  };
  const exportValues = (module, name, seen = new Set()) => {
    const key = `${module.path}#${name}`;
    if (seen.has(key)) return [];
    seen.add(key);
    if (name === '*') return [{ m: module, namespace: true }];
    const entry = module.exports.get(name);
    if (entry?.local) {
      const binding = module.scopes.get(module.ast)?.get(entry.local);
      return binding ? bindingValues(binding) : [];
    }
    if (entry?.node) return valuesOf(module, entry.node);
    if (entry?.from) {
      const target = moduleFor(module.path, entry.from);
      return target ? exportValues(target, entry.name, seen) : [];
    }
    for (const from of module.starExports) {
      const target = moduleFor(module.path, from);
      const found = target ? exportValues(target, name, seen) : [];
      if (found.length) return found;
    }
    return [];
  };
  // A call's value: the returns of what it calls. Object.freeze(x), memo(F),
  // forwardRef(F) and useCallback(F) are their argument, useMemo(f) what f
  // returns, Object.values() the entries, .find() / .at() an element.
  const callValues = (m, call) => {
    const name = calleeName(call.callee);
    const callee = call.callee.type === 'ChainExpression' ? call.callee.expression : call.callee;
    const [first] = call.arguments;
    if (name === 'useMemo' && isFunction(first)) return returnsOf(m, first);
    if (RETURNS_ARGUMENT.has(name) && first) return valuesOf(m, first);
    if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.object.name === 'Object' && first) {
      if (name === 'values') return project(valuesOf(m, first), { key: null });
      if (name === 'entries') return [{ pairs: project(valuesOf(m, first), { key: null }) }];
      if (name === 'assign') return call.arguments.flatMap((argument) => valuesOf(m, argument));
    }
    if (callee.type === 'MemberExpression' && ['find', 'findLast', 'at'].includes(name)) return project(valuesOf(m, callee.object), { key: null });
    // The theme's own helpers (toneTextColor) give a token for any colour.
    return valuesOf(m, callee).filter((value) => value.n && isFunction(value.n) && !THEME_MODULE.test(value.m.path))
      .flatMap((value) => returnsOf(value.m, value.n));
  };
  const returnsMemo = new Map();
  const returnsOf = (m, fn) => {
    if (returnsMemo.has(fn)) return returnsMemo.get(fn);
    returnsMemo.set(fn, []);
    const out = [];
    if (fn.type === 'ArrowFunctionExpression' && fn.body.type !== 'BlockStatement') out.push(...valuesOf(m, fn.body));
    else {
      const visit = (node) => {
        if (node !== fn && isFunction(node)) return;
        if (node.type === 'ReturnStatement' && node.argument) out.push(...valuesOf(m, node.argument));
        children(node).forEach(visit);
      };
      visit(fn);
    }
    const result = union(out);
    returnsMemo.set(fn, result);
    return result;
  };

  // Every function's calls and every component's elements, for its parameters.
  // Built before any style is read, with parameters unknown while it is built.
  const sites = new Map();
  const addSite = (fn, site) => { if (!sites.has(fn)) sites.set(fn, []); sites.get(fn).push(site); };
  const paramValues = (binding) => {
    if (!paramsReady) return [];
    const { fn, index, steps } = binding;
    let base = [];
    for (const site of sites.get(fn) || []) {
      if (site.call) {
        const argument = site.call.arguments[index];
        if (argument && argument.type !== 'SpreadElement') base.push(...valuesOf(site.m, argument));
      } else if (site.element && index === 0) base.push({ m: site.m, props: site.element });
      else if (site.elementsOf && index === 0) base.push(...project(valuesOf(site.m, site.elementsOf), { key: null }));
    }
    base = union(base);
    for (const step of steps || []) {
      base = project(base, step);
      if (step.fallback) base = union(base, valuesOf(binding.module, step.fallback));
    }
    return base;
  };

  for (const m of modules.values()) {
    m.nodes.forEach((node) => {
      if (node.type === 'CallExpression') {
        const callee = node.callee.type === 'ChainExpression' ? node.callee.expression : node.callee;
        const named = callee.type === 'Identifier' || (callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && !callee.computed);
        if (named) for (const value of valuesOf(m, callee)) if (value.n && isFunction(value.n)) addSite(value.n, { m, call: node });
        // A callback handed an array's elements (or an Object.entries pair).
        const fn = node.arguments[0];
        if (callee.type === 'MemberExpression' && ELEMENT_CALLBACKS.has(calleeName(callee)) && isFunction(fn)) addSite(fn, { m, elementsOf: callee.object });
      } else if (node.type === 'JSXOpeningElement' && node.name.type === 'JSXIdentifier' && /^[A-Z]/.test(node.name.name)) {
        const binding = m.resolve(node.name);
        for (const value of binding ? bindingValues(binding) : []) if (value.n && isFunction(value.n)) addSite(value.n, { m, element: node });
      }
    });
  }
  memo.clear();
  returnsMemo.clear();
  paramsReady = true;

  /* ---- what is a style */
  const styleObjects = new Set();
  const markStyle = (values) => {
    for (const value of values) {
      if (!value.n || value.n.type !== 'ObjectExpression' || styleObjects.has(value.n)) continue;
      styleObjects.add(value.n);
      for (const property of value.n.properties) if (property.type === 'SpreadElement') markStyle(valuesOf(value.m, property.argument));
    }
  };
  for (const m of modules.values()) {
    m.nodes.forEach((node) => {
      if (node.type === 'JSXAttribute' && node.name.type === 'JSXIdentifier' && /^(style|\w+Style)$/.test(node.name.name) && node.value) markStyle(valuesOf(m, node.value));
      const [target, ...rest] = node.type === 'CallExpression' ? node.arguments : [];
      if (calleeName(node.callee || {}) === 'assign' && target?.type === 'MemberExpression' && memberKey(target) === 'style') rest.forEach((argument) => markStyle(valuesOf(m, argument)));
    });
  }
  const isStyleObject = (object) => styleObjects.has(object)
    || object.properties.filter((p) => p.type === 'Property' && (CSS_KEYS.has(keyName(p)) || cssRole(keyName(p)))).length >= 2;

  /* ---- custom properties: where each is read, defined, and given a dark value */
  const reads = new Map(); // name -> Set(role)
  const darkNames = new Set();
  const definitions = []; // light definitions with a written colour: { name, file, line, offset, hex }
  const pendingReads = []; // [role, value]: read once every dark definition is known
  const readCustom = (property, value) => {
    const role = cssRole(property);
    if (role && String(value).includes('var(')) pendingReads.push([role, String(value)]);
  };
  // var(--a, fallback) reads --a, and the fallback only where --a has no value:
  // not in dark when --a has a dark one.
  const takeReads = (role, text, gated) => {
    for (let i = text.indexOf('var('); i !== -1; i = text.indexOf('var(', i)) {
      const head = /^var\(\s*(--[\w-]+)\s*(,?)/.exec(text.slice(i));
      if (!head) { i += 4; continue; }
      let depth = 1;
      let j = i + head[0].length;
      for (; j < text.length && depth; j += 1) { if (text[j] === '(') depth += 1; else if (text[j] === ')') depth -= 1; }
      if (!gated) {
        if (!reads.has(head[1])) reads.set(head[1], new Set());
        reads.get(head[1]).add(role);
      }
      if (head[2]) takeReads(role, text.slice(i + head[0].length, j - 1), gated || darkNames.has(head[1]));
      i = j;
    }
  };
  const takeCss = (declarations, at, file, line) => {
    for (const declaration of declarations) {
      if (declaration.print) continue;
      if (!declaration.property.startsWith('--')) { readCustom(declaration.property, declaration.value); continue; }
      if (declaration.dark) { darkNames.add(declaration.property); continue; }
      if (file === 'src/theme/tokens.css') continue; // the themed tokens themselves
      for (const match of declaration.value.matchAll(HEX)) {
        const offset = at(declaration.offset + match.index);
        definitions.push({ name: declaration.property, file, line: line(offset), offset, hex: match[0] });
      }
    }
  };
  for (const sheet of stylesheets) takeCss(cssDeclarations(sheet.source), (i) => i, sheet.path, lineAt(sheet.source));
  const scriptSheets = []; // { m, node, css, declarations }
  for (const m of modules.values()) {
    m.nodes.forEach((node) => {
      if (node.type === 'Property' && node.kind === 'init') {
        const name = keyName(node);
        const v = node.value;
        if (name && !name.startsWith('--') && v.type === 'Literal' && typeof v.value === 'string') readCustom(name, v.value);
        if (name && !name.startsWith('--') && v.type === 'TemplateLiteral') readCustom(name, v.quasis.map((q) => q.value.raw).join(''));
      }
      if (node.type === 'TemplateLiteral' || (node.type === 'Literal' && typeof node.value === 'string' && node.value.length > 6)) {
        const css = scriptCss(m, node);
        if (!looksLikeCss(css.text)) return;
        // A bare declaration list (an inline style) is read inside a block.
        const declarations = cssDeclarations(`x{${css.text}}`).map((d) => ({ ...d, offset: d.offset - 2 }));
        scriptSheets.push({ m, node, css, declarations });
        takeCss(declarations, css.at, m.path, m.line);
      }
    });
  }

  for (const [role, value] of pendingReads) takeReads(role, value, false);

  /* ---- reaching a style */
  const findings = [];
  const counted = new Set();
  const record = (file, line, offset, hex, role, sink) => {
    onReach?.(file, offset, hex, role);
    if (direct.get(file)?.has(`${offset}:${role}`)) return;
    const hit = classifyThemeColor(hex, role);
    if (!hit) return;
    const id = `${file}:${offset}:${hit.token}`;
    if (counted.has(id)) return;
    counted.add(id);
    findings.push({ file, line, offset, hex: hex.toLowerCase(), role, token: hit.token, sink });
  };
  const reach = (m, expression, role, sink) => {
    for (const value of valuesOf(m, expression)) {
      const { n } = value;
      if (!n) continue;
      const vm = value.m;
      if (n.type === 'Literal' && typeof n.value === 'string') {
        const raw = vm.source.slice(n.start, n.end);
        if (/^['"]white['"]$/i.test(raw)) record(vm.path, vm.line(n.start), n.start + 1, 'white', role, sink);
        for (const match of raw.matchAll(HEX)) record(vm.path, vm.line(n.start + match.index), n.start + match.index, match[0], role, sink);
      } else if (n.type === 'TemplateLiteral') {
        const css = scriptCss(vm, n);
        // CSS text of its own is read where it declares (below); a value such
        // as `1px solid ${tone}` takes the role of the style it is.
        if (looksLikeCss(css.text)) continue;
        for (const quasi of n.quasis) {
          const raw = vm.source.slice(quasi.start, quasi.end);
          for (const match of raw.matchAll(HEX)) record(vm.path, vm.line(quasi.start + match.index), quasi.start + match.index, match[0], role, sink);
        }
        n.expressions.forEach((inner) => reach(vm, inner, role, sink));
      }
    }
  };
  const sinkAt = (m, node, property) => ({
    file: m.path, line: m.line(node.start), property,
    expression: m.source.slice(node.start, node.end).replace(/\s+/g, ' ').slice(0, 80),
  });
  const customRoles = (name) => (darkNames.has(name) ? [] : [...(reads.get(name) || [])]);

  for (const m of modules.values()) {
    m.nodes.forEach((node) => {
      if (node.type === 'Property' && node.kind === 'init' && !node.method) {
        const name = keyName(node);
        const object = m.parents.get(node);
        if (!name || object?.type !== 'ObjectExpression') return;
        if (name.startsWith('--')) { for (const role of customRoles(name)) reach(m, node.value, role, sinkAt(m, node.value, name)); return; }
        const role = cssRole(name);
        if (role && (name !== 'color' || isStyleObject(object))) reach(m, node.value, role, sinkAt(m, node.value, name));
      } else if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && node.left.object.type === 'MemberExpression' && memberKey(node.left.object) === 'style') {
        const name = memberKey(node.left);
        const role = name && cssRole(name);
        if (role) reach(m, node.right, role, sinkAt(m, node.right, name));
      } else if (node.type === 'CallExpression' && calleeName(node.callee) === 'setProperty') {
        const [name, value] = node.arguments;
        if (name?.type !== 'Literal' || typeof name.value !== 'string' || !value) return;
        const roles = name.value.startsWith('--') ? customRoles(name.value) : [cssRole(name.value)].filter(Boolean);
        for (const role of roles) reach(m, value, role, sinkAt(m, value, name.value));
      }
    });
  }
  // CSS a script writes: each ${…} in a colour declaration, and in a custom
  // property's definition that a colour declaration reads.
  for (const { m, css, declarations } of scriptSheets) {
    let slot = 0;
    const slotAt = [];
    for (let i = 0; i < css.text.length; i += 1) if (css.text[i] === SLOT) slotAt.push([i, slot++]);
    for (const declaration of declarations) {
      if (declaration.print) continue;
      const roles = declaration.property.startsWith('--') ? (declaration.dark ? [] : customRoles(declaration.property)) : [cssRole(declaration.property)].filter(Boolean);
      if (!roles.length) continue;
      const end = declaration.offset + declaration.value.length;
      for (const [at, index] of slotAt) {
        if (at < declaration.offset || at >= end) continue;
        const expression = css.slots[index];
        for (const role of roles) reach(m, expression, role, sinkAt(m, expression, declaration.property));
      }
    }
  }
  // Custom properties a stylesheet defines with a colour and never gives a
  // dark value: each read takes the light colour into dark.
  for (const definition of definitions) {
    for (const role of customRoles(definition.name)) {
      record(definition.file, definition.line, definition.offset, definition.hex, role, {
        file: definition.file, line: definition.line, property: definition.name, expression: `var(${definition.name}), which has no dark value`,
      });
    }
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.offset - b.offset || a.token.localeCompare(b.token));
};
