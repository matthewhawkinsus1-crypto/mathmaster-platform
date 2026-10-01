/*
 * WORK VIEW CHROME ON A PHONE: THE DEFERRED STUDENT-EXPERIENCE FINDINGS.
 *
 * docs/qa/platform-quirks-audit.md, PQ-020 (a phone on its side gave the step
 * 120-150px), PQ-025 ("Enlarge question" over the content), PQ-026 ("Question
 * Work View" over a task cut mid-word) and PQ-027 (capability chips that looked
 * like disabled buttons). Each was measured in a browser before and after
 * (numbers in the audit); the browser gates are tests/browser/studentUxPlatform.mjs
 * (`opener`, `staged`), workViewCertification.mjs and assignmentMobile.mjs.
 * Nothing here can render React, so these read source, bound to the region that
 * does the work, and each was broken once to see it go red.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { readBottomKeypadHeight, readWorkViewViewport, resolveWorkViewLayout } from '../../src/platform/workView/workViewViewport.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const figure = componentSource('src/components/common/EnlargeableFigure.jsx');
const shellCss = read('src/components/common/WorkViewShell.css');
const runner = read('src/platform/workflow/WorkflowRunner.jsx');

/* ----------------------------------------------------------------- PQ-020 */

test('a phone on its side is a short Work View, and a keyboard never makes one', () => {
  // 844x390 and 740x360 gave the active step 150 and 120px. Short is decided
  // from the LAYOUT height, so the chrome cannot refold under a student who
  // starts typing.
  assert.equal(resolveWorkViewLayout({ width: 844, height: 390 }).shortHeight, true);
  assert.equal(resolveWorkViewLayout({ width: 740, height: 360 }).shortHeight, true);
  assert.equal(resolveWorkViewLayout({ width: 667, height: 375 }).shortHeight, true);
  assert.equal(resolveWorkViewLayout({ width: 844, height: 390, visualHeight: 180 }).shortHeight, true);
  assert.equal(resolveWorkViewLayout({ width: 390, height: 844 }).shortHeight, false);
  assert.equal(resolveWorkViewLayout({ width: 390, height: 844, visualHeight: 300, offsetTop: 120 }).shortHeight, false);
  assert.equal(resolveWorkViewLayout({ width: 1366, height: 768 }).shortHeight, false);
  assert.equal(resolveWorkViewLayout({ width: 820, height: 1180 }).shortHeight, false);
});

test('in a short Work View the step instruction rides in the header, and only there', () => {
  // One sentence, one place: under the task in the header when short, the
  // boxed row above the work otherwise.
  assert.match(figure, /data-height=\{viewport\.shortHeight \? 'short' : 'regular'\}/);
  assert.match(figure, /const shortHeight = enlarged && viewport\.shortHeight;/);
  const header = region(figure, '<header className="mathmaster-work-view-header">', '</header>', 'the Work View header');
  assert.match(header, /\{shortHeight \? instructionNode : null\}/, 'short: the instruction is in the header');
  const surface = region(figure, 'const figure = (', '</figure>', 'the Work View surface');
  assert.match(surface, /\{shortHeight \? null : instructionNode\}/, 'regular: the instruction is above the work');
  const node = region(figure, 'const instructionNode =', ') : null;', 'the instruction node');
  assert.match(node, /className="mathmaster-work-view-instruction"/);
});

test('the shell tells its children how it is laid out, around the same single tree', () => {
  // WorkflowRunner reads it to move its step heading. Provided embedded and
  // enlarged alike, so opening Work View never changes the tree's shape.
  const surface = region(figure, 'const figure = (', '</figure>', 'the Work View surface');
  assert.match(surface, /<WorkViewPresentationContext\.Provider value=\{presentation\}>\{children\}<\/WorkViewPresentationContext\.Provider>/);
  assert.doesNotMatch(executableSource(surface), /enlarged \? <WorkViewPresentationContext/, 'the provider is unconditional');
  assert.match(figure, /const presentation = useMemo\(\(\) => \(\{ enlarged, shortHeight \}\), \[enlarged, shortHeight\]\);/);
});

test('a short Work View puts the step heading in the Previous/Next row without remounting the step', () => {
  assert.match(runner, /import \{ useWorkViewPresentation \} from '\.\.\/workView\/workViewPresentation\.js';/);
  assert.match(runner, /const \{ shortHeight: headingInFooter \} = useWorkViewPresentation\(\);/);
  const main = region(runner, '<main className={`workflow-focus__workspace', '</main>', 'the focus-mode workspace');
  assert.match(main, /^[^]*?\{headingInFooter \? null : stepHeading\}/, 'regular: the heading sits above the work');
  // The active stage is rendered unconditionally: moving the heading never
  // unmounts the student's work.
  assert.match(main, /\n\s*<div className="workflow-focus__active-stage" key=\{activeStage\?\.id \|\| safeActiveIndex\}>/);
  assert.doesNotMatch(main, /headingInFooter \?[^:]*workflow-focus__active-stage/);
  const footer = region(runner, '<footer className="workflow-focus__footer">', '</footer>', 'the step footer');
  assert.match(footer, /\{headingInFooter \? stepHeading : null\}/, 'short: the heading joins the step buttons');
  const heading = region(runner, 'const stepHeading = (', ');\n', 'the step heading');
  assert.match(heading, /<h4>Step \{safeActiveIndex \+ 1\}/);
  assert.match(heading, /workflow-focus__counter/);
  // The step buttons keep their words as their names.
  assert.match(footer, /<span aria-hidden="true">←<\/span> <span className="workflow-focus__nav-label">Previous step<\/span>/);
  assert.match(footer, /<span className="workflow-focus__nav-label">Next step<\/span> <span aria-hidden="true">→<\/span>/);
});

test('the short Work View folds into two rows of chrome and hides nothing a student needs', () => {
  const css = executableSource(shellCss);
  const rule = (selector) => region(css, selector, '}', selector);
  assert.match(rule('[data-open="true"][data-height="short"] .workflow-focus__footer {'), /flex-wrap:\s*nowrap/);
  assert.match(rule('[data-open="true"][data-height="short"] .workflow-focus__progress-text'), /display:\s*none/);
  // The task is one line with an ellipsis; the Task button opens all of it.
  assert.match(rule('[data-open="true"][data-height="short"] .mathmaster-work-view-persistent-task {'), /white-space:\s*nowrap[\s\S]*text-overflow:\s*ellipsis/);
  // Arrows on screen, words still the buttons' names: visually hidden, never
  // display:none (which would take the name away).
  const label = rule('[data-open="true"][data-height="short"] .workflow-focus__nav-label {');
  assert.match(label, /clip-path:\s*inset\(50%\)/);
  assert.doesNotMatch(label, /display:\s*none/);
  assert.match(rule('[data-open="true"][data-height="short"] .workflow-focus__nav-button {'), /min-height:\s*44px/);
  // Nothing in the short rules hides the step heading, the instruction or the
  // step buttons themselves.
  const shortRules = [...css.matchAll(/([^{}]*\[data-height="short"\][^{}]*)\{([^}]*)\}/g)];
  assert.ok(shortRules.length >= 8, 'the short-height rules are where this test expects them');
  shortRules
    .filter(([, , body]) => /display:\s*none/.test(body))
    .forEach(([, selector]) => assert.doesNotMatch(selector, /workspace-heading|instruction|nav-button|footer-group|persistent-task/, `${selector.trim()} hides something a student needs`));
});

test('turning the phone with Work View open brings the current work back into view', () => {
  // The layout reflows when the phone turns (a short screen folds its chrome),
  // and a plane revealed only on open was left 81-88% on screen, its axis under
  // the fold. The reveal runs on open and again on every turn.
  const reveal = region(figure, 'const frame = window.requestAnimationFrame(() => {\n      revealWorkViewTarget(', '\n  }, [', 'the Work View reveal');
  assert.match(reveal, /if \(!enlarged \|\| typeof window === 'undefined'\) return undefined;|\.querySelector\?\.\('\.mathmaster-work-view-surface'\)/);
  const deps = figure.slice(figure.indexOf(reveal) + reveal.length, figure.indexOf(']);', figure.indexOf(reveal) + reveal.length) + 3);
  assert.match(deps, /^\n  \}, \[enlarged, viewport\.orientation\]\);$/);
});

/* ----------------------------------------------------------------- PQ-026 */

test('the Work View header is the task, not "Question Work View"', () => {
  // The title cost the task a line and cut it mid-word on a phone. It is kept
  // for a figure that has no task; the dialog keeps its name either way.
  const header = region(figure, '<header className="mathmaster-work-view-header">', '</header>', 'the Work View header');
  assert.match(header, /\{task \? null : <strong className="mathmaster-work-view-title">\{label\}<\/strong>\}/);
  assert.match(figure, /aria-label=\{enlarged \? `\$\{label\}, Work View` : undefined\}/);
  // Whole lines: 3.2em was two lines and a third cut through its words.
  const persistent = region(header, 'className="mathmaster-work-view-persistent-task"', '>', 'the persistent task');
  assert.doesNotMatch(persistent, /maxHeight/, 'the height lives in the stylesheet, in whole lines');
  const clamp = executableSource(shellCss).match(/\.mathmaster-work-view-persistent-task \{[^}]*max-height:\s*calc\(1\.35em \* (\d+)\)/);
  assert.ok(clamp, 'the task is clamped in whole lines of its own line-height');
  assert.ok(Number(clamp[1]) >= 3, 'at least three whole lines of task');
  assert.match(figure, /lineHeight: 1\.35,/, 'the clamp is in units of the task\'s own line-height');
});

/* ----------------------------------------------------------------- PQ-027 */

test('what the view carries is a caption, not a column of disabled-looking buttons', () => {
  const rail = region(figure, '<aside ref={actionsRef} className="mathmaster-work-view-actions"', '</aside>', 'the Work View rail');
  const caption = region(rail, '<p className="mathmaster-work-view-capabilities">', '</p>', 'the capability caption');
  assert.match(caption, /In this view: /);
  assert.match(caption, /capabilityNames\.map\(\(name, index\) =>/);
  assert.match(caption, /data-work-view-capability=\{name\}/);
  // No capability label outside the caption.
  assert.equal((rail.match(/className="mathmaster-work-view-capability"/g) || []).length, 1);
  const css = executableSource(shellCss);
  const captionCss = region(css, '.mathmaster-work-view-capabilities {', '}', 'the caption style');
  assert.doesNotMatch(captionCss, /background|border-radius|padding/, 'nothing about the caption looks like a button');
  assert.doesNotMatch(css, /\.mathmaster-work-view-capability \{[^}]*(?:background|border-radius)/, 'no chip styling is left on the labels');
});

/* ----------------------------------------------------------------- PQ-025 */

test('the Enlarge button says how big it is, and the rows it floats over leave it room', () => {
  const effect = region(figure, "surface.style.setProperty('--mm-work-view-opener-space'", '}, [enlarged]);', 'the opener measurement');
  assert.match(effect, /opener\.offsetWidth/);
  assert.match(effect, /'--mm-work-view-opener-bottom', `\$\{Math\.ceil\(opener\.offsetTop \+ opener\.offsetHeight\)\}px`/);
  assert.match(effect, /new ResizeObserver\(publishSpace\)/);
  assert.match(effect, /removeProperty\('--mm-work-view-opener-space'\)/);
  assert.match(figure, /const surface = opener\?\.parentElement;\n\s*if \(enlarged \|\| !opener \|\| !surface\) return undefined;/, 'measured only while the button is shown');

  const css = executableSource(shellCss);
  const reserve = region(css, '.mathmaster-work-view-surface[data-enlarged="false"] .workflow-focus__rail,', '}', 'the reservation rule');
  assert.match(reserve, /\.workflow-focus__navigator/, 'a staged question\'s step chips');
  assert.match(reserve, /> fieldset > div > \.mathmaster-work-view-nested-surface > section > \.algebra-toolbar/, 'Step Algebra\'s toolbar, where it is the question');
  assert.match(reserve, /margin-right:\s*var\(--mm-work-view-opener-space/);
  const phone = region(css, '@media (max-width: 600px) {\n  .mathmaster-work-view-surface[data-enlarged="false"] .mathmaster-multipart-heading', '\n}\n', 'the phone reservations');
  assert.match(phone, /\.mathmaster-multipart-heading \{[^}]*padding-right:\s*var\(--mm-work-view-opener-space/);
  assert.match(phone, /\.algebra-toolbar \{[^}]*margin-right:\s*0;[^}]*margin-top:\s*var\(--mm-work-view-opener-bottom/, 'a wrapping toolbar starts below the button on a phone');

  // The hooks the rules need exist where the rows are drawn.
  assert.match(read('src/MultiAnswerGrader.jsx'), /<h2 className="mathmaster-multipart-heading"/);
  assert.match(read('src/StepByStepAlgebraCore.jsx'), /className=\{embedded \? 'algebra-embedded-toolbar' : 'algebra-toolbar'\}/);
});

/* ------------------------------------------------- PQ-037: with the keypad */

test('MathMaster\'s number keypad makes a phone Work View short; the software keyboard still does not', () => {
  // 390×664 with the keypad up left the step 28px under the regular chrome:
  // the box being typed into was 16px on screen. The keypad is the page's own
  // and docked to the bottom, so the step's height is what is left above it.
  const keypadUp = resolveWorkViewLayout({ width: 390, height: 664, keypadHeight: 274 });
  assert.equal(keypadUp.shortHeight, true);
  assert.equal(keypadUp.controlsPlacement, 'bottom', 'the action row stays where it was; only the chrome folds');
  assert.equal(resolveWorkViewLayout({ width: 375, height: 667, keypadHeight: 274 }).shortHeight, true);
  assert.equal(resolveWorkViewLayout({ width: 390, height: 664 }).shortHeight, false, 'keypad down: the regular chrome');
  assert.equal(resolveWorkViewLayout({ width: 390, height: 844, keypadHeight: 274 }).shortHeight, false, '570px above the keys is not short');
  assert.equal(resolveWorkViewLayout({ width: 390, height: 664, visualHeight: 300 }).shortHeight, false, 'the software keyboard never refolds the view');
});

const keypadWindow = ({ width, height, open = true, keypad = '274px' }) => ({
  innerWidth: width,
  innerHeight: height,
  document: { documentElement: {
    dataset: open ? { mobileKeypadOpen: 'true' } : {},
    style: { getPropertyValue: (name) => (name === '--mm-mobile-keypad' ? keypad : '') },
  } },
});

test('the keypad height is the one MobileViewportContainer publishes, counted only while docked to the bottom', () => {
  assert.equal(readBottomKeypadHeight(keypadWindow({ width: 390, height: 664 })), 274);
  assert.equal(readBottomKeypadHeight(keypadWindow({ width: 390, height: 664, open: false })), 0);
  assert.equal(readBottomKeypadHeight(keypadWindow({ width: 844, height: 390 })), 0, 'a short landscape keypad docks to the right');
  assert.equal(readWorkViewViewport(keypadWindow({ width: 390, height: 664 })).shortHeight, true);
  assert.equal(readWorkViewViewport(keypadWindow({ width: 390, height: 664, open: false })).shortHeight, false);
  // The two ends agree on what is published.
  const container = executableSource(read('src/components/student/MobileViewportContainer.jsx'));
  assert.match(container, /root\.dataset\.mobileKeypadOpen = 'true';/);
  assert.match(container, /root\.style\.setProperty\('--mm-mobile-keypad', `\$\{Math\.round\(height\)\}px`\);/);
});

test('Work View refolds when the keypad comes up or goes down', () => {
  const effect = region(figure, 'const next = readWorkViewViewport(window);', '}, [enlarged]);', 'the viewport listener');
  assert.match(effect, /current\.shortHeight === next\.shortHeight/, 'a change of short alone is a new layout');
  assert.match(effect, /new MutationObserver\(update\)/);
  assert.match(effect, /observe\(document\.documentElement, \{ attributes: true, attributeFilter: \['data-mobile-keypad-open'\] \}\)/);
  assert.match(effect, /keypad\?\.disconnect\(\);/);
});

