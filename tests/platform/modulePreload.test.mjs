/*
 * PRELOAD ONLY WHAT IS NOT ALREADY THERE (scripts/lib/modulePreload.mjs).
 *
 * Each import()'s preload list loses the files certainly fetched before the
 * chunk that calls it runs, and keeps every other file, in order. On the real
 * build this took about 8 KB gzip off a student's first load (mostly
 * app/lazyScreens.js's lists); nothing a page fetches changes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadedBeforeChunks, preloadOnlyWhatIsMissing, withoutLoaded } from '../../scripts/lib/modulePreload.mjs';

const chunk = (fileName, { imports = [], dynamicImports = [], isEntry = false } = {}) => (
  { type: 'chunk', fileName, imports, dynamicImports, isEntry }
);
// Shaped like the app: the sign-in entry loads App on demand; App's lazy
// screens load the Grades screen and a tool; a page reached from sign-in
// without App loads the same tool; the tool loads its help.
const BUNDLE = Object.fromEntries([
  chunk('index.js', { isEntry: true, imports: ['react.js'], dynamicImports: ['App.js', 'Standalone.js'] }),
  chunk('react.js'),
  chunk('App.js', { imports: ['react.js', 'firestore.js', 'lazyScreens.js'] }),
  chunk('firestore.js'),
  chunk('lazyScreens.js', { imports: ['react.js'], dynamicImports: ['Grades.js', 'Tool.js'] }),
  chunk('Grades.js', { imports: ['react.js', 'firestore.js', 'gradeModel.js'] }),
  chunk('gradeModel.js'),
  chunk('Standalone.js', { imports: ['react.js'], dynamicImports: ['Tool.js'] }),
  chunk('Tool.js', { imports: ['react.js', 'firestore.js', 'mathlive.js'], dynamicImports: ['Help.js'] }),
  chunk('mathlive.js'),
  chunk('Help.js', { imports: ['react.js', 'firestore.js', 'mathlive.js', 'helpText.js'] }),
  chunk('helpText.js'),
  // Nothing here loads it: credited with its own imports only.
  chunk('orphan.js', { imports: ['react.js'], dynamicImports: ['Help.js'] }),
  // Not a chunk: an emitted asset is never part of a closure.
  ['logo.svg', { type: 'asset', fileName: 'logo.svg' }],
].map((item) => (Array.isArray(item) ? item : [item.fileName, item])));

// The list Vite passes for an import() of `target`: its chunk and static
// imports, all the way down, without the calling chunk (and never a stylesheet).
const viteList = (target, host) => {
  const seen = [];
  const visit = (name) => {
    if (seen.includes(name) || name === host) return;
    seen.push(name);
    BUNDLE[name].imports.forEach(visit);
  };
  visit(target);
  return seen;
};

test('a chunk is credited with its own imports and what every way to it had loaded', () => {
  const loaded = loadedBeforeChunks(BUNDLE);
  const sorted = (name) => [...loaded.get(name)].sort();
  assert.deepEqual(sorted('index.js'), ['index.js', 'react.js'], 'an entry has only its own');
  assert.deepEqual(sorted('lazyScreens.js'), ['App.js', 'firestore.js', 'index.js', 'lazyScreens.js', 'react.js'],
    'a chunk App imports statically arrives with App\'s other imports');
  // Through lazyScreens App's Firestore is there; through Standalone it is
  // not, so only what both ways had counts (plus the tool's own imports).
  assert.deepEqual(sorted('Tool.js'), ['Tool.js', 'firestore.js', 'index.js', 'mathlive.js', 'react.js']);
  assert.deepEqual(sorted('orphan.js'), ['orphan.js', 'react.js']);
  assert.equal(loaded.has('logo.svg'), false);
});

test('each import() list drops only files already loaded, in Vite\'s order', () => {
  const loaded = loadedBeforeChunks(BUNDLE);
  const list = (host, target) => withoutLoaded(viteList(target, host), loaded.get(host));
  assert.deepEqual(list('index.js', 'App.js'), ['App.js', 'firestore.js', 'lazyScreens.js']);
  assert.deepEqual(list('lazyScreens.js', 'Grades.js'), ['Grades.js', 'gradeModel.js']);
  assert.deepEqual(list('lazyScreens.js', 'Tool.js'), ['Tool.js', 'mathlive.js']);
  assert.deepEqual(list('Standalone.js', 'Tool.js'), ['Tool.js', 'firestore.js', 'mathlive.js'],
    'reached without App, the tool still preloads Firestore');
  assert.deepEqual(list('Tool.js', 'Help.js'), ['Help.js', 'helpText.js'], 'whatever the tool imports is there before it runs');
  assert.deepEqual(list('orphan.js', 'Help.js'), ['Help.js', 'firestore.js', 'mathlive.js', 'helpText.js']);
  assert.deepEqual(withoutLoaded(['a.js', 'b.css'], null), ['a.js', 'b.css'], 'no answer for a host drops nothing');
});

test('the resolver Vite calls filters only a chunk\'s import() lists, and only once it has the bundle', () => {
  const preload = preloadOnlyWhatIsMissing();
  const deps = viteList('Grades.js', 'lazyScreens.js');
  const call = (hostId, hostType = 'js') => preload.resolveDependencies('Grades.js', deps, { hostId, hostType });
  preload.plugin.buildStart();
  assert.deepEqual(call('lazyScreens.js'), deps, 'before the bundle exists nothing is dropped');
  preload.plugin.generateBundle.handler({}, BUNDLE);
  assert.deepEqual(call('lazyScreens.js'), ['Grades.js', 'gradeModel.js']);
  // Vite names an HTML page by its path; whatever the name, its list stays whole.
  assert.deepEqual(call('lazyScreens.js', 'html'), deps, 'an HTML page\'s list is left whole');
  assert.deepEqual(call('unknown.js'), deps, 'a host not in the bundle drops nothing');
  assert.equal(preload.plugin.generateBundle.order, 'pre', 'it keeps the bundle before Vite writes the lists');
  assert.equal(preload.plugin.apply, 'build');
  // A new build forgets the last one's bundle.
  preload.plugin.buildStart();
  assert.deepEqual(call('lazyScreens.js'), deps);
});

test('the production build and the production-built harnesses use it', async () => {
  const configs = [
    ['vite.config.js', (exported) => (typeof exported === 'function' ? exported({ command: 'build', mode: 'production' }) : exported)],
    ['tests/browser/teacherWorkflow/vite.production.config.mjs', (exported) => exported],
    ['tests/browser/harnessProduction.config.mjs', (exported) => exported],
  ];
  for (const [file, resolve] of configs) {
    const config = resolve((await import(new URL(`../../${file}`, import.meta.url).href)).default);
    const plugin = config.plugins.flat().find((entry) => entry?.name === 'mathmaster:preload-only-what-is-missing');
    assert.ok(plugin, `${file}: the plugin that keeps the bundle`);
    const resolver = config.build?.modulePreload?.resolveDependencies;
    assert.equal(typeof resolver, 'function', `${file}: build.modulePreload.resolveDependencies`);
    // The two halves are one pair: the resolver reads the bundle its plugin kept.
    const deps = viteList('Grades.js', 'lazyScreens.js');
    plugin.buildStart();
    plugin.generateBundle.handler({}, BUNDLE);
    assert.deepEqual(resolver('Grades.js', deps, { hostId: 'lazyScreens.js', hostType: 'js' }), ['Grades.js', 'gradeModel.js'], `${file}: the resolver reads its own plugin's bundle`);
  }
});
