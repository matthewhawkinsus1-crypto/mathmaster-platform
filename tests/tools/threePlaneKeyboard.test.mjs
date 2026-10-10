import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import systemsWorkspaceGrader from '../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import {
  KEY_ROTATE_PIXELS,
  KEY_ROTATE_PIXELS_LARGE,
  MAX_ELEVATION,
  MIN_ELEVATION,
  choiceKeyTarget,
  choiceTabStop,
  dragCamera,
  keyRotateCamera,
  recordChoice,
  viewAngleText,
} from '../../src/tools/systemsWorkspace/threePlaneControls.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * THREE-PLANE WORKSPACE BY KEYBOARD (KEYBOARD_SWEEP T2 + T7 + T8).
 *
 *   T2  the 3D model rotates by arrow keys through the drag's own mapping —
 *       an arrow press is exactly the drag it stands for, clamped the same —
 *       and rotation is view state only: it never reaches the graded work.
 *   T7  the interpretation choices are a real radiogroup. An arrow key
 *       records the option through the same recordChoice a click uses, so
 *       the responses, the work and the shared grader's verdict reached by
 *       keys are identical to the ones reached by clicking.
 *   T8  no outline: none in the tool's CSS.
 *
 * The browser half (keys only, both viewports) is
 * tests/browser/toolKeyboardThreePlane.mjs.
 */

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const component = executableSource(read('src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx'));
const css = read('src/tools/systemsWorkspace/ThreePlaneWorkspace.css');

// The drag's mapping as it was written inline before the extraction, verbatim.
const LEGACY_DRAG = (start, dx, dy) => ({
  azimuth: start.azimuth + dx * 0.01,
  elevation: Math.max(-1.3, Math.min(1.3, start.elevation - dy * 0.01)),
});

const QUESTION = {
  type: 'systemsWorkspace',
  mode: 'spatial',
  prompt: 'Explore the three planes, then interpret the solution.',
  spatialModel: { kind: 'threePlanes' },
  equations: ['x + y + z = 6', '2x - y + z = 3', '-x + 2y + z = 5'],
  variables: ['x', 'y', 'z'],
  answerFields: [
    { id: 'meaning', label: 'What does the solution mean?', options: ['A different point on each plane.', 'Three intercepts.', 'A point on all three planes.'], answer: 'A point on all three planes.' },
    { id: 'count', label: 'How many points do all three planes share?', options: ['None', 'Exactly one', 'Infinitely many'], answer: 'Exactly one' },
  ],
};

// The component's work: one { id, value } per answer field (pinned below).
const workOf = (question, responses) => ({
  responses: question.answerFields
    .filter((field) => field?.id !== undefined && field?.id !== null && field?.id !== '')
    .map((field) => ({ id: field.id, value: responses?.[field.id] ?? '' })),
});

const grade = (responses) => gradeToolCheck(systemsWorkspaceGrader, QUESTION, workOf(QUESTION, responses));

/*
 * The keyboard route over one radiogroup, as ThreePlaneWorkspace wires it:
 * Tab lands on choiceTabStop; Space/Enter is the native button click on the
 * focused option; an arrow key / Home / End moves focus to choiceKeyTarget
 * and records that option (selection follows focus).
 */
const keyboardChoose = (responses, field, keys) => {
  let focus = choiceTabStop(field.options, responses[field.id]);
  let state = responses;
  for (const key of keys) {
    if (key === ' ' || key === 'Enter') {
      state = recordChoice(state, field.id, field.options[focus]);
      continue;
    }
    const target = choiceKeyTarget(key, focus, field.options.length);
    if (target === null) continue;
    focus = target;
    state = recordChoice(state, field.id, field.options[target]);
  }
  return { responses: state, focus };
};
const pointerChoose = (responses, field, option) => recordChoice(responses, field.id, option);

/* ------------------------------------------------------------- T2 rotate */

test('dragCamera is the drag mapping the component used inline, clamp included', () => {
  const starts = [{ azimuth: -0.7, elevation: 0.5 }, { azimuth: 2.1, elevation: 1.25 }, { azimuth: 0, elevation: -1.29 }];
  const drags = [[0, 0], [10, 0], [-37, 12], [0, -400], [0, 400], [123.5, -7.25], [-9999, 9999]];
  for (const start of starts) {
    for (const [dx, dy] of drags) {
      assert.deepEqual(dragCamera(start, dx, dy), LEGACY_DRAG(start, dx, dy), JSON.stringify({ start, dx, dy }));
    }
  }
  assert.equal(MIN_ELEVATION, -1.3);
  assert.equal(MAX_ELEVATION, 1.3);
});

test('an arrow key is exactly the drag it stands for; Shift is a larger drag', () => {
  const start = { azimuth: -0.7, elevation: 0.5 };
  assert.deepEqual(keyRotateCamera(start, 'ArrowRight'), dragCamera(start, KEY_ROTATE_PIXELS, 0));
  assert.deepEqual(keyRotateCamera(start, 'ArrowLeft'), dragCamera(start, -KEY_ROTATE_PIXELS, 0));
  assert.deepEqual(keyRotateCamera(start, 'ArrowUp'), dragCamera(start, 0, -KEY_ROTATE_PIXELS));
  assert.deepEqual(keyRotateCamera(start, 'ArrowDown'), dragCamera(start, 0, KEY_ROTATE_PIXELS));
  assert.deepEqual(keyRotateCamera(start, 'ArrowRight', true), dragCamera(start, KEY_ROTATE_PIXELS_LARGE, 0));
  assert.deepEqual(keyRotateCamera(start, 'ArrowDown', true), dragCamera(start, 0, KEY_ROTATE_PIXELS_LARGE));
  assert.ok(KEY_ROTATE_PIXELS_LARGE > KEY_ROTATE_PIXELS);
  // Right turns the same way as dragging right; Up tilts as dragging up does.
  assert.ok(keyRotateCamera(start, 'ArrowRight').azimuth > start.azimuth);
  assert.ok(keyRotateCamera(start, 'ArrowUp').elevation > start.elevation);
  for (const key of ['Home', 'Enter', ' ', 'a', 'Tab', 'PageUp']) assert.equal(keyRotateCamera(start, key), null, key);
});

test('holding an arrow key clamps pitch exactly where a long drag does', () => {
  let camera = { azimuth: 0.3, elevation: 0.5 };
  for (let i = 0; i < 40; i += 1) camera = keyRotateCamera(camera, 'ArrowUp', i % 2 === 0);
  assert.equal(camera.elevation, MAX_ELEVATION);
  assert.deepEqual(camera, dragCamera({ azimuth: 0.3, elevation: 0.5 }, 0, -5000));
  for (let i = 0; i < 60; i += 1) camera = keyRotateCamera(camera, 'ArrowDown');
  assert.equal(camera.elevation, MIN_ELEVATION);
  // Yaw is not clamped by the drag, and so not by the keys.
  let yaw = { azimuth: 0, elevation: 0 };
  for (let i = 0; i < 100; i += 1) yaw = keyRotateCamera(yaw, 'ArrowRight', true);
  assert.ok(yaw.azimuth > 40);
});

test('the view status names the view angle only', () => {
  assert.equal(viewAngleText({ azimuth: 0, elevation: 0 }), 'View turned 0 degrees, tilted 0 degrees.');
  assert.equal(viewAngleText({ azimuth: -0.7, elevation: 0.5 }), 'View turned −40 degrees, tilted 29 degrees.');
  assert.equal(viewAngleText({ azimuth: Math.PI * 3, elevation: -1.3 }), 'View turned 180 degrees, tilted −74 degrees.');
  assert.equal(viewAngleText({ azimuth: -Math.PI * 1.5, elevation: 0 }), 'View turned 90 degrees, tilted 0 degrees.');
});

test('rotation is view-only: the model keys and the drag never reach the graded work', () => {
  const keyHandler = region(component, 'const handleModelKeyDown = useCallback(', '  const scale =', 'model keydown');
  // Each key rotates from the latest camera (a ref kept in step with every
  // render and advanced by the key), so back-to-back presses compound, and
  // a key press stops the idle orbit as a pointerdown does.
  assert.match(keyHandler, /markInteracted\(\);[\s\S]*const next = keyRotateCamera\(cameraRef\.current, event\.key, event\.shiftKey\);\s*cameraRef\.current = next;\s*setCamera\(next\);/);
  assert.match(component, /useLayoutEffect\(\(\) => \{ cameraRef\.current = camera; \}, \[camera\]\);/);
  assert.match(keyHandler, /if \(event\.key === 'Home'\) \{\s*event\.preventDefault\(\);\s*resetView\(\);/, 'Home is Reset view');
  const pointerMove = region(component, 'const handlePointerMove = useCallback(', 'const handlePointerUp', 'pointer move');
  assert.match(pointerMove, /setCamera\(dragCamera\(dragRef\.current\.camera, dx, dy\)\);/);
  for (const [label, source] of [['keys', keyHandler], ['drag', pointerMove]]) {
    assert.doesNotMatch(source, /setResponses|fieldResponses|setVisiblePlanes|setRevealed|submit\(|onAction/, `${label} touches view state only`);
  }
  // The work Check grades is built from the responses alone.
  const work = region(component, 'const work = useMemo(', 'useReportToolWork(work', 'work');
  assert.match(work, /\}\), \[answerFields, responses\]\);\s*$/);
  assert.doesNotMatch(work, /camera/);
  // And the same responses grade identically whatever the view.
  const responses = { meaning: 'A point on all three planes.', count: 'Exactly one' };
  const before = grade(responses);
  let camera = { azimuth: -0.7, elevation: 0.5 };
  for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowRight']) camera = keyRotateCamera(camera, key, true);
  assert.notDeepEqual(camera, { azimuth: -0.7, elevation: 0.5 });
  assert.deepEqual(grade(responses), before);
  assert.equal(before.isCorrect, true);
});

test('the model is a focusable, named application wired to the keys', () => {
  const svg = region(component, '<svg\n            ref={modelRef}', '>\n            { }', 'model svg');
  assert.match(svg, /role="application"/);
  assert.match(svg, /tabIndex=\{0\}/);
  assert.match(svg, /aria-label="[^"]*arrow keys[^"]*"/);
  assert.match(svg, /aria-describedby=\{instructionId\}/);
  assert.match(svg, /onKeyDown=\{handleModelKeyDown\}/);
  assert.match(svg, /onPointerDown=\{handlePointerDown\}\s*onPointerMove=\{handlePointerMove\}\s*onPointerUp=\{handlePointerUp\}/);
  // Inside the control, the drawing keeps the image role and name the model
  // always had (the assessment-leak and Day 2 browser gates find it by them).
  assert.match(component, /onPointerLeave=\{handlePointerUp\}\s*>\s*\{ \}\s*<g role="img" aria-label="Interactive 3D view of the three planes\. Drag to rotate\.">/);
  assert.match(component, /<span id=\{instructionId\} className="mathmaster-threeplane-sr-only">\s*Arrow keys rotate/);
  const imports = component.match(/import \{([^}]*)\} from '\.\/threePlaneControls\.js';/);
  assert.ok(imports, 'the component imports its control helpers');
  for (const name of ['choiceKeyTarget', 'choiceTabStop', 'dragCamera', 'keyRotateCamera', 'keyRotationDrag', 'recordChoice', 'viewAngleText']) {
    assert.match(imports[1], new RegExp(`\\b${name}\\b`), `${name} must be imported`);
  }
});

/* ------------------------------------------------------- T7 radiogroup */

test('radiogroup keys: next / previous with wrap, Home / End, nothing else', () => {
  assert.equal(choiceKeyTarget('ArrowDown', 0, 3), 1);
  assert.equal(choiceKeyTarget('ArrowRight', 1, 3), 2);
  assert.equal(choiceKeyTarget('ArrowDown', 2, 3), 0, 'wraps forward');
  assert.equal(choiceKeyTarget('ArrowUp', 0, 3), 2, 'wraps back');
  assert.equal(choiceKeyTarget('ArrowLeft', 2, 3), 1);
  assert.equal(choiceKeyTarget('Home', 2, 3), 0);
  assert.equal(choiceKeyTarget('End', 0, 3), 2);
  for (const key of [' ', 'Enter', 'Tab', 'a', 'PageDown']) assert.equal(choiceKeyTarget(key, 1, 3), null, key);
  assert.equal(choiceKeyTarget('ArrowDown', 0, 0), null);
  assert.equal(choiceTabStop(['a', 'b', 'c'], undefined), 0, 'nothing chosen: the first is the tab stop');
  assert.equal(choiceTabStop(['a', 'b', 'c'], 'c'), 2, 'the chosen option is the tab stop');
  assert.equal(choiceTabStop(['a', 'b', 'c'], 'gone'), 0);
});

test('a choice reached by keys records exactly the state, work and grade a click records', () => {
  const [meaning, count] = QUESTION.answerFields;
  const routes = [
    // [keys over meaning, keys over count, the options a pointer clicks]
    [['ArrowUp'], ['ArrowDown'], ['A point on all three planes.', 'Exactly one']],
    [['ArrowDown', 'ArrowDown'], ['End', 'ArrowLeft'], ['A point on all three planes.', 'Exactly one']],
    [[' '], ['Enter'], ['A different point on each plane.', 'None']],
    [['ArrowDown'], ['ArrowUp'], ['Three intercepts.', 'Infinitely many']],
    [['End', 'ArrowRight', 'ArrowRight', 'ArrowRight'], ['Home', 'ArrowRight', 'ArrowRight'], ['A point on all three planes.', 'Infinitely many']],
  ];
  const seen = new Set();
  for (const [meaningKeys, countKeys, [meaningClick, countClick]] of routes) {
    const byKeys = keyboardChoose(keyboardChoose({}, meaning, meaningKeys).responses, count, countKeys).responses;
    const byPointer = pointerChoose(pointerChoose({}, meaning, meaningClick), count, countClick);
    const label = JSON.stringify({ meaningKeys, countKeys });
    assert.deepEqual(byKeys, byPointer, `state: ${label}`);
    assert.deepEqual(workOf(QUESTION, byKeys), workOf(QUESTION, byPointer), `work: ${label}`);
    const keyGrade = grade(byKeys);
    const pointerGrade = grade(byPointer);
    assert.equal(keyGrade.graded, true, label);
    assert.deepEqual(keyGrade, pointerGrade, `grade: ${label}`);
    seen.add(keyGrade.isCorrect);
  }
  assert.deepEqual([...seen].sort(), [false, true], 'the routes cover a right and a wrong interpretation');
  // Re-choosing by keys from a clicked answer moves only that field.
  const clicked = pointerChoose(pointerChoose({}, meaning, 'Three intercepts.'), count, 'Exactly one');
  const moved = keyboardChoose(clicked, meaning, ['ArrowDown']);
  assert.equal(moved.focus, 2, 'starts from the chosen option, the tab stop');
  assert.deepEqual(moved.responses, { meaning: 'A point on all three planes.', count: 'Exactly one' });
  assert.equal(grade(moved.responses).isCorrect, true);
});

test('the choice buttons are wired to the radiogroup helpers, click and key alike', () => {
  const panel = region(component, '<Panel title="Interpret what you found">', '</Panel>', 'interpretation panel');
  assert.match(panel, /role="radiogroup" aria-label=\{field\.label\}/);
  assert.match(panel, /tabIndex=\{index === choiceTabStop\(field\.options, responses\[field\.id\]\) \? 0 : -1\}/);
  assert.match(panel, /onKeyDown=\{handleChoiceKeyDown\(field, index\)\}\s*onClick=\{\(\) => fieldResponses\(field\.id, option\)\}/);
  const keys = region(component, 'const handleChoiceKeyDown = (field, index) => (event) => {', '\n  };', 'choice keydown');
  assert.match(keys, /const target = choiceKeyTarget\(event\.key, index, field\.options\.length\);/);
  assert.match(keys, /fieldResponses\(field\.id, field\.options\[target\]\);\s*choiceRefs\.current\[`\$\{field\.id\}::\$\{target\}`\]\?\.focus\(\);/);
  assert.doesNotMatch(keys, /submit\(|check\(|onAction/, 'a key selects; only Check grades');
  const record = region(component, 'const fieldResponses = useCallback(', '}, [setResponses]);', 'fieldResponses');
  assert.match(record, /setResponses\(\(current\) => recordChoice\(current, fieldId, value\)\);/);
  assert.match(panel, /ref=\{\(node\) => \{ choiceRefs\.current\[`\$\{field\.id\}::\$\{index\}`\] = node; \}\}/);
});

/* ------------------------------------------------------- T8 focus ring */

test('the tool CSS never removes the focus outline', () => {
  assert.doesNotMatch(css, /outline\s*:\s*(none|0)\b/);
});
