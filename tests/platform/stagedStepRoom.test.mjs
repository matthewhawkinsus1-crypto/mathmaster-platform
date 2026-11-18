/*
 * A STAGED STEP'S PLANE FITS THE STEP, AS THE STEP IS MEASURED (src/platform/workflow/stepRoom.js).
 *
 * In Work View a staged question's plane was capped at the view less 280px, an estimate made before the first-hint
 * offer took a row under Previous/Next, and a plane a step reads or marks at 88% of the screen: at 1366x768 a
 * "decide" step's plane was 676px in a 430px step, its Yes and No 750px down, and on a 320x568 phone or any phone at
 * 200% text the step had no height at all. These hold the measured rule: the step's whole content fits where the
 * plane can give the room, the plane is whole where it cannot, and a view too short for a bounded step scrolls as
 * one. Measured in a browser by tests/browser/workViewOpenerCover.mjs --check=scroll, every staged step with a plane.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FLOW_HYSTERESIS, PLANE_MIN, STEP_MIN_ROOM, planeColumn, readStepRoom, stepFlows, stepPlaneCap,
} from '../../src/platform/workflow/stepRoom.js';
import { declared, parseCss, rulesFor } from './helpers/cssRules.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

test('a step too short to be worked in makes the view scroll as one, and only comes back with room to spare', () => {
  assert.equal(STEP_MIN_ROOM, 200);
  assert.equal(stepFlows({ boundedRoom: 0 }), true, 'the 320x568 phone: the chrome left the step nothing');
  assert.equal(stepFlows({ boundedRoom: STEP_MIN_ROOM - 1 }), true);
  assert.equal(stepFlows({ boundedRoom: STEP_MIN_ROOM }), false);
  assert.equal(stepFlows({ boundedRoom: 430 }), false, 'a Chromebook keeps its bounded step');
  // Flowing, it stays so until the bounded step would have the room and some to spare.
  assert.equal(stepFlows({ boundedRoom: STEP_MIN_ROOM + FLOW_HYSTERESIS - 1, flowing: true }), true);
  assert.equal(stepFlows({ boundedRoom: STEP_MIN_ROOM + FLOW_HYSTERESIS, flowing: true }), false);
});

// A step as the page lays it out: the plane's column (the plane and `a` more) beside a column of `beside` px (or
// nothing beside it), and `rest` above and below them. The page reads it, the runner caps the plane, the plane is
// drawn no taller than the cap and no taller than it can be, and the page is read again: `settle` does that until
// nothing changes, and says how many readings that took.
const layout = ({ rest, a, beside = null }) => ({
  content: (plane) => rest + Math.max(plane + a, beside ?? Number.NEGATIVE_INFINITY),
  slack: (plane) => (beside == null ? Number.POSITIVE_INFINITY : plane + a - beside),
});
const settle = ({ room, plane, natural = plane, frame = 0, ...shape }) => {
  const page = layout(shape);
  let drawn = plane;
  let cap = null;
  const caps = [];
  for (let reading = 1; reading <= 8; reading += 1) {
    const next = stepPlaneCap({ room, content: page.content(drawn), plane: drawn, frame, slack: page.slack(drawn) });
    caps.push(next);
    const redrawn = Math.min(natural, next);
    if (next === cap && redrawn === drawn) return { cap, plane: drawn, content: page.content(drawn), readings: reading, caps };
    cap = next;
    drawn = redrawn;
  }
  return { cap, plane: drawn, content: page.content(drawn), readings: Infinity, caps };
};

test('where the plane can give the room, the step\'s whole content fits: the plane, its controls and the answers', () => {
  // 1366x768, "x-intercept?": a 430px step, the plane 676px, its zoom row and Yes/No 115px under it.
  const decide = settle({ room: 430, plane: 676, frame: 59, rest: 115, a: 0 });
  assert.equal(decide.cap, 315);
  assert.equal(decide.content, 430, 'the step no longer scrolls inside itself');
  // 1920x1080, the same step: a 742px step.
  assert.equal(settle({ room: 742, plane: 922, frame: 59, rest: 115, a: 0 }).content, 742);
  // Room to spare: a plane under its natural size grows into it, and no further than the step.
  const spare = settle({ room: 430, plane: 200, natural: 400, rest: 100, a: 0 });
  assert.equal(spare.plane, 330);
  assert.equal(spare.content, 430);
  // A fixed point: measured again with the cap applied, the cap is the same.
  assert.equal(stepPlaneCap({ room: 430, content: decide.content, plane: decide.plane, frame: 59 }), decide.cap);
  assert.ok(decide.readings <= 2, `settled in ${decide.readings} readings`);
});

test('where it cannot, the step scrolls as before and the plane is whole in it, never under its floor', () => {
  // 1366x768, "Plot the points": the point cards beside the plane (635px) are taller than the step (430px).
  const beside = settle({ room: 430, plane: 488, natural: 802, frame: 11, rest: 311, a: 56, beside: 635 });
  assert.equal(beside.cap, 419);
  assert.ok(beside.plane + 11 <= 430, 'the plane, and the room above it in its box, fit the step');
  // 360x740, "Mark max/min": the step is 470px with the plane at its 228px, in 295px. Shrinking the plane to its
  // floor would not make it fit, so the plane keeps its size and only has to be whole with its zoom row.
  const locate = settle({ room: 295, plane: 228, frame: 59, rest: 242, a: 0 });
  assert.equal(locate.plane, 228);
  assert.equal(locate.cap, 236);
  // Never under the floor, whatever the room.
  assert.equal(stepPlaneCap({ room: 120, content: 900, plane: 400, frame: 59 }), PLANE_MIN);
  assert.equal(stepPlaneCap({ room: 100, content: 400, plane: 300, slack: -40 }), PLANE_MIN);
  // No plane: nothing to cap.
  assert.equal(stepPlaneCap({ room: 430, content: 430, plane: 0 }), null);
  assert.equal(stepPlaneCap({ room: Number.NaN, content: 430, plane: 200 }), null);
});

test('the cap is the same whatever height the plane has now, so the plane settles: the plotting step at 1920x1080 looped', () => {
  // "Plot the points" at 1920x1080 (the review's reading): a 742px step, the point cards 635px beside the plane's
  // column (the plane and 56px), 464px above and below. With a 374px plane the cards were the lower, so the plane was
  // given the step's height (731px); with a 731px plane its own column was the lower, so it was shrunk to fit
  // (374px); nine times a second. Not a fit: the cards and what is around them are 1099px of a 742px step.
  const plotting = { room: 742, frame: 11, rest: 464, a: 56, beside: 635, natural: 1076 };
  const caps = [160, 374, 600, 731, 900, 1076].map((plane) => {
    const page = layout(plotting);
    return stepPlaneCap({ room: plotting.room, content: page.content(plane), plane, frame: plotting.frame, slack: page.slack(plane) });
  });
  assert.deepEqual([...new Set(caps)], [731], `one cap for every plane height: ${caps.join(', ')}`);
  for (const plane of [374, 731]) {
    const settled = settle({ ...plotting, plane });
    assert.equal(settled.cap, 731);
    assert.ok(settled.readings <= 2, `from ${plane}px: settled in ${settled.readings} readings (${settled.caps.join(' → ')})`);
  }
  // A taller screen where the cards and the rest fit (1099px in 1300px): the plane fills what they leave, from any
  // height, and the step fits whole.
  const roomy = { room: 1300, frame: 11, rest: 464, a: 56, beside: 635, natural: 1076 };
  for (const plane of [200, 374, 780, 1000]) {
    const settled = settle({ ...roomy, plane });
    assert.equal(settled.cap, 780, `from ${plane}px`);
    assert.equal(settled.content, 1300);
    assert.ok(settled.readings <= 3, `from ${plane}px: settled in ${settled.readings} readings (${settled.caps.join(' → ')})`);
  }
  // And a step with nothing beside its plane, from any height.
  const stacked = { room: 430, frame: 59, rest: 115, a: 0, natural: 1000 };
  assert.deepEqual([...new Set([200, 315, 676, 1000].map((plane) => settle({ ...stacked, plane }).cap))], [315]);
});

// A box tree with laid-out rectangles, enough for the geometry: children, parentElement, getBoundingClientRect,
// querySelector/querySelectorAll by class or tag.
const node = (name, rect, children = [], extra = {}) => {
  const element = {
    name,
    tagName: (extra.tag || 'div').toUpperCase(),
    className: extra.className || '',
    children,
    parentElement: null,
    getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }),
    ...extra.fields,
  };
  const all = () => children.flatMap((child) => [child, ...child.all()]);
  element.all = all;
  element.querySelectorAll = (selector) => all().filter((child) => selector.split(',').some((part) => {
    const wanted = part.trim();
    if (wanted === 'button') return child.tagName === 'BUTTON';
    if (wanted.includes('svg')) return child.tagName === 'SVG';
    return wanted.startsWith('.') && child.className.split(' ').includes(wanted.slice(1));
  }));
  element.querySelector = (selector) => element.querySelectorAll(selector)[0] || null;
  children.forEach((child) => { child.parentElement = element; });
  return element;
};

test('a plane\'s slack is how much lower its column reaches than one beside it, and its frame is its box above it and its own control row under it', () => {
  // "Plot the points" at 1366x768: the point cards (230 wide, 635 tall) beside the plane's figure.
  const svg = node('svg', { left: 290, top: 194, width: 802, height: 488 }, [], { tag: 'svg' });
  const figure = node('figure', { left: 274, top: 183, width: 824, height: 544 }, [svg]);
  const cards = node('aside', { left: 28, top: 183, width: 230, height: 635 });
  const grid = node('grid', { left: 28, top: 183, width: 1070, height: 635 }, [cards, figure]);
  const stage = node('stage', { left: 28, top: 20, width: 1070, height: 946 }, [grid]);
  assert.deepEqual(planeColumn(svg, stage), { slack: -91, frame: 11 }, 'the cards reach 91px lower than the plane\'s column');
  // "x-intercept?": the plane, then its zoom row, then the answers; nothing beside it.
  const plane = node('svg', { left: 28, top: 175, width: 1070, height: 676 }, [], { tag: 'svg' });
  const zoom = node('zoom', { left: 28, top: 866, width: 1070, height: 44 }, [node('+', { left: 28, top: 866, width: 44, height: 44 }, [], { tag: 'button' })]);
  const box = node('box', { left: 28, top: 175, width: 1070, height: 735 }, [plane, zoom]);
  const answers = node('answers', { left: 28, top: 922, width: 1070, height: 44 }, [node('No', { left: 28, top: 922, width: 55, height: 44 }, [], { tag: 'button' })]);
  const step = node('step', { left: 28, top: 175, width: 1070, height: 791 }, [box, answers]);
  assert.deepEqual(planeColumn(plane, step), { slack: Number.POSITIVE_INFINITY, frame: 59 }, 'the zoom row, not the answers under it');
  // Its own box is the first one taller than it: not a wrapper of its own height, and not the step's heading above it.
  const drawn = node('svg', { left: 0, top: 100, width: 300, height: 200 }, [], { tag: 'svg' });
  const wrap = node('wrap', { left: 0, top: 100, width: 300, height: 200 }, [drawn]);
  const zoomRow = node('zoom', { left: 0, top: 300, width: 300, height: 44 }, [node('+', { left: 0, top: 300, width: 44, height: 44 }, [], { tag: 'button' })]);
  const ownBox = node('figure', { left: 0, top: 90, width: 300, height: 260 }, [wrap, zoomRow]);
  const heading = node('heading', { left: 0, top: 0, width: 300, height: 80 });
  const section = node('section', { left: 0, top: 0, width: 300, height: 400 }, [heading, ownBox]);
  assert.deepEqual(planeColumn(drawn, node('stop', { left: 0, top: 0, width: 300, height: 400 }, [section])), { slack: Number.POSITIVE_INFINITY, frame: 54 });
  // A shorter box beside it counts as well: how far the plane's column can shrink before that one is the lower.
  const tall = node('svg', { left: 300, top: 0, width: 400, height: 300 }, [], { tag: 'svg' });
  const note = node('note', { left: 0, top: 0, width: 280, height: 120 });
  assert.equal(planeColumn(tall, node('stop', { left: 0, top: 0, width: 700, height: 300 }, [node('row', { left: 0, top: 0, width: 700, height: 300 }, [note, tall])])).slack, 180);
  // A note further down its box is not its control row.
  const lone = node('svg', { left: 0, top: 0, width: 300, height: 200 }, [], { tag: 'svg' });
  const help = node('help', { left: 0, top: 260, width: 300, height: 93 }, [node('more', { left: 0, top: 300, width: 80, height: 44 }, [], { tag: 'button' })]);
  const holder = node('holder', { left: 0, top: 0, width: 300, height: 353 }, [lone, help]);
  assert.equal(planeColumn(lone, node('root', { left: 0, top: 0, width: 300, height: 353 }, [holder])).frame, 0);
});

test('read from the page: a step the chrome leaves under 200px flows; a bounded one is capped by its own height', () => {
  const surfaceOf = ({ clientHeight, scrollHeight }) => ({ clientHeight, scrollHeight });
  const build = ({ surface, body, stageHeight, planeHeight = 0, flowing = false }) => {
    const svg = node('svg', { left: 0, top: 100, width: 300, height: planeHeight }, [], { tag: 'svg', className: 'mathmaster-responsive-canvas' });
    const stage = node('stage', { left: 0, top: 100, width: 300, height: stageHeight }, planeHeight ? [svg] : [], { className: 'workflow-focus__active-stage', fields: { offsetHeight: stageHeight } });
    const bodyEl = node('body', { left: 0, top: 100, width: 300, height: body.clientHeight }, [stage], { className: 'workflow-focus__workspace-body', fields: body });
    const root = node('root', { left: 0, top: 0, width: 300, height: 600 }, [bodyEl], { className: 'workflow-focus' });
    const surfaceEl = surfaceOf(surface);
    root.closest = (selector) => (selector.includes('[data-open="true"]') ? surfaceEl : null);
    return readStepRoom(root, flowing);
  };
  // 320x568: a 325px view whose chrome is 325px: no step.
  assert.deepEqual(build({ surface: { clientHeight: 325, scrollHeight: 325 }, body: { clientHeight: 0, scrollHeight: 1321, offsetHeight: 0 }, stageHeight: 1321 }), { flow: true, planeMax: null });
  // Flowing, the same view: the chrome is what the view holds besides the step, and the step still has no room.
  assert.equal(build({ surface: { clientHeight: 325, scrollHeight: 1700 }, body: { clientHeight: 1321, scrollHeight: 1321, offsetHeight: 1321 }, stageHeight: 1321, flowing: true }).flow, true);
  // 1366x768, "x-intercept?": bounded, its 430px decides the cap.
  assert.deepEqual(
    build({ surface: { clientHeight: 709, scrollHeight: 709 }, body: { clientHeight: 430, scrollHeight: 791, offsetHeight: 430 }, stageHeight: 791, planeHeight: 676 }),
    { flow: false, planeMax: 315 },
  );
  // Not in an open Work View: nothing measured.
  const idle = node('root', { left: 0, top: 0, width: 300, height: 600 }, []);
  idle.closest = () => null;
  assert.deepEqual(readStepRoom(idle), { flow: false, planeMax: null });
});

test('Work View draws the step\'s plane no taller than the cap the step measured, phones too, and lets a short view scroll as one', () => {
  const shell = parseCss(read('src/components/common/WorkViewShell.css'));
  const CAP = 'var(--mm-step-plane-max, max(200px, calc(var(--mm-work-view-height, 100dvh) - 280px)))';
  for (const plane of ['.mathmaster-function-workspace-graph svg', 'svg.mathmaster-responsive-canvas']) {
    const selector = `[data-open="true"] .mathmaster-work-view-surface .workflow-focus__active-stage ${plane}`;
    assert.deepEqual(declared(shell, selector, 'max-height', { media: null }), { value: CAP, important: false }, plane);
  }
  // On a phone the plotting step's plane keeps its own bound, and the cap within it.
  const phone = '[data-open="true"][data-layout="mobile"] .mathmaster-work-view-surface .workflow-focus__active-stage .mathmaster-function-workspace-graph svg';
  assert.equal(declared(shell, phone, 'max-height', { media: '(max-width: 700px)' })?.value, 'min(42dvh, 320px, var(--mm-step-plane-max, 320px))');
  assert.equal(declared(shell, phone, 'max-height', { media: '(orientation: landscape) and (max-height: 500px)' })?.value, 'min(56dvh, var(--mm-step-plane-max, 56dvh))');
  // The estimate is gone everywhere but the cap's first frame.
  assert.equal((read('src/components/common/WorkViewShell.css').match(/- 280px/g) || []).length, 1);
  // The cap outranks the 88% a plane a step marks had in an enlarged figure (WorkflowFocusMode.css).
  const featurePlane = '.mathmaster-desktop-question-content .mathmaster-enlarged-figure .workflow-focus__feature-plane .mathmaster-responsive-canvas';
  assert.equal(declared(parseCss(read('src/platform/workflow/WorkflowFocusMode.css')), featurePlane, 'max-height')?.value, '88dvh');
  const specificity = (selector) => [(selector.match(/\[[^\]]+\]|\.[\w-]+/g) || []).length, (selector.match(/(^|[\s>])(svg|figure|div)\b/g) || []).length];
  const ours = specificity('[data-open="true"] .mathmaster-work-view-surface .workflow-focus__active-stage svg.mathmaster-responsive-canvas');
  const theirs = specificity(featurePlane);
  assert.ok(ours[0] > theirs[0] || (ours[0] === theirs[0] && ours[1] > theirs[1]), `the cap's selector (${ours}) outranks the 88dvh one (${theirs})`);

  // Flow: the view scrolls, the step and everything round it take their content's height, and nothing is a scroller
  // inside it; Previous/Next follow the step, unpinned.
  const FLOW = '.workflow-focus[data-step-room="flow"]';
  assert.deepEqual(declared(shell, `[data-open="true"] .mathmaster-work-view-surface:has(${FLOW})`, 'overflow-y'), { value: 'auto', important: true });
  for (const selector of [
    `[data-open="true"] .mathmaster-work-view-surface:has(${FLOW}) > .mathmaster-question-tool-workspace > fieldset > div`,
    `[data-open="true"] .mathmaster-work-view-surface ${FLOW}`,
    `[data-open="true"] .mathmaster-work-view-surface ${FLOW} .workflow-focus__workspace`,
    `[data-open="true"] .mathmaster-work-view-surface ${FLOW} .workflow-focus__workspace-body`,
  ]) {
    assert.equal(declared(shell, selector, 'height')?.value, 'auto', selector);
    assert.equal(declared(shell, selector, 'overflow')?.value, 'visible', selector);
  }
  for (const selector of [
    `[data-open="true"] .mathmaster-work-view-surface:has(${FLOW}) > .mathmaster-question-tool-workspace`,
    `[data-open="true"] .mathmaster-work-view-surface:has(${FLOW}) > .mathmaster-question-tool-workspace > fieldset`,
  ]) {
    assert.equal(declared(shell, selector, 'overflow')?.value, 'visible', selector);
    // Its content's height, not the view's (the review of 2026-11-18): held to the view by the bounded layout's
    // height:100%, the step ran past it, the results under it were painted under the step, and the view's scroll
    // height left them out, so the step was read 106px roomier in flow than bounded and switched every frame.
    assert.equal(declared(shell, selector, 'height')?.value, 'auto', selector);
  }
  // The bounded layout's height:100% it overrides: the flowing rule is the more specific.
  assert.equal(declared(shell, '[data-open="true"] .mathmaster-question-tool-workspace:has(.workflow-focus)', 'height')?.value, '100%');
  assert.equal(rulesFor(shell, `[data-open="true"] .mathmaster-work-view-surface ${FLOW} .workflow-focus__footer`).length, 0, 'the footer is not pinned');
});

test('the staged runner measures its step in Work View and hands the page the cap and the flow', () => {
  const runner = executableSource(read('src/platform/workflow/WorkflowRunner.jsx'));
  assert.match(runner, /import \{ useStepRoom \} from '\.\/useStepRoom\.js';/);
  assert.match(runner, /const \{ enlarged: inWorkView \} = useWorkViewPresentation\(\);\n  const stepRoom = useStepRoom\(/);
  assert.match(runner, /const stepRoom = useStepRoom\(focusRootRef, \{ enlarged: inWorkView, stepKey: String\(activeStageIndex\) \}\);/);
  const root = region(runner, '<div\n      ref={focusRootRef}', '>\n', 'the focus root');
  assert.match(root, /data-step-room=\{stepRoom\.flow \? 'flow' : undefined\}/);
  assert.match(root, /style=\{stepRoom\.planeMax != null \? \{ '--mm-step-plane-max': `\$\{stepRoom\.planeMax\}px` \} : undefined\}/);
  // Called before any early return, so the runner's hooks keep their order.
  assert.ok(runner.indexOf('const stepRoom = useStepRoom(') < runner.indexOf('if (!workflow.length) return null;'));

  const hook = executableSource(read('src/platform/workflow/useStepRoom.js'));
  assert.match(hook, /if \(!enlarged \|\| !root\) \{/, 'only in an open Work View');
  for (const watched of ["root.closest('.mathmaster-work-view-surface')", "root.querySelector('.workflow-focus__workspace-body')", "root.querySelector('.workflow-focus__active-stage')"]) {
    assert.ok(hook.includes(watched), watched);
  }
  assert.match(hook, /\}, \[rootRef, enlarged, stepKey\]\);/, 'and watched again for each step, whose box is a new one');
  assert.match(hook, /const next = readStepRoom\(root, roomRef\.current\.flow\);/);
});
