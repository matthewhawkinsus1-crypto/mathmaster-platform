import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { shouldCompactAssignmentNavigation } from '../../src/platform/layout/assignmentNavigationChrome.js';

test('navigation compacts for active work and short landscape, not at the page introduction', () => {
  assert.equal(shouldCompactAssignmentNavigation({ viewportWidth: 1366, viewportHeight: 768, workTop: 300 }), true);
  assert.equal(shouldCompactAssignmentNavigation({ viewportWidth: 1366, viewportHeight: 768, workTop: 600 }), false);
  assert.equal(shouldCompactAssignmentNavigation({ viewportWidth: 844, viewportHeight: 390, workTop: 900 }), true);
});

test('App wires automatic compacting to the shared viewport policy', async () => {
  const source = await readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /import \{ shouldCompactAssignmentNavigation \} from '\.\/platform\/layout\/assignmentNavigationChrome\.js';/);
  const effect = source.slice(source.indexOf('const updateAssignmentNavigationChrome'), source.indexOf('}, [activeView, activeAssignmentId]);'));
  assert.match(effect, /querySelector\('\[data-work-view-focus="true"\]'\)/);
  assert.match(effect, /shouldCompactAssignmentNavigation\(\{/);
  assert.match(effect, /window\.addEventListener\('scroll', updateAssignmentNavigationChrome/);
});

test('compact controls retain keyboard semantics and touch-sized short-landscape targets', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/App.css', import.meta.url), 'utf8'),
  ]);
  const compact = app.slice(app.indexOf('mathmaster-collapsed-current-location'), app.indexOf("{!assignmentNavigationCollapsed && (", app.indexOf('mathmaster-collapsed-current-location')));
  assert.match(compact, /aria-label="Previous question"/);
  assert.match(compact, /aria-label="Choose a question"/);
  assert.match(compact, /aria-label="Next question"/);
  const touchTargets = css.slice(css.indexOf('/* Automatic compact mode must save rows'));
  assert.match(touchTargets, /is-collapsed[\s\S]*min-height: 44px;/);
});
