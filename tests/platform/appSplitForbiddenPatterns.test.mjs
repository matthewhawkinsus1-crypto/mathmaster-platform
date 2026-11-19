/*
 * WHAT IS FORBIDDEN IN APP.JSX IS FORBIDDEN IN EVERY MODULE APP'S CODE MOVED INTO.
 *
 * Some sixty checks in this suite refuse a pattern in all of App.jsx with
 * `assert.doesNotMatch(app, /…/)`: a write the browser must never make, a
 * module that must not join the first load, a reading of a field that was
 * retired. The App split moves App's code, verbatim, into hooks under
 * src/app/** that App calls. A check that reads App.jsx alone goes on
 * passing after the code it guarded has left the file, and would pass if the
 * forbidden thing were then written into the hook.
 *
 * Rather than repoint each of those checks by hand (and miss the next one
 * written), this reads every test file's own source, finds each pattern it
 * refuses in the whole of App.jsx, and refuses the same pattern in every hook
 * App imports from src/app and every control factory it calls through the
 * teacher kit (src/app/teacher/controls). A module's relative imports are read as App would
 * have written them (`../../platform/x.js` as `./platform/x.js`), so a check
 * that names an import path still bites.
 *
 * A pattern refused only in a region of App is not collected: it is bound to
 * that region, and moves with the test that names it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';
import { executableSource } from './helpers/sourceContract.mjs';
import { appHookPaths, appModulePaths } from './helpers/appScreens.mjs';

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// A hook's source with its relative module paths written from src/, as App.jsx writes them.
const asWrittenInApp = (path, source) => source.replace(
  /(\bfrom\s+|\bimport\(\s*)(['"])(\.{1,2}\/[^'"]+)\2/g,
  (whole, lead, quote, specifier) => {
    const fromSrc = posix.relative('src', posix.normalize(posix.join(posix.dirname(path), specifier)));
    return `${lead}${quote}${fromSrc.startsWith('.') ? fromSrc : `./${fromSrc}`}${quote}`;
  },
);

const children = (node) => {
  const found = [];
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((item) => item && typeof item.type === 'string' && found.push(item));
    else if (value && typeof value.type === 'string') found.push(value);
  }
  return found;
};

const callName = (node) => (node?.type !== 'CallExpression' ? null
  : node.callee.type === 'Identifier' ? node.callee.name
    : node.callee.type === 'MemberExpression' && !node.callee.computed ? node.callee.property.name : null);
const mentionsAppPath = (node, source) => /src\/App\.jsx|['"`]\.\.\/\.\.\/src\/App\.jsx|APP_PATH\b/.test(source.slice(node.start, node.end));

/**
 * The patterns a test file refuses in the whole of App.jsx:
 * [{ regex, executable, line }]. `executable` is true when the test strips
 * comments first (executableSource / stripComments), so a comment that spells
 * the pattern is not held against a hook either.
 */
export const forbiddenInApp = (path, source) => {
  const { parseSync } = require('vite');
  const result = parseSync(path, source, { lang: 'js', sourceType: 'module' });
  if (result.errors?.length) return [];
  // name -> 'raw' | 'executable', for variables that hold all of App.jsx.
  const holders = new Map();
  const kindOf = (init) => {
    if (!init) return null;
    if (init.type === 'AwaitExpression') return kindOf(init.argument);
    if (init.type === 'Identifier') return holders.get(init.name) || null;
    // `const app = () => executableSource(read('src/App.jsx'))`, read later as app().
    if (init.type === 'ArrowFunctionExpression' && init.params.length === 0 && init.body.type !== 'BlockStatement') return kindOf(init.body);
    if (init.type !== 'CallExpression') return null;
    const name = callName(init);
    if (init.callee.type === 'Identifier' && init.arguments.length === 0 && holders.has(name)) return holders.get(name);
    if (/^(executableSource|stripComments|withoutComments)$/.test(name || '')) return kindOf(init.arguments[0]) ? 'executable' : null;
    // App.jsx with the teacher workspace after it (helpers/appScreens.mjs): still all of App.jsx.
    if (name === 'appAndTeacherWorkspaceSource') return 'raw';
    const whole = mentionsAppPath(init, source) && !/[`'"]\s*\+|\$\{/.test(source.slice(init.start, init.end)) && init.arguments.length <= 2;
    // A plain read of the file: read('src/App.jsx'), readFileSync(new URL('../../src/App.jsx', …), 'utf8').
    if (whole && /^(read|readFileSync|readFile|readSource|source|load|componentSource)$/.test(name || '')) return 'raw';
    // The same, through a file's own comment-stripping reader.
    if (whole && /^(code|codeOf)$/.test(name || '')) return 'executable';
    return null;
  };
  const found = [];
  const lineOf = (position) => source.slice(0, position).split('\n').length;
  const visit = (node) => {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
      const kind = kindOf(node.init);
      if (kind) holders.set(node.id.name, kind); else holders.delete(node.id.name);
    }
    if (node.type === 'CallExpression' && callName(node) === 'doesNotMatch') {
      const [subject, pattern] = node.arguments;
      const kind = kindOf(subject);
      if (kind && pattern?.type === 'Literal' && pattern.regex) {
        found.push({ regex: new RegExp(pattern.regex.pattern, pattern.regex.flags.replace(/[gy]/g, '')), executable: kind === 'executable', line: lineOf(node.start) });
      }
    }
    for (const child of children(node)) visit(child);
  };
  visit(result.program);
  return found;
};

const testFiles = readdirSync(new URL('.', import.meta.url)).filter((name) => name.endsWith('.test.mjs')).sort();
const collected = testFiles.flatMap((name) => forbiddenInApp(`tests/platform/${name}`, read(`tests/platform/${name}`)).map((entry) => ({ ...entry, file: name })));

test('the collector finds the checks it is for, and leaves a region-scoped one alone', () => {
  const sample = `
    import { region, executableSource } from './helpers/sourceContract.mjs';
    const app = read('src/App.jsx');
    const code = executableSource(app);
    const other = read('src/QuestionEngine.jsx');
    test('x', () => {
      assert.doesNotMatch(app, /updateDoc\\(gradeRef/);
      assert.doesNotMatch(code, /legacyField/i, 'retired');
      assert.doesNotMatch(region(app, 'a', 'b'), /scoped/);
      assert.doesNotMatch(other, /elsewhere/);
      const inner = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
      assert.doesNotMatch(inner, /inner/);
      assert.doesNotMatch(app, new RegExp(name));
    });`;
  const found = forbiddenInApp('sample.test.mjs', sample);
  assert.deepEqual(found.map((entry) => [entry.regex.source, entry.executable]), [['updateDoc\\(gradeRef', false], ['legacyField', true], ['inner', false]]);
  assert.equal(found[1].regex.flags, 'i');
});

test('this suite refuses patterns in the whole of App.jsx, and App calls hooks to refuse them in', () => {
  // If either goes to zero the test below passes without checking anything.
  assert.ok(collected.length >= 60, `only ${collected.length} whole-App forbidden patterns were found: the collector no longer recognises how tests read App.jsx`);
  assert.ok(Object.keys(appHookPaths()).length >= 10);
});

test('no hook App calls contains a pattern a test refuses in App.jsx', () => {
  const hooks = appModulePaths().map((path) => {
    const source = asWrittenInApp(path, read(path));
    return { path, raw: source, executable: executableSource(source) };
  });
  const broken = [];
  for (const { regex, executable, file, line } of collected) {
    for (const hook of hooks) {
      // Held to code, not to a hook's comments: its header may name what it must not do.
      if (regex.test(hook.executable) || (!executable && regex.test(hook.raw) && regex.test(executableSource(hook.raw)))) {
        broken.push(`${hook.path} matches ${regex} (refused in App.jsx by tests/platform/${file}:${line})`);
      }
    }
  }
  assert.deepEqual(broken, [], 'Code that a test forbids in App.jsx is in a hook App runs. Moving it out of App.jsx does not make it allowed.');
});

test('a hook\'s import is read as App.jsx would have written it', () => {
  const rewritten = asWrittenInApp('src/app/student/useThing.js', "import { a } from '../../platform/x.js';\nimport b from './local.js';\nconst c = () => import('../lazyScreens.js');\nimport { useState } from 'react';");
  assert.equal(rewritten, "import { a } from './platform/x.js';\nimport b from './app/student/local.js';\nconst c = () => import('./app/lazyScreens.js');\nimport { useState } from 'react';");
});
