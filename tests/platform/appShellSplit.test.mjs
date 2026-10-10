/*
 * The App shell split (student push G): App.jsx's screens and concerns move
 * into src/app/** one slice at a time, behaviour unchanged.
 *
 * AGENTS.md's trap — a call with no import — is caught for every moved
 * identifier by lint: `no-undef` covers src/** (.oxlintrc.json), and src/app/**
 * also refuses the browser globals a moved name could silently fall back to
 * (`history`, `name`, `status`, `event`…), which no-undef cannot see. These
 * tests hold that configuration and each slice's seams in place.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const appCode = executableSource(app);

test('lint refuses free identifiers in App and every moved module, and browser-global fallbacks in src/app', () => {
  const config = JSON.parse(read('.oxlintrc.json'));
  const src = config.overrides.find((entry) => entry.files.includes('src/**'));
  assert.equal(src?.rules?.['no-undef'], 'error', 'no-undef must cover src/** (App.jsx and src/app/**)');
  const shell = config.overrides.find((entry) => entry.files.includes('src/app/**'));
  const [level, ...globals] = shell?.rules?.['no-restricted-globals'] || [];
  assert.equal(level, 'error');
  for (const name of ['history', 'location', 'name', 'status', 'event', 'length', 'open', 'close', 'top', 'parent', 'self', 'origin', 'confirm']) {
    assert.ok(globals.includes(name), `a moved \`${name}\` would silently read window.${name}`);
  }
});

const importedFrom = (module) => {
  const match = app.match(new RegExp(`import \\{([^}]*)\\} from '${module.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}';`));
  return match ? match[1].split(',').map((name) => name.trim()).filter(Boolean) : [];
};
const exportsOf = (path) => [...read(path).matchAll(/^export const ([A-Za-z0-9_$]+)/gm)].map((match) => match[1]);

test('every moved helper, scope table and lazy screen is imported by App and declared nowhere in it', () => {
  for (const [module, path] of [
    ['./app/student/assignmentRuntimeHelpers.js', 'src/app/student/assignmentRuntimeHelpers.js'],
    ['./app/screenScopes.js', 'src/app/screenScopes.js'],
    ['./app/lazyScreens.js', 'src/app/lazyScreens.js'],
  ]) {
    const exported = exportsOf(path);
    const imported = importedFrom(module);
    assert.ok(exported.length > 0, `${path} exports nothing`);
    assert.deepEqual([...imported].sort(), [...exported].sort(), `${module}: App imports exactly what the module exports`);
    for (const name of exported) {
      assert.doesNotMatch(appCode, new RegExp(`^\\s*(?:const|let|function) ${name}\\b`, 'm'), `${name} is declared in App.jsx as well`);
    }
  }
});

test('every screen in lazyScreens.js is a lazy import, so none joins the first load', () => {
  const screens = read('src/app/lazyScreens.js');
  const declarations = [...screens.matchAll(/^export const ([A-Za-z0-9]+) = (.*)$/gm)];
  assert.ok(declarations.length >= 30);
  for (const [, name, value] of declarations) {
    assert.match(value, /^lazy\(\(\) => import\('\.\.\/[^']+\.jsx'\)\);$/, `${name} is not a lazy import`);
  }
  assert.doesNotMatch(executableSource(screens), /^import (?!\{ lazy \} from 'react')/m, 'lazyScreens.js imports a screen eagerly');
});

test('the session gate renders for any screen that does not belong to the account signed in now', () => {
  assert.match(appCode, /if \(!userIsSignedInAccount\) \{\s*return \(\s*<SessionGate\b[\s\S]*?\/>\s*\);\s*\}/);
  assert.match(app, /^import SessionGate from '\.\/app\/shell\/SessionGate\.jsx';$/m);
  const gate = executableSource(read('src/app/shell/SessionGate.jsx'));
  assert.match(gate, /if \(authStatus === 'signedOut' \|\| authStatus === 'linking'\) return <LoginScreen launchAssignment=\{launchAssignment\} \/>;/);
  assert.match(gate, /^import LoginScreen from '\.\.\/\.\.\/LoginScreen\.jsx';$/m);
  assert.match(gate, /onClick=\{onSignOut\}/);
});

test('nothing under src/app imports App.jsx back (the shell depends on screens, never the reverse)', () => {
  const walk = (dir) => readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
  for (const file of walk('src/app')) {
    assert.doesNotMatch(read(file), /from '(?:\.\.\/)+App(?:\.jsx)?'/, `${file} imports App.jsx`);
  }
});
