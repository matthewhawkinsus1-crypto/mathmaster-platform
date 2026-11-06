/*
 * WHO RELEASES EACH REAL-TIME LISTENER (listenerLifecycleGuard.test.mjs).
 *
 * A Firestore listener (`onSnapshot`) or a `watch…`/`subscribe…` subscription
 * returns the function that closes it. The listener is owned only when that
 * function goes somewhere that will call it:
 *
 *   - returned by a useEffect callback: React calls it as the cleanup;
 *   - returned by a function named watch…/subscribe…: its caller owns it, and
 *     every call of such a function is held to this same rule;
 *   - returned by a callback that a documented owner calls (the owner keeps it
 *     and releases it; the guard's test names each one and checks it);
 *   - kept in a local that the SAME effect's or function's cleanup calls or
 *     returns, directly or through a local function that cleanup calls;
 *   - mapped into (or pushed onto) an array that that cleanup releases with
 *     forEach or for…of.
 *
 * "The same effect's or function's cleanup": the owner is the nearest effect
 * callback or watch…/subscribe… function around the call, and its cleanups are
 * the functions it returns. Names are resolved by scope with a real parser
 * (rolldown's oxc parseAst, already a Vite dependency), so another effect's
 * `unsubscribe()` later in the same file releases nothing here. The guard used
 * to search the rest of the file for `name()`, and App.jsx alone has a dozen
 * effects whose listener is called `unsubscribe`: any one of them could have
 * dropped its cleanup unseen.
 */
import { parseAst } from 'rolldown/parseAst';

export const SUBSCRIPTION_NAME = /^(?:onSnapshot|(?:watch|subscribe)[A-Z]\w*)$/;
const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
const FUNCTION = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);
const SCOPE = new Set([...FUNCTION, 'Program', 'BlockStatement', 'StaticBlock', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'CatchClause', 'SwitchStatement']);
// How many local functions a release may pass through (`release = () => stop()`,
// then the cleanup calls `release`) before the guard stops following it.
const MAX_HOPS = 4;

const isNode = (value) => Boolean(value) && typeof value === 'object' && typeof value.type === 'string';
const unchain = (node) => (node?.type === 'ChainExpression' || node?.type === 'ParenthesizedExpression' ? unchain(node.expression) : node);

const calleeName = (callee) => {
  const target = unchain(callee);
  if (target?.type === 'Identifier') return target.name;
  if (target?.type === 'MemberExpression' && !target.computed && target.property?.type === 'Identifier') return target.property.name;
  return null;
};

const patternNames = (pattern, out = []) => {
  if (!pattern) return out;
  if (pattern.type === 'Identifier') out.push(pattern.name);
  else if (pattern.type === 'ObjectPattern') pattern.properties.forEach((p) => patternNames(p.type === 'RestElement' ? p.argument : p.value, out));
  else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((e) => patternNames(e, out));
  else if (pattern.type === 'AssignmentPattern') patternNames(pattern.left, out);
  else if (pattern.type === 'RestElement') patternNames(pattern.argument, out);
  return out;
};

const statementNames = (statement, out) => {
  const declaration = /^Export(?:Named|Default)Declaration$/.test(statement?.type) ? statement.declaration : statement;
  if (!declaration) return out;
  if (declaration.type === 'VariableDeclaration') declaration.declarations.forEach((d) => patternNames(d.id, out));
  else if ((declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') && declaration.id) out.push(declaration.id.name);
  else if (declaration.type === 'ImportDeclaration') declaration.specifiers.forEach((s) => out.push(s.local.name));
  return out;
};

/**
 * Every subscription call in `source`, with whether it is owned:
 * `{ calls: [{ name, line, owned, why, documentedOwner? }] }`.
 * `documentedOwners` maps `owner.key` (a call `owner({ key: (…) => listener })`)
 * to the reason the owner releases what that callback returns.
 */
export const analyzeListenerOwnership = (source, { documentedOwners = {} } = {}) => {
  const ast = parseAst(source, { lang: 'jsx', preserveParens: false });
  const lineOf = (pos) => source.slice(0, pos).split('\n').length;

  const parentOf = new Map();
  const subscriptions = [];
  const callsByName = new Map();      // name -> [CallExpression whose callee is that bare name]
  const returnsByName = new Map();    // name -> [ReturnStatement | arrow body] returning that bare name
  const arrayReleasesByName = new Map(); // name -> [forEach call | for…of] calling each element
  const valuesByName = new Map();     // name -> [{ id, fn }] a function stored under that name
  const returnsOf = new Map();        // function -> [ReturnStatement]
  const add = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };

  const enclosingFunction = (node) => {
    for (let up = parentOf.get(node); up; up = parentOf.get(up)) if (FUNCTION.has(up.type)) return up;
    return null;
  };

  const callsItsFirstParam = (fn) => {
    const param = fn?.params?.[0];
    if (!FUNCTION.has(fn?.type) || param?.type !== 'Identifier') return false;
    let found = false;
    const look = (node) => {
      if (found || !isNode(node)) return;
      if (node.type === 'CallExpression' && unchain(node.callee)?.type === 'Identifier' && unchain(node.callee).name === param.name) { found = true; return; }
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (Array.isArray(value)) value.forEach(look);
        else look(value);
      }
    };
    look(fn.body);
    return found;
  };

  const visit = (node, up) => {
    parentOf.set(node, up);
    if (node.type === 'CallExpression') {
      const name = calleeName(node.callee);
      const callee = unchain(node.callee);
      if (name && SUBSCRIPTION_NAME.test(name)) subscriptions.push(node);
      if (callee?.type === 'Identifier') add(callsByName, callee.name, node);
      if (callee?.type === 'MemberExpression' && !callee.computed && callee.object?.type === 'Identifier') {
        if (callee.property.name === 'forEach' && callsItsFirstParam(node.arguments[0])) add(arrayReleasesByName, callee.object.name, node);
      }
    }
    if (node.type === 'ReturnStatement' && node.argument?.type === 'Identifier') add(returnsByName, node.argument.name, node);
    if (node.type === 'ArrowFunctionExpression' && node.expression && node.body?.type === 'Identifier') add(returnsByName, node.body.name, node.body);
    if (node.type === 'ForOfStatement' && node.right?.type === 'Identifier' && node.left?.type === 'VariableDeclaration') {
      const [element] = patternNames(node.left.declarations[0]?.id);
      if (element && callsItsFirstParam({ type: 'ArrowFunctionExpression', params: [{ type: 'Identifier', name: element }], body: node.body })) add(arrayReleasesByName, node.right.name, node);
    }
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && FUNCTION.has(node.init?.type)) add(valuesByName, node.id.name, { id: node.id, fn: node.init });
    if (node.type === 'AssignmentExpression' && node.operator === '=' && node.left?.type === 'Identifier' && FUNCTION.has(node.right?.type)) add(valuesByName, node.left.name, { id: node.left, fn: node.right });
    if (node.type === 'FunctionDeclaration' && node.id) add(valuesByName, node.id.name, { id: node.id, fn: node });
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (Array.isArray(value)) value.forEach((child) => { if (isNode(child)) visit(child, node); });
      else if (isNode(value)) visit(value, node);
    }
  };
  visit(ast, null);
  parentOf.forEach((up, node) => {
    if (node.type === 'ReturnStatement') {
      const fn = enclosingFunction(node);
      if (fn) add(returnsOf, fn, node);
    }
  });

  // Scope: the node that declares `name` as seen from `from` (null: a global).
  const declaredBy = new Map();
  const namesDeclaredBy = (scope) => {
    if (declaredBy.has(scope)) return declaredBy.get(scope);
    const names = [];
    if (FUNCTION.has(scope.type)) {
      scope.params.forEach((p) => patternNames(p, names));
      if (scope.type === 'FunctionExpression' && scope.id) names.push(scope.id.name);
    } else if (scope.type === 'Program' || scope.type === 'BlockStatement' || scope.type === 'StaticBlock') {
      scope.body.forEach((s) => statementNames(s, names));
    } else if (scope.type === 'ForStatement') statementNames(scope.init, names);
    else if (scope.type === 'ForInStatement' || scope.type === 'ForOfStatement') statementNames(scope.left, names);
    else if (scope.type === 'CatchClause') patternNames(scope.param, names);
    else if (scope.type === 'SwitchStatement') scope.cases.forEach((c) => c.consequent.forEach((s) => statementNames(s, names)));
    const set = new Set(names);
    declaredBy.set(scope, set);
    return set;
  };
  const scopeOf = (identifier) => {
    for (let up = parentOf.get(identifier); up; up = parentOf.get(up)) {
      if (SCOPE.has(up.type) && namesDeclaredBy(up).has(identifier.name)) return up;
    }
    return null;
  };
  const bindingOf = (identifier) => {
    const scope = scopeOf(identifier);
    return scope ? { scope, name: identifier.name } : null;
  };
  const sameBinding = (identifier, binding) => identifier.name === binding.name && scopeOf(identifier) === binding.scope;
  const identifierOfSite = (site) => {
    if (site.type === 'CallExpression') return unchain(site.callee).type === 'Identifier' ? unchain(site.callee) : unchain(site.callee).object;
    if (site.type === 'ReturnStatement') return site.argument;
    if (site.type === 'ForOfStatement') return site.right;
    return site; // an arrow's expression body
  };
  const sitesOf = (map, binding) => (map.get(binding.name) || []).filter((site) => sameBinding(identifierOfSite(site), binding));

  const isEffectCallback = (fn) => {
    const up = parentOf.get(fn);
    return up?.type === 'CallExpression' && up.arguments[0] === fn && EFFECT_HOOKS.has(calleeName(up.callee));
  };
  const isMapCallback = (fn) => {
    const up = parentOf.get(fn);
    return up?.type === 'CallExpression' && up.arguments[0] === fn && calleeName(up.callee) === 'map' && unchain(up.callee).type === 'MemberExpression';
  };
  // The name a function is stored or declared under, if any.
  const holderName = (fn) => {
    if (fn.type !== 'ArrowFunctionExpression' && fn.id) return fn.id.name;
    const up = parentOf.get(fn);
    if (up?.type === 'VariableDeclarator' && up.init === fn && up.id.type === 'Identifier') return up.id.name;
    if (up?.type === 'AssignmentExpression' && up.right === fn) return up.left.type === 'Identifier' ? up.left.name : calleeName(up.left);
    if ((up?.type === 'Property' || up?.type === 'MethodDefinition' || up?.type === 'PropertyDefinition') && up.value === fn && !up.computed) return up.key?.name ?? null;
    return null;
  };
  const isSubscriptionFunction = (fn) => SUBSCRIPTION_NAME.test(holderName(fn) || '');
  // The local a function is stored in (`release = () => stop()`), if any.
  const holderBinding = (fn) => {
    const up = parentOf.get(fn);
    if (up?.type === 'VariableDeclarator' && up.init === fn && up.id.type === 'Identifier') return bindingOf(up.id);
    if (up?.type === 'AssignmentExpression' && up.right === fn && up.operator === '=' && up.left.type === 'Identifier') return bindingOf(up.left);
    if (fn.type === 'FunctionDeclaration' && fn.id) return bindingOf(fn.id);
    return null;
  };
  const describe = (fn) => {
    const name = holderName(fn);
    if (name) return `${name}()`;
    const up = parentOf.get(fn);
    if (up?.type === 'CallExpression') return `a callback passed to ${calleeName(up.callee) || 'a call'}()`;
    return 'an inline function';
  };

  const ownerOf = (node) => {
    for (let fn = enclosingFunction(node); fn; fn = enclosingFunction(fn)) {
      if (isEffectCallback(fn) || isSubscriptionFunction(fn)) return fn;
    }
    return null;
  };

  // The functions an owner returns: its cleanups.
  const cleanupCache = new Map();
  const cleanupsOf = (owner) => {
    if (cleanupCache.has(owner)) return cleanupCache.get(owner);
    const cleanups = new Set();
    const collect = (expression) => {
      const value = unchain(expression);
      if (!value) return;
      if (FUNCTION.has(value.type)) cleanups.add(value);
      else if (value.type === 'ConditionalExpression') { collect(value.consequent); collect(value.alternate); }
      else if (value.type === 'LogicalExpression') { collect(value.left); collect(value.right); }
      else if (value.type === 'Identifier') {
        const binding = bindingOf(value);
        if (binding) (valuesByName.get(value.name) || []).filter(({ id }) => sameBinding(id, binding)).forEach(({ fn }) => cleanups.add(fn));
      }
    };
    if (owner.type === 'ArrowFunctionExpression' && owner.expression) collect(owner.body);
    (returnsOf.get(owner) || []).forEach((statement) => collect(statement.argument));
    cleanupCache.set(owner, cleanups);
    return cleanups;
  };

  // Does `site` run when the owner's cleanup runs? It does when a function
  // around it is one of the owner's cleanups, or is kept in a local that is
  // itself released from one.
  const runsOnCleanup = (site, owner, hops) => {
    for (let fn = enclosingFunction(site); fn && fn !== owner; fn = enclosingFunction(fn)) {
      if (cleanupsOf(owner).has(fn)) return true;
      const holder = holderBinding(fn);
      if (holder && hops < MAX_HOPS && isReleased(holder, owner, hops + 1, false)) return true;
    }
    return false;
  };
  const isReleased = (binding, owner, hops, array) => {
    if (array) return sitesOf(arrayReleasesByName, binding).some((site) => runsOnCleanup(site, owner, hops));
    // Returned by the owner itself: it IS the cleanup (`return unsubscribe;`).
    if (sitesOf(returnsByName, binding).some((site) => enclosingFunction(site) === owner)) return true;
    return sitesOf(callsByName, binding).some((site) => runsOnCleanup(site, owner, hops));
  };

  const owned = (why) => ({ owned: true, why });
  const unowned = (why) => ({ owned: false, why });

  const kept = (identifier, owner, array) => {
    const binding = bindingOf(identifier);
    const what = array ? `the array ${identifier.name}` : identifier.name;
    if (!binding) return unowned(`kept in ${what}, which is not declared here`);
    if (!owner) return unowned(`kept in ${what} outside any effect or watch…/subscribe… function, so no cleanup releases it`);
    return isReleased(binding, owner, 0, array)
      ? owned(`released by its own cleanup (${what})`)
      : unowned(`never released by its own effect's or function's cleanup: ${what}`);
  };

  const returnedFrom = (fn, owner, array) => {
    if (!fn) return unowned('returned at the top level');
    if (isEffectCallback(fn)) return array ? unowned('an array of listeners returned as an effect cleanup') : owned('the effect cleanup');
    if (!array && isMapCallback(fn)) return follow(parentOf.get(fn), owner, true);
    if (!array && isSubscriptionFunction(fn)) return owned(`returned to the caller of ${holderName(fn)}()`);
    const up = parentOf.get(fn);
    const object = up?.type === 'Property' && up.value === fn ? parentOf.get(up) : null;
    const call = object ? parentOf.get(object) : null;
    if (!array && call?.type === 'CallExpression' && call.arguments.includes(object)) {
      const key = `${calleeName(call.callee)}.${up.key?.name}`;
      if (Object.hasOwn(documentedOwners, key)) return { ...owned(`returned to its documented owner, ${key}`), documentedOwner: key };
    }
    return unowned(`returned from ${describe(fn)}, where nothing releases it`);
  };

  // Where does the value of `node` (a listener, or an array of them) go?
  const follow = (node, owner, array) => {
    let value = node;
    let up = parentOf.get(value);
    while (up && (
      up.type === 'ChainExpression' || up.type === 'ParenthesizedExpression'
      || (up.type === 'ConditionalExpression' && up.test !== value)
      || (up.type === 'LogicalExpression' && up.right === value)
      || (up.type === 'SequenceExpression' && up.expressions.at(-1) === value)
    )) {
      value = up;
      up = parentOf.get(up);
    }
    if (up?.type === 'ReturnStatement') return returnedFrom(enclosingFunction(up), owner, array);
    if (up?.type === 'ArrowFunctionExpression' && up.body === value) return returnedFrom(up, owner, array);
    if (up?.type === 'VariableDeclarator' && up.init === value && up.id.type === 'Identifier') return kept(up.id, owner, array);
    if (up?.type === 'AssignmentExpression' && up.right === value && up.operator === '=' && up.left.type === 'Identifier') return kept(up.left, owner, array);
    const pushTo = up?.type === 'CallExpression' && up.arguments.includes(value) && calleeName(up.callee) === 'push' ? unchain(up.callee).object : null;
    if (!array && pushTo?.type === 'Identifier') return kept(pushTo, owner, true);
    return unowned(array ? 'an array of listeners that nothing keeps' : 'unowned: its unsubscribe is dropped');
  };

  const calls = subscriptions.map((call) => {
    const callee = unchain(call.callee);
    const at = callee.type === 'MemberExpression' ? callee.property.start : callee.start;
    return { name: calleeName(call.callee), line: lineOf(at), ...follow(call, ownerOf(call), false) };
  });
  return { calls };
};
