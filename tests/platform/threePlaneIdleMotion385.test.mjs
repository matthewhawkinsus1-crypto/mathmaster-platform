import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const source = readFileSync(new URL('../../src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../src/tools/systemsWorkspace/ThreePlaneWorkspace.css', import.meta.url), 'utf8');
const code = executableSource(source);

/*
 * WHEN THE MODEL MAY MOVE ON ITS OWN.
 *
 * The decisions themselves — off after interaction or under reduced motion,
 * finished once the budget is spent, paused while nobody can see the model —
 * are pure and tested in threePlaneGeometry.test.mjs. These contracts prove
 * the component is wired to them: the phase is computed from the real inputs,
 * the only animation loop starts only when that phase is 'running', and the
 * cue claims rotation only while the orbit is still to come.
 */

// The effect that owns the idle orbit's animation loop.
const orbitLoop = () => {
  const schedule = code.indexOf('window.requestAnimationFrame(tick)');
  assert.notEqual(schedule, -1, 'the idle orbit animates with requestAnimationFrame');
  const start = code.lastIndexOf('useEffect(', schedule);
  const end = code.indexOf('}, [', schedule);
  assert.ok(start !== -1 && end > schedule, 'the orbit loop lives in its own effect');
  return { start, end, body: code.slice(start, end) };
};

const orbitPhaseInputs = () => region(code, 'const orbitPhase = idleOrbitPhase({', '});', 'idle orbit phase inputs');

test('three-plane visualizer auto-rotates only before student interaction and respects reduced motion', () => {
  assert.match(source, /prefers-reduced-motion: reduce/);
  // The phase is decided from the student's first interaction and the
  // reduced-motion preference (idleOrbitPhase returns 'off' for either) ...
  const phase = orbitPhaseInputs();
  assert.match(phase, /\bhasInteracted(?:: hasInteracted)?,/);
  assert.match(phase, /\breduceMotion(?:: reduceMotion)?,/);
  // ... and the animation loop's first act is to stand down unless it is 'running'.
  const loop = orbitLoop();
  assert.match(loop.body, /^useEffect\(\(\) => \{\s*if \(orbitPhase !== 'running'[^\n]*\) return undefined;/);
  assert.match(code.slice(loop.end, loop.end + 40), /^\}, \[orbitPhase\]\);/, 'the loop restarts or stops whenever the phase changes');
  // There is no second, ungated way to animate the model.
  const requests = [...code.matchAll(/requestAnimationFrame\(/g)].map((match) => match.index);
  assert.ok(requests.length > 0 && requests.every((index) => index > loop.start && index < loop.end), 'every animation frame is requested by the gated orbit loop');
  assert.match(source, /markInteracted\(\);[\s\S]*setPointerCapture/);
  assert.match(source, /markInteracted\(\);[\s\S]*setVisiblePlanes/);
  assert.match(source, /markInteracted\(\); setRevealed\(true\)/);
});

test('the idle orbit stops for good once its budget is spent, leaving the camera where it is', () => {
  const loop = orbitLoop().body;
  // Each frame spends the budget, and the camera turns only by what was spent.
  assert.match(loop, /const frame = spendIdleOrbitFrame\(orbitShownMsRef\.current, /);
  assert.match(loop, /orbitShownMsRef\.current = frame\.spentMs;/);
  assert.match(loop, /setCamera\(\(current\) => advanceIdleCamera\(current, frame\.stepMs\)\)/);
  // A spent budget ends the loop before the next frame is requested, records
  // that it is over, and does not move the camera back.
  const spent = region(loop, 'if (frame.budgetSpent) {', 'frameId = window.requestAnimationFrame(tick);', 'budget spent branch');
  assert.match(spent, /setOrbitBudgetSpent\(true\);\s*return;\s*\}\s*$/);
  assert.doesNotMatch(spent, /setCamera/);
  // That record is what the phase reads, so the loop is not started again.
  assert.match(orbitPhaseInputs(), /budgetSpent: orbitBudgetSpent,/);
});

test('the idle orbit waits, unspent, while the model is off-screen or the page is hidden', () => {
  const phase = orbitPhaseInputs();
  assert.match(phase, /onScreen: modelOnScreen,/);
  assert.match(phase, /\bpageHidden(?:: pageHidden)?,/);
  // The model itself is observed, and its intersection is what "on screen" means.
  assert.match(region(code, '<svg', '>', 'model svg'), /ref=\{modelRef\}/);
  const observer = region(code, 'const model = modelRef.current;', 'return () => observer.disconnect();', 'model intersection observer');
  assert.match(observer, /new window\.IntersectionObserver\(/);
  assert.match(observer, /setModelOnScreen\(latest\.isIntersecting\)/);
  assert.match(observer, /observer\.observe\(model\);/);
  // Without an IntersectionObserver the model counts as on-screen: the budget alone bounds it.
  assert.match(observer, /typeof window\.IntersectionObserver !== 'function'\) return undefined;/);
  assert.match(code, /const \[modelOnScreen, setModelOnScreen\] = useState\(true\);/);
  // document.hidden is followed through visibilitychange.
  const visibility = region(code, 'const sync = () => setPageHidden(', "document.removeEventListener('visibilitychange', sync)", 'page visibility');
  assert.match(visibility, /^const sync = \(\) => setPageHidden\(document\.hidden === true\);/);
  assert.match(visibility, /document\.addEventListener\('visibilitychange', sync\);/);
});

test('the "Auto-rotating" cue is shown only while the orbit is still to come', () => {
  assert.match(code, /const orbitPending = idleOrbitPending\(orbitPhase\);/);
  const cue = region(code, '<div className={`mathmaster-threeplane-motion-cue', '</div>', 'motion cue');
  assert.match(cue, /^<div className=\{`mathmaster-threeplane-motion-cue\$\{orbitPending \? ' is-idle' : ''\}`\}>/);
  assert.match(cue, /\{orbitPending\s*\?\s*'Auto-rotating to show depth — drag the model to take control\.'\s*:\s*'Drag the model to rotate it\./);
  // Called, so imported: a missing import is a ReferenceError no build step reports.
  const geometryImport = code.match(/import \{([^}]*)\} from '\.\/threePlaneGeometry\.js';/);
  assert.ok(geometryImport, 'ThreePlaneWorkspace imports its geometry helpers');
  for (const name of ['advanceIdleCamera', 'idleOrbitPending', 'idleOrbitPhase', 'spendIdleOrbitFrame']) {
    assert.match(geometryImport[1], new RegExp(`\\b${name}\\b`), `${name} must be imported`);
  }
});

test('three-plane visualizer includes explicit depth and orientation cues', () => {
  assert.match(source, /cubeCorners\(R\)/);
  assert.match(source, /cubeEdges\(\)/);
  assert.match(source, /mathmaster-threeplane-frame-edge/);
  assert.match(source, /mathmaster-threeplane-axis-arrow/);
  assert.match(source, /mathmaster-threeplane-plane-label/);
  assert.match(source, /Auto-rotating to show depth/);
  assert.match(css, /\.mathmaster-threeplane-frame-edge/);
  assert.match(css, /\.mathmaster-threeplane-plane-label/);
});

test('idle rotation does not alter reveal timing', () => {
  assert.match(source, /const canReveal = !earnedResult && \(spatialModel\.revealSolution === true \|\| spatialModel\.allowSolutionReveal === true\)/);
  assert.match(source, /shownType !== 'unique' \|\| !showResult/);
});
