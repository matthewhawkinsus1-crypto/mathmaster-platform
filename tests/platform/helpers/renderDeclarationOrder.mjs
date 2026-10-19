/*
 * WHAT App() READS WHILE IT RENDERS, BEFORE THE LINE THAT DECLARES IT.
 *
 * App.jsx is one function of ~12k lines whose render flow is a sequence of
 * `const`s and early returns. A `const` read on the render path above its own
 * declaration is a TDZ ReferenceError that only fires when that branch renders
 * — the lint gate (oxlint) has no no-use-before-define, the build does not
 * evaluate it, and every screen harness mounts components, not App. Commit
 * 0456367 shipped exactly this on the student result page
 * (`recoveryAssignment`), crashing it for every student.
 *
 * This walks App()'s body with a real parser (rolldown's oxc parseAst, already
 * a Vite dependency) and reports every identifier evaluated NOW — in a
 * render-path statement, a useMemo/useState initializer, an IIFE, or (with
 * followCalls) a hoisted function or arrow const the render path calls — that
 * resolves to a const/let in App's render scopes declared later. Event
 * handlers and other deferred closures are skipped: they run after render.
 */
import { parseAst } from 'rolldown/parseAst';

export const scanRenderTdz = (source, { followCalls = false } = {}) => {
  const ast = parseAst(source, { lang: 'jsx' });
  const app = ast.body.find((node) => node.type === 'FunctionDeclaration' && node.id?.name === 'App')
    || ast.body.find((node) => node.type === 'ExportDefaultDeclaration' && node.declaration?.id?.name === 'App')?.declaration;
  if (!app) throw new Error('App() not found');
  const lineOf = (pos) => source.slice(0, pos).split('\n').length;
  const FUNCTION = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);
  const EAGER_HOOKS = new Set(['useMemo', 'useState', 'useReducer']);
  const findings = [];
  const seen = new Set();

  const patternNames = (pattern, out = []) => {
    if (!pattern) return out;
    if (pattern.type === 'Identifier') out.push(pattern.name);
    else if (pattern.type === 'ObjectPattern') pattern.properties.forEach((p) => patternNames(p.type === 'RestElement' ? p.argument : p.value, out));
    else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((e) => patternNames(e, out));
    else if (pattern.type === 'AssignmentPattern') patternNames(pattern.left, out);
    else if (pattern.type === 'RestElement') patternNames(pattern.argument, out);
    return out;
  };
  // Every name bound anywhere inside a function (params and declarations): such
  // a name inside it never refers to the render scope.
  const boundInside = (fn) => {
    const names = new Set();
    fn.params.forEach((p) => patternNames(p).forEach((n) => names.add(n)));
    const walk = (node) => {
      if (!node || typeof node.type !== 'string') return;
      if (node.type === 'VariableDeclarator') patternNames(node.id).forEach((n) => names.add(n));
      if (node.type === 'FunctionDeclaration' && node.id) names.add(node.id.name);
      if (node.type === 'CatchClause' && node.param) patternNames(node.param).forEach((n) => names.add(n));
      if (FUNCTION.has(node.type) && node !== fn) node.params.forEach((p) => patternNames(p).forEach((n) => names.add(n)));
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === 'object' && typeof value.type === 'string') walk(value);
      }
    };
    walk(fn.body);
    return names;
  };

  // scopes: [{ decls: Map(name -> {start, node}), fns: Map(name -> fnNode) }], innermost last
  const resolve = (scopes, name) => {
    for (let i = scopes.length - 1; i >= 0; i -= 1) if (scopes[i].decls.has(name)) return scopes[i].decls.get(name);
    return null;
  };
  const resolveFn = (scopes, name) => {
    for (let i = scopes.length - 1; i >= 0; i -= 1) if (scopes[i].fns.has(name)) return scopes[i].fns.get(name);
    return null;
  };

  const scopeOf = (statements) => {
    const decls = new Map();
    const fns = new Map();
    statements.forEach((statement) => {
      if (statement.type === 'VariableDeclaration' && statement.kind !== 'var') {
        statement.declarations.forEach((d) => {
          patternNames(d.id).forEach((n) => decls.set(n, { start: statement.start, end: statement.end }));
          if (d.init && FUNCTION.has(d.init.type) && d.id.type === 'Identifier') fns.set(d.id.name, d.init);
        });
      }
      if (statement.type === 'FunctionDeclaration' && statement.id) fns.set(statement.id.name, statement);
    });
    return { decls, fns };
  };

  // Walk an expression/statement evaluated NOW at time `at` (a source position
  // standing for "everything declared before here has run").
  const visit = (node, scopes, at, shadowed, via) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'Identifier') {
      if (shadowed.has(node.name)) return;
      const decl = resolve(scopes, node.name);
      if (decl && decl.start > at) {
        const key = `${node.name}@${node.start}`;
        if (!seen.has(key)) {
          seen.add(key);
          findings.push({ name: node.name, line: lineOf(node.start), declaredLine: lineOf(decl.start), via });
        }
      }
      return;
    }
    if (FUNCTION.has(node.type)) return; // deferred: runs later, not now
    if (node.type === 'BlockStatement' && !via.length) { visitBlock(node.body, scopes, shadowed, via); return; }
    if (node.type === 'CallExpression') {
      const callee = node.callee;
      const hookName = callee.type === 'Identifier' ? callee.name : null;
      // Eager callbacks: useMemo(fn), useState(fn), IIFEs.
      const eagerFns = [];
      if (EAGER_HOOKS.has(hookName) && node.arguments[0] && FUNCTION.has(node.arguments[0].type)) eagerFns.push(node.arguments[0]);
      if (FUNCTION.has(callee.type)) eagerFns.push(callee);
      if (followCalls && callee.type === 'Identifier') {
        const fn = resolveFn(scopes, callee.name);
        if (fn && !via.includes(callee.name)) {
          const fnShadow = new Set([...shadowed, ...boundInside(fn)]);
          const body = fn.body.type === 'BlockStatement' ? fn.body : { type: 'ExpressionStatement', expression: fn.body };
          visitFnBody(body, scopes, at, fnShadow, [...via, callee.name]);
        }
      }
      for (const fn of eagerFns) {
        const fnShadow = new Set([...shadowed, ...boundInside(fn)]);
        const body = fn.body.type === 'BlockStatement' ? fn.body : { type: 'ExpressionStatement', expression: fn.body };
        visitFnBody(body, scopes, at, fnShadow, via);
      }
      if (!FUNCTION.has(callee.type)) visit(callee, scopes, at, shadowed, via);
      node.arguments.forEach((arg) => { if (!eagerFns.includes(arg)) visit(arg, scopes, at, shadowed, via); });
      return;
    }
    if (node.type === 'MemberExpression') { visit(node.object, scopes, at, shadowed, via); if (node.computed) visit(node.property, scopes, at, shadowed, via); return; }
    if (node.type === 'Property') { if (node.computed) visit(node.key, scopes, at, shadowed, via); visit(node.value, scopes, at, shadowed, via); return; }
    if (node.type === 'VariableDeclarator') { visit(node.init, scopes, at, shadowed, via); return; }
    if (node.type === 'LabeledStatement' || node.type === 'BreakStatement' || node.type === 'ContinueStatement') return;
    if (node.type === 'JSXAttribute') { visit(node.value, scopes, at, shadowed, via); return; }
    if (node.type === 'JSXOpeningElement' || node.type === 'JSXClosingElement') {
      (node.attributes || []).forEach((a) => visit(a, scopes, at, shadowed, via));
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach((v) => visit(v, scopes, at, shadowed, via));
      else if (value && typeof value === 'object' && typeof value.type === 'string') visit(value, scopes, at, shadowed, via);
    }
  };
  // A called function's body: its own statements see the caller's time `at`
  // for outer names; its own locals are shadowed.
  const visitFnBody = (block, scopes, at, shadowed, via) => {
    const statements = block.type === 'BlockStatement' ? block.body : [block];
    statements.forEach((statement) => visit(statement, scopes, at, shadowed, via.length ? via : ['(eager callback)']));
  };
  const visitBlock = (statements, outerScopes, shadowed, via) => {
    const scope = scopeOf(statements);
    const scopes = [...outerScopes, scope];
    const inner = new Set([...shadowed].filter((n) => !scope.decls.has(n)));
    statements.forEach((statement) => visit(statement, scopes, statement.start, inner, via));
  };
  visitBlock(app.body.body, [], new Set(), []);
  return findings;
};
