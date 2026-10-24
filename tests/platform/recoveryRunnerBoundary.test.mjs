// RC09: the Recovery runner's own error boundary, and its "Recovery is open"
// notice keyed by student.
//
// A render error inside SectionRecoveryRunner reached AppErrorBoundary, which
// replaces the whole student app. ScreenErrorBoundary keeps the error on that
// screen with its way back; a chunk that could not load still goes on to the
// app boundary, which offers the new version. And the notice cache was one
// Set for the whole tab, so the next student on a shared Chromebook never
// heard about their own Recovery.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

test('a screen error stays on its screen, with its way out; a missing chunk goes on to the app', async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: ScreenErrorBoundary } = await server.ssrLoadModule('/src/components/common/ScreenErrorBoundary.jsx');
    let exited = 0;
    const boundary = new ScreenErrorBoundary({
      source: 'section-recovery', title: 'Recovery could not open', message: 'Go back.', exitLabel: 'Back to your results', onExit: () => { exited += 1; }, children: 'the runner',
    });
    boundary.setState = (next) => { boundary.state = { ...boundary.state, ...next }; };
    assert.equal(boundary.render(), 'the runner', 'no error: the screen itself');
    const error = new Error('runner broke');
    boundary.state = ScreenErrorBoundary.getDerivedStateFromError(error);
    const panel = boundary.render();
    assert.equal(panel.props.title, 'Recovery could not open');
    assert.equal(panel.props.primaryLabel, 'Back to your results');
    assert.equal(panel.props.technicalMessage, 'runner broke');
    panel.props.onPrimary();
    assert.equal(exited, 1, 'its way out runs');
    assert.equal(boundary.state.error, null, 'and the screen can open again');
    // A chunk that could not load is the app's to handle (a new version).
    const chunk = new TypeError('Failed to fetch dynamically imported module: /assets/SectionRecoveryRunner-abc.js');
    boundary.state = ScreenErrorBoundary.getDerivedStateFromError(chunk);
    assert.throws(() => boundary.render(), /dynamically imported module/);
  } finally {
    await server.close();
  }
});

test('App wraps the Recovery runner in it, and keys the Recovery notice by student', () => {
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  const runner = region(app, '<ScreenErrorBoundary', '</ScreenErrorBoundary>', 'the Recovery runner mount');
  assert.match(runner, /^<ScreenErrorBoundary \{\.\.\.recoveryBoundary\} onExit=\{\(\) => setRecoverySession\(null\)\}>/);
  assert.match(runner, /<SectionRecoveryRunner/);
  assert.match(region(app, 'const recoveryBoundary = {', '};', 'its words'), /source: 'section-recovery',[\s\S]*exitLabel: 'Back to your results',/);
  assert.match(app, /!recoveryAnnouncedRef\.current\.has\(`\$\{user\.id\}:\$\{opportunity\.noticeKey\}`\)/);
  assert.match(app, /recoveryAnnouncedRef\.current\.add\(`\$\{user\.id\}:\$\{opportunity\.noticeKey\}`\)/);
});
