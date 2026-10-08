// Secure-item access parity, in a real browser at a Chromebook and a phone size.
//
// HOW TO RUN:
//
//   npx vite --config tests/browser/emulator/vite.config.mjs --port 5203 --strictPort &
//   node tests/browser/secureAccessParity.mjs                # AUDIT_ORIGIN to point elsewhere
//   node tests/browser/secureAccessParity.mjs --write        # record what the editor sent
//   SHOTS=/tmp/shots node tests/browser/secureAccessParity.mjs   # save screenshots
//
// WHAT IT CHECKS, and why each one is a student's problem:
//
//   1. THE TYPED ANSWER REACHES THE GRADER AS SOMETHING IT ACCEPTS. Answers
//      are typed into the real SecureMathAnswerField the way a student types
//      them (and, on the phone, built on its keypad), and exactly what the
//      field emitted is graded by the real server grader
//      (functions/lib/secureItems.js gradeItem). `3/4` must still be correct
//      against the keys 3/4 and 0.75. --write records the strings for
//      tests/platform/secureMathAnswerRoundTrip.test.mjs, which grades them in
//      CI.
//   2. A HELD ANSWER STAYS HELD. Read-only, neither typing nor the keypad
//      changes it or emits anything.
//   3. SUPPORTS READ THE PROMPT AND NOTHING ELSE, AND ONLY FOR A STUDENT WHOSE
//      PLAN GRANTS THEM. Read aloud says exactly the prompt; no choice or
//      stimulus text reaches speech, translation or vocabulary; a plan that
//      limits Read aloud to practice gets none on a test; no profile, no tray.
//   4. THE REFERENCE SHEET IS THE SAT'S, AND ONLY ON THE SAT: eleven figures,
//      three facts, a dialog that fits the phone and gives focus back.
//   5. THE GRAPHING CALCULATOR GRAPHS, OFFLINE: lines drawn by JSXGraph, a
//      value line, a refused line, zoom, trace and table — and it still opens
//      with the network cut once it has loaded in the background.
//   6. EACH EXAM GETS ITS OWN TOOLS: ACT no sheet; TSIA2 and ASVAB nothing on
//      an item without a calculator; a course test item marked none, nothing.
//   7. NOTHING SCROLLS SIDEWAYS, every control of these components is at
//      least 44px on its smaller side, and the page throws nothing.
//
// NO PRODUCTION CONTACT: every non-localhost request is aborted, and the
// services are swapped for stubs by tests/browser/emulator/vite.config.mjs.

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { speechTextFor } from '../../src/platform/language/speechText.js';
import { SAT_REFERENCE_SHEET } from '../../src/platform/assessment/satReferenceSheet.js';
import { MATH_GLOSSARY } from '../../src/platform/language/glossary/mathGlossaryEntries.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const RESULT = path.join(repo, 'tests/platform/fixtures/secureAnswerRoundTrip.json');
const origin = process.env.AUDIT_ORIGIN || 'http://localhost:5203';
const SHOTS = process.env.SHOTS || '';
const write = process.argv.includes('--write');
// ONLY=answer|item|dark|supports|tools runs one part while working on it; a
// --write run must run everything.
const ONLY = new Set(String(process.env.ONLY || '').split(',').map((part) => part.trim()).filter(Boolean));
const want = (part) => !ONLY.size || ONLY.has(part);
if (write && ONLY.size) throw new Error('--write records the whole run: drop ONLY');
const COLD_SERVER_BUDGET_MS = 180000;
const MIN_TAP = 44;
const SHEET_FORMULAS = SAT_REFERENCE_SHEET.figures.reduce((sum, figure) => sum + figure.formulas.length, 0);

if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const DEVICES = [
  { id: 'chromebook', width: 1366, height: 768, mobile: false },
  { id: 'phone-390', width: 390, height: 844, mobile: true },
];

/*
 * HOW EACH ANSWER IS ENTERED — the way a student on that device can.
 *
 *   typed    a Chromebook's keyboard. On a phone only into a TEXT box, through
 *            the phone's own keyboard (insertText, as a soft keyboard commits
 *            text): the math field opens no phone keyboard at all (inputmode
 *            none), so typing into it on a phone is something no student can do.
 *   keypad   a phone, tapping only the math keypad's keys (and the field
 *            itself to put the caret in a denominator).
 *   mixed    a Chromebook: digits from the keyboard, symbols from the keypad.
 */
const typed = (profile, text, keys, equivalence = null) => ({ profile, entry: 'keyboard', text, keys, equivalence });
const keypad = (profile, steps, keys, equivalence = null) => ({ profile, entry: 'keypad', steps, keys, equivalence });
const mixed = (profile, steps, keys, equivalence = null) => ({ profile, entry: 'keyboard+keypad', steps, keys, equivalence });

const TRIALS = [
  typed('number', '3/4', ['3/4', '0.75']),
  typed('number', '0.75', ['3/4']),
  typed('number', '-2.5', ['-2.5', '-5/2']),
  typed('number', '-1/2', ['-1/2', '-0.5']),
  typed('number', '5/13', ['25/65']),
  typed('number', '.75', ['0.75']),
  typed('number', '1200', ['1200']),
  typed('number', '-8', ['-8']),
  typed('set', '{41.95, 66.9, 91.85}', ['{41.95,66.9,91.85}'], 'numericSet'),
  typed('set', '{-4, -3, -2}', ['{-4,-3,-2}']),
  typed('interval', '(0, 400]', ['(0,400]'], 'interval'),
  typed('interval', '[-5, inf)', ['[-5,inf)'], 'interval'),
  typed('interval', '[-3,5)', ['[-3,5)'], 'interval'),
  // Typed text: what the student types is what is graded.
  typed('orderedPair', '(3, 0)', ['(3,0)']),
  typed('orderedPair', '(0, -8)', ['(0,-8)']),
  typed('orderedPair', '(1/2, 3)', ['(1/2,3)']),
  typed('orderedPair', '(-1/2, 3)', ['(-1/2,3)']),
  typed('inequality', 'x >= 4', ['x>=4']),
  typed('inequality', '-3 < x <= 5', ['-3<x<=5']),
  typed('inequality', '0<=h and h<=12', ['0<=h and h<=12']),
  typed('inequality', '|x-5|<=4', ['|x-5|<=4']),
  typed('inequality', 'x^2 + 1 > 5', ['x^2+1>5']),
  typed('inequality', 'y <= -2x + 3', ['y<=-2x+3']),
  typed('equation', 'log_2(32)=5', ['log_2(32)=5']),
  typed('expression', '2A/h-b_2', ['2A/h-b_2']),
  // A phone: the keypad and nothing else.
  keypad('number', ['a⁄b', '3', 'denominator', '4'], ['3/4', '0.75']),
  keypad('number', ['−', '2', '.', '5'], ['-2.5', '-5/2']),
  keypad('number', ['a⁄b', '−', '1', 'denominator', '2'], ['-1/2', '-0.5']),
  keypad('number', ['−', 'a⁄b', '1', 'denominator', '2'], ['-1/2', '-0.5']),
  keypad('number', ['.', '7', '5'], ['0.75']),
  keypad('number', ['1', '2', '0', '0'], ['1200']),
  keypad('set', ['{', '−', '4', ',', '−', '3', ',', '−', '2', '}'], ['{-4,-3,-2}']),
  keypad('set', ['{', '4', '1', '.', '9', '5', ',', '6', '6', '.', '9', '}'], ['{41.95,66.9}'], 'numericSet'),
  keypad('set', ['∅'], ['{}']),
  keypad('interval', ['[', '−', '5', ',', '∞', ')'], ['[-5,inf)'], 'interval'),
  keypad('interval', ['(', '−∞', ',', '3', ']', '∪', '[', '5', ',', '∞', ')'], ['(-inf,3]U[5,inf)'], 'interval'),
  keypad('interval', ['(', '0', ',', '4', '0', '0', ']'], ['(0,400]'], 'interval'),
  // A Chromebook: the keypad's own symbols between typed digits.
  mixed('interval', ['(', '−∞', { type: ',3]' }, '∪', { type: '[5,' }, '∞', { type: ')' }], ['(-inf,3]U[5,inf)'], 'interval'),
  mixed('set', ['{', { type: '-4,-3' }, '}'], ['{-4,-3}']),
  mixed('set', ['∅'], ['{}']),
  mixed('number', ['a⁄b', { type: '-1' }, 'denominator', { type: '2' }], ['-1/2', '-0.5']),
];

// The keypad's keys by what they show (MathInput.jsx; digits are "Insert 7").
const KEY_NAMES = {
  'a⁄b': 'Insert stacked fraction', '−': 'Insert negative sign', '.': 'Insert decimal point', ',': 'Insert comma',
  '{': 'Insert opening set brace', '}': 'Insert closing set brace', '∅': 'Insert empty set',
  '(': 'Insert open parenthesis', ')': 'Insert close parenthesis', '[': 'Insert open bracket', ']': 'Insert close bracket',
  '∞': 'Insert positive infinity', '−∞': 'Insert negative infinity', '∪': 'Insert union',
};
const keyName = (label) => KEY_NAMES[label] || (/^\d$/.test(label) ? `Insert ${label}` : null);
const describeSteps = (trial) => `${trial.entry === 'keypad' ? 'keypad' : 'keys'}: ${trial.steps.map((step) => (typeof step === 'string' ? (step === 'denominator' ? '▾' : step) : `"${step.type}"`)).join(' ')}`;

/** Does this trial run on this device, given the box the field gets there? */
const runsOn = (trial, device, editor) => {
  if (trial.entry === 'keypad') return device.mobile && editor === 'math';
  if (trial.entry === 'keyboard+keypad') return !device.mobile && editor === 'math';
  return !device.mobile || editor === 'text';
};

const gradeAgainst = async (profile, expected, response, equivalence) => {
  const grading = mathPath.privateGradingDefinition({
    responseFields: [{ id: 'answer', inputProfile: profile, expected, ...(equivalence ? { equivalence } : {}) }],
  });
  const verdict = await secureItems.gradeItem(grading, { responses: { answer: response } });
  return verdict.isCorrect === true;
};

// Types one character at a time. Playwright's `type` sends a shifted
// character without the Shift modifier, and MathLive reads the PHYSICAL key
// for `|` — so a bar arrived as a backslash, which no keyboard does. Press it
// with Shift held, as a student's keyboard sends it.
const typeLikeAStudent = async (page, text) => {
  for (const character of text) {
    if (character === '|') await page.keyboard.press('Shift+Backslash');
    else await page.keyboard.type(character, { delay: 14 });
  }
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
});

const findings = [];
const recorded = [];
let blockedRequests = 0;
let coldServer = true;

const record = (device, check, problems, detail = '') => findings.push({ device, check, problems, detail });

const openPage = async (context, query, problems) => {
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.goto(`${origin}/tests/browser/secureAccessParity.html?${query}`, { waitUntil: 'load', timeout: coldServer ? COLD_SERVER_BUDGET_MS : 30000 });
  coldServer = false;
  page.__errors = errors;
  page.__problems = problems;
  return page;
};

const closePage = async (page, problems) => {
  if (page.__errors.length) problems.push(`page error: ${page.__errors[0]}`);
  await page.close();
};

const shot = async (page, device, name) => {
  if (!SHOTS) return;
  await page.screenshot({ path: path.join(SHOTS, `${device.id}-${name}.png`) });
};

const layout = (page, selector = null) => page.evaluate((scope) => {
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const root = scope ? document.querySelector(scope) : document;
  const controls = root ? [...root.querySelectorAll('button, input, select, summary')].filter(visible) : [];
  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    small: controls
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { name: (element.getAttribute('aria-label') || element.textContent || element.tagName).trim().slice(0, 40), width: rect.width, height: rect.height, tag: element.tagName };
      })
      // A <summary> is a disclosure row, measured by its height.
      .filter((entry) => (entry.tag === 'SUMMARY' ? entry.height < 32 : Math.min(entry.width, entry.height) < 44)),
  };
}, selector);

// Every question control a docked tool would hide. A drawer spans the whole
// height below the toolbar, so any control whose columns it shares is under
// it once scrolled to — the comparison is horizontal.
const coveredQuestionControls = (page) => page.evaluate(() => {
  const drawers = [...document.querySelectorAll('[data-sat-reference-sheet], [data-graphing-calculator]')]
    .map((element) => ({ name: element.hasAttribute('data-sat-reference-sheet') ? 'the reference sheet' : 'the graphing calculator', rect: element.getBoundingClientRect() }));
  const visible = (element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; };
  const controls = [...document.querySelectorAll('[data-question] h1, [data-question] button, [data-question] input, [data-question] math-field, [data-question] [data-support-panel]')].filter(visible);
  const covered = [];
  for (const control of controls) {
    const rect = control.getBoundingClientRect();
    for (const drawer of drawers) {
      const shared = Math.min(rect.right, drawer.rect.right) - Math.max(rect.left, drawer.rect.left);
      if (shared > 0.5) covered.push(`${drawer.name} covers ${Math.round(shared)}px of ${(control.getAttribute('aria-label') || control.textContent || control.tagName).trim().slice(0, 40)}`);
    }
  }
  return covered;
});

// What is actually on top at the middle of each open tool.
const toolsOnTop = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sat-reference-sheet], [data-graphing-calculator]')].map((drawer) => {
  const rect = drawer.getBoundingClientRect();
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(rect.height / 2, 120));
  return { name: drawer.hasAttribute('data-sat-reference-sheet') ? 'reference sheet' : 'graphing calculator', onTop: drawer.contains(hit), zIndex: Number(getComputedStyle(drawer).zIndex) };
}));

for (const device of DEVICES) {
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    isMobile: device.mobile,
    hasTouch: device.mobile,
    deviceScaleFactor: device.mobile ? 2 : 1,
  });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    blockedRequests += 1;
    return route.abort();
  });

  // ------------------------------------------------------------ 1. round trip
  if (want('answer')) {
    const problems = [];
    const page = await openPage(context, 'scene=answer', problems);
    await page.waitForFunction(() => typeof window.__mmSetField === 'function', null, { timeout: 30000 });
    const tapOrClick = async (locator) => { if (device.mobile) await locator.tap(); else await locator.click(); };
    const focusEditor = async (editor) => {
      if (editor === 'math') {
        const box = await page.locator('math-field').first().boundingBox();
        if (device.mobile) await page.touchscreen.tap(box.x + 30, box.y + box.height / 2);
        else await page.mouse.click(box.x + 30, box.y + box.height / 2);
        await page.waitForFunction(() => document.activeElement?.tagName === 'MATH-FIELD', null, { timeout: 4000 }).catch(() => {});
      } else {
        await tapOrClick(page.locator('input[data-secure-answer-editor]'));
      }
      await page.waitForTimeout(80);
    };
    const pressKey = async (label) => {
      const name = keyName(label);
      const key = page.locator(`.mathmaster-math-input-tools button[aria-label="${name}"], .mathmaster-required-answer-keys button[aria-label="${name}"]`);
      if (!name || !(await key.count())) throw new Error(`no "${label}" key on the ${device.id} keypad`);
      await tapOrClick(key.first());
      await page.waitForTimeout(90);
    };
    // A student puts the caret in the denominator by touching it.
    const tapDenominator = async () => {
      const line = await page.evaluate(() => {
        const rects = [...document.querySelector('math-field').shadowRoot.querySelectorAll('.ML__frac-line')].map((element) => element.getBoundingClientRect());
        const rect = rects.at(-1);
        return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height } : null;
      });
      if (!line) throw new Error('no fraction to tap');
      if (device.mobile) await page.touchscreen.tap(line.x, line.y + 12);
      else await page.mouse.click(line.x, line.y + 12);
      await page.waitForTimeout(120);
    };
    const enter = async (trial, editor) => {
      if (trial.entry === 'keyboard') {
        // A phone's own keyboard commits text; a Chromebook types it key by key.
        if (device.mobile) await page.keyboard.insertText(trial.text);
        else await typeLikeAStudent(page, trial.text);
        return;
      }
      for (const step of trial.steps) {
        if (step === 'denominator') await tapDenominator();
        else if (typeof step === 'string') await pressKey(step);
        else await typeLikeAStudent(page, step.type);
      }
      if (editor !== 'math') throw new Error('keys need the math field');
    };

    for (const trial of TRIALS) {
      const { profile, keys, equivalence } = trial;
      await page.evaluate((field) => window.__mmSetField(field), { id: 'answer', label: 'Answer', inputProfile: profile });
      await page.waitForFunction((p) => document.querySelector(`[data-profile="${p}"] [data-secure-answer-editor]`) !== null, profile);
      const box = await page.evaluate(() => {
        const element = document.querySelector('[data-secure-answer-editor]');
        return { editor: element.getAttribute('data-secure-answer-editor'), inputMode: (element.tagName === 'INPUT' ? element : element.querySelector('math-field'))?.getAttribute('inputmode') ?? null };
      });
      const { editor } = box;
      if (!runsOn(trial, device, editor)) continue;
      // The keyboard each box asks a phone for: none for the math field (its
      // keypad is the keyboard), letters and symbols for a text box.
      if (device.mobile && editor === 'math' && box.inputMode !== 'none') problems.push(`${profile}: the phone math field asks for a keyboard (${box.inputMode})`);
      if (editor === 'text' && box.inputMode !== 'text') problems.push(`${profile}: the text box asks a phone for inputmode ${box.inputMode}`);
      let emitted = '';
      let failure = '';
      for (let attempt = 0; attempt < 3 && !emitted; attempt += 1) {
        failure = '';
        await focusEditor(editor);
        try {
          await enter(trial, editor);
        } catch (error) {
          failure = String(error?.message || error);
        }
        await page.waitForTimeout(150);
        emitted = await page.evaluate(() => window.__mmEmitted.at(-1) ?? '');
        // A keystroke lost to focus timing leaves a fragment: type it again.
        if (trial.entry === 'keyboard' && emitted.replace(/\\[a-z]+|[{}\s]/g, '').length < Math.min(2, trial.text.replace(/\s/g, '').length)) emitted = '';
        if (!emitted) {
          await page.evaluate(() => window.__mmReset());
          await page.waitForTimeout(150);
        }
      }
      const label = trial.entry === 'keyboard' ? trial.text : describeSteps(trial);
      if (failure) problems.push(`${profile} ${label}: ${failure}`);
      const shown = await page.evaluate(() => document.querySelector('math-field')?.value ?? document.querySelector('input[data-secure-answer-editor]')?.value ?? '');
      if (shown !== emitted) problems.push(`${profile} "${label}": the field shows ${JSON.stringify(shown)} but emitted ${JSON.stringify(emitted)}`);
      const verdicts = [];
      for (const key of keys) verdicts.push([key, await gradeAgainst(profile, key, emitted, equivalence)]);
      verdicts.filter(([, ok]) => !ok).forEach(([key]) => problems.push(`${profile} "${label}" sent ${JSON.stringify(emitted)}, which the server grader does not accept for ${key}`));
      const entry = trial.entry === 'keyboard' && device.mobile ? 'soft-keyboard' : trial.entry;
      recorded.push({ device: device.id, profile, editor, entry, typed: label, serialized: emitted, keys, equivalence: equivalence || null, gradedCorrect: verdicts.every(([, ok]) => ok) });
      if (device.mobile && trial.entry === 'keypad' && label === describeSteps(TRIALS.find((entry) => entry.entry === 'keypad'))) await shot(page, device, 'answer-keypad-3-4');
    }
    // What a screen reader hears on landing in each box: MathLive hands only
    // the name to its keyboard sink, so the typing hint must be in it there;
    // a text box carries it as its description.
    {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Accessibility.enable');
      for (const [profile, hint] of [['number', /Type only the number/], ['orderedPair', /ordered pair/]]) {
        await page.evaluate((field) => window.__mmSetField(field), { id: 'answer', label: 'Answer', inputProfile: profile });
        await page.waitForTimeout(250);
        await page.locator('[data-secure-answer-editor] math-field, input[data-secure-answer-editor]').first().focus();
        await page.waitForTimeout(150);
        const { nodes } = await cdp.send('Accessibility.getFullAXTree');
        const focused = nodes.filter((node) => !/WebArea/.test(node.role?.value || '') && (node.properties || []).some((property) => property.name === 'focused' && property.value?.value === true)).at(-1);
        const heard = `${focused?.name?.value || ''} | ${focused?.description?.value || ''}`;
        if (!hint.test(heard)) problems.push(`a screen reader landing in the ${profile} box hears ${JSON.stringify(heard)}, without the typing hint`);
      }
      await cdp.detach();
    }
    if (device.mobile) {
      await page.evaluate((field) => window.__mmSetField(field), { id: 'answer', label: 'Answer', inputProfile: 'inequality' });
      await page.waitForTimeout(250);
      await page.locator('input[data-secure-answer-editor]').tap();
      await page.keyboard.insertText('0<=h and h<=12');
      await page.waitForTimeout(150);
      await shot(page, device, 'answer-inequality-text');
    }

    await closePage(page, problems);

    // ---------------------------------------------------------- 2. read-only
    // A held answer ignores every way in: typing (a backslash included, which
    // MathInput inserts itself), paste, Space, Backspace and the keypad — and
    // Tab still leaves, so the field is no trap. Once unlocked, the next
    // keystroke adds to the held answer and nothing that was pressed while it
    // was held. The field mounts read-only, as a recorded item opens.
    const held = await openPage(context, 'scene=held', problems);
    await held.waitForSelector('math-field');
    await held.waitForTimeout(500);
    // The exam's integrity logger listens on the document; a held field must
    // not hide a Ctrl+V or a paste from it.
    await held.evaluate(() => {
      window.__mmDocumentSaw = [];
      document.addEventListener('keydown', (event) => { if (event.ctrlKey || event.metaKey) window.__mmDocumentSaw.push(`key:${event.key.toLowerCase()}`); });
      document.addEventListener('paste', () => window.__mmDocumentSaw.push('paste'));
    });
    const before = await held.evaluate(() => ({ emitted: window.__mmEmitted.length, value: document.querySelector('math-field').value }));
    const fieldBox = await held.locator('math-field').first().boundingBox();
    const caretAtEnd = async () => {
      if (device.mobile) await held.touchscreen.tap(fieldBox.x + fieldBox.width - 24, fieldBox.y + fieldBox.height / 2);
      else await held.mouse.click(fieldBox.x + fieldBox.width - 24, fieldBox.y + fieldBox.height / 2);
      await held.waitForTimeout(120);
    };
    await caretAtEnd();
    // Checked after EVERY attempt: a later Backspace can delete what an
    // earlier key let in, and a single look at the end would miss both.
    const stillHeld = async (what) => {
      await held.waitForTimeout(90);
      const value = await held.evaluate(() => document.querySelector('math-field').value);
      if (value !== before.value) problems.push(`${what} changed a held answer to ${JSON.stringify(value)}`);
    };
    for (const key of ['Backslash', '9', 'Space', 'Backspace', 'ControlOrMeta+V', 'ControlOrMeta+Backslash', 'ControlOrMeta+z', 'ControlOrMeta+y', 'ControlOrMeta+x', 'Delete']) {
      await held.keyboard.press(key);
      await stillHeld(key);
    }
    await held.evaluate(() => {
      const data = new DataTransfer();
      data.setData('text/plain', '77');
      document.querySelector('math-field').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true }));
    });
    await stillHeld('a paste');
    const heldKey = held.locator(`.mathmaster-math-input-tools button[aria-label="${device.mobile ? 'Insert 9' : 'Insert stacked fraction'}"]`);
    if (await heldKey.count()) await heldKey.first().click({ force: true });
    else problems.push('no keypad key to press while the answer was held');
    await stillHeld('a keypad key');
    await held.waitForTimeout(60);
    const after = await held.evaluate(() => ({ emitted: window.__mmEmitted.length, value: document.querySelector('math-field').value, readOnly: document.querySelector('math-field').readOnly }));
    if (!after.readOnly) problems.push('read-only did not reach the math field');
    if (after.emitted !== before.emitted) problems.push('a read-only field emitted a change');
    if (after.value !== before.value) problems.push(`a read-only field changed from ${before.value} to ${after.value}`);
    const documentSaw = await held.evaluate(() => window.__mmDocumentSaw);
    if (!documentSaw.includes('key:v') || !documentSaw.includes('paste')) problems.push(`the integrity logger would not see Ctrl+V or a paste in a held field: ${documentSaw.join(', ')}`);
    // Still in the field (the keypad keeps focus there). No second click: a
    // second click on a focused math field selects in MathLive, and its first
    // Tab then only leaves the selection — the same in an editable field.
    if (!(await held.evaluate(() => document.activeElement?.tagName === 'MATH-FIELD'))) await held.locator('math-field').first().focus();
    await held.keyboard.press('Tab');
    await held.waitForTimeout(120);
    if (await held.evaluate(() => document.activeElement?.tagName === 'MATH-FIELD')) problems.push('Tab could not leave the held field');
    await held.evaluate(() => window.__mmSetReadOnly(false));
    await held.waitForTimeout(150);
    await caretAtEnd();
    await held.keyboard.press('End');
    await held.keyboard.type('0', { delay: 20 });
    await held.waitForTimeout(150);
    const unlocked = await held.evaluate(() => window.__mmEmitted.at(-1) ?? '');
    if (/backslash|77|9/.test(unlocked) || !unlocked.startsWith('\\frac{3}{4}')) problems.push(`after unlocking, the field sent ${JSON.stringify(unlocked)}: something pressed while it was held got in`);
    await closePage(held, problems);
    record(device.id, 'answer round trip + read-only', problems, `${recorded.filter((entry) => entry.device === device.id).length} answers ${device.mobile ? 'on the keypad and the phone keyboard' : 'typed and keyed'}`);
  }

  // ------------------------------------------- 3 + 4 + 5. the SAT item scene
  if (want('item')) {
    const problems = [];
    const page = await openPage(context, 'scene=item&examType=digitalSAT&supports=full', problems);
    await page.waitForSelector('[data-exam-tools]', { state: 'attached', timeout: 30000 });
    await page.waitForSelector('[data-student-support-tray]', { timeout: 15000 }).catch(() => problems.push('the support tray did not appear for an entitled student'));
    await page.waitForTimeout(600);
    const tools = await page.evaluate(() => window.__mmTools);
    if (!tools?.referenceSheet || !tools?.graphingCalculator) problems.push(`the SAT resolved ${JSON.stringify(tools)}`);
    let measured = await layout(page);
    if (measured.scrollWidth > measured.clientWidth) problems.push(`scrolls sideways (${measured.scrollWidth} > ${measured.clientWidth})`);
    const ownControls = ['[data-exam-tools]', '[data-secure-access-supports]'];
    for (const scope of ownControls) {
      const small = (await layout(page, scope)).small;
      if (small.length) problems.push(`${small.length} control(s) under ${MIN_TAP}px in ${scope}: ${small.map((entry) => entry.name).join(', ')}`);
    }
    await shot(page, device, 'sat-item');

    // Supports: prompt only.
    const buttons = await page.evaluate(() => [...document.querySelectorAll('[data-support-tool]')].map((element) => element.getAttribute('data-support-tool')));
    for (const tool of ['translate', 'vocabulary', 'read-aloud']) if (!buttons.includes(tool)) problems.push(`no ${tool} button for an entitled student`);
    for (const tool of ['break-it-down', 'say-it']) if (buttons.includes(tool)) problems.push(`${tool} offered on a secure item`);
    if (await page.locator('[data-support-steps]').count()) problems.push('Break it down steps shown on a secure item');
    await page.click('[data-support-tool="read-aloud"]');
    await page.waitForTimeout(150);
    const prompt = 'A line has a slope of $\\frac{3}{4}$ and a y-intercept of $-2$. If $4x - 3 = 0$, what is the value of $x$?';
    const spoken = await page.evaluate(() => window.__mmSpoken.slice());
    if (spoken.length !== 1) problems.push(`Read aloud spoke ${spoken.length} times`);
    if (spoken[0] !== speechTextFor(prompt)) problems.push(`Read aloud said ${JSON.stringify(spoken[0])}, not the prompt`);
    if (spoken.some((text) => /CHOICE|STIMULUS/.test(text))) problems.push('Read aloud read beyond the prompt');
    const stop = page.getByRole('button', { name: /Stop reading/ });
    if (!(await stop.count())) problems.push('no Stop reading control after reading started');
    else {
      await stop.click();
      if (await page.evaluate(() => window.speechSynthesis.speaking)) problems.push('Stop reading did not stop speech');
      if (await stop.count()) problems.push('Stop reading stayed after reading stopped');
    }
    await page.click('[data-support-tool="vocabulary"]');
    await page.waitForSelector('[data-support-panel="vocabulary"] dt', { timeout: 10000 }).catch(() => problems.push('the vocabulary panel did not load'));
    const vocabulary = await page.evaluate(() => ({
      ids: [...document.querySelectorAll('[data-vocabulary-term]')].map((element) => element.getAttribute('data-vocabulary-term')),
      terms: [...document.querySelectorAll('[data-support-panel="vocabulary"] dt')].map((element) => element.textContent),
      text: document.querySelector('[data-support-panel="vocabulary"]')?.textContent || '',
    }));
    if (!vocabulary.terms.some((term) => /slope/i.test(term))) problems.push(`vocabulary missed "slope": ${vocabulary.terms.join(', ')}`);
    // The word and its meaning; the glossary's worked example ("…has slope 2")
    // would be the item worked for the student.
    if (/Example/i.test(vocabulary.text)) problems.push('the vocabulary panel shows an "Example" on a secure item');
    for (const id of vocabulary.ids) {
      const entry = MATH_GLOSSARY[id];
      if (!entry) problems.push(`vocabulary showed an unknown term ${id}`);
      else if (vocabulary.text.includes(entry.example)) problems.push(`the vocabulary panel shows the example for ${id}: ${entry.example}`);
      else if (!vocabulary.text.includes(entry.definition)) problems.push(`the vocabulary panel lost the definition of ${id}`);
    }
    await shot(page, device, 'sat-item-vocabulary');
    await page.click('[data-support-tool="translate"]');
    await page.waitForSelector('[data-support-panel="translate"]', { timeout: 10000 }).catch(() => problems.push('the translate panel did not open'));
    const translated = await page.evaluate(() => document.querySelector('[data-support-panel="translate"]')?.textContent || '');
    if (!/¿cuál es el valor de/i.test(translated)) problems.push(`translation did not render the prompt in Spanish: ${translated.slice(0, 120)}`);
    if (/CHOICE|STIMULUS/.test(translated)) problems.push('Translate showed text beyond the prompt');
    await shot(page, device, 'sat-item-translate');
    const evidence = await page.evaluate(() => window.__mmEvidence.map((entry) => `${entry.supportId}:${entry.eventType}`));
    for (const fact of ['text-to-speech:used', 'glossary-lookup:used', 'translation:used']) if (!evidence.includes(fact)) problems.push(`no ${fact} evidence`);
    await page.click('[data-support-tool="translate"]');

    // The reference sheet.
    await page.click('[data-sat-reference-launcher]');
    await page.waitForSelector('[data-sat-reference-sheet]');
    await page.waitForTimeout(500);
    const sheet = await page.evaluate(() => {
      const dialog = document.querySelector('[data-sat-reference-sheet]');
      const title = document.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent;
      const rect = dialog.getBoundingClientRect();
      return {
        role: dialog.getAttribute('role'),
        title,
        figures: dialog.querySelectorAll('[data-sat-reference-figure]').length,
        facts: dialog.querySelectorAll('[data-sat-reference-fact]').length,
        formulas: dialog.querySelectorAll('[data-sat-reference-figure] math-span').length,
        focused: dialog.contains(document.activeElement),
        left: rect.left, right: rect.right, width: rect.width,
        overflowX: dialog.scrollWidth - dialog.clientWidth,
        viewport: document.documentElement.clientWidth,
      };
    });
    if (sheet.role !== 'dialog' || sheet.title !== 'Reference sheet') problems.push(`reference sheet is not a labelled dialog: ${JSON.stringify(sheet)}`);
    if (sheet.figures !== 11) problems.push(`reference sheet shows ${sheet.figures} figures, not 11`);
    if (sheet.facts !== 3) problems.push(`reference sheet shows ${sheet.facts} facts, not 3`);
    if (sheet.formulas !== SHEET_FORMULAS) problems.push(`${sheet.formulas} formulas typeset, not ${SHEET_FORMULAS}`);
    if (!sheet.focused) problems.push('focus did not move into the reference sheet');
    if (sheet.left < -1 || sheet.right > sheet.viewport + 1 || sheet.overflowX > 1) problems.push(`reference sheet does not fit: ${JSON.stringify(sheet)}`);
    const sheetSmall = (await layout(page, '[data-sat-reference-sheet]')).small;
    if (sheetSmall.length) problems.push(`reference sheet controls under ${MIN_TAP}px: ${sheetSmall.map((entry) => entry.name).join(', ')}`);
    await shot(page, device, 'sat-reference-sheet');
    if (!device.mobile) {
      const covered = await coveredQuestionControls(page);
      if (covered.length) problems.push(`with the reference sheet open: ${covered.join('; ')}`);
    } else {
      const reach = await page.evaluate(() => ({ sheetTop: document.querySelector('[data-sat-reference-sheet]').getBoundingClientRect().top, toolbarBottom: document.querySelector('header').getBoundingClientRect().bottom }));
      if (reach.sheetTop < reach.toolbarBottom - 0.5) problems.push(`the phone sheet rises over the exam toolbar (${Math.round(reach.sheetTop)} < ${Math.round(reach.toolbarBottom)})`);
    }
    await page.evaluate(() => { const dialog = document.querySelector('[data-sat-reference-sheet]'); dialog.scrollTop = dialog.scrollHeight; });
    await page.waitForTimeout(200);
    await shot(page, device, 'sat-reference-sheet-end');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const afterEscape = await page.evaluate(() => ({ open: Boolean(document.querySelector('[data-sat-reference-sheet]')), focus: document.activeElement?.hasAttribute('data-sat-reference-launcher') }));
    if (afterEscape.open) problems.push('Escape did not close the reference sheet');
    if (!afterEscape.focus) problems.push('focus did not return to the reference sheet button');

    // The graphing calculator — offline once loaded.
    await page.waitForFunction(() => performance.getEntriesByType('resource').some((entry) => /jsxgraph/i.test(entry.name)), null, { timeout: 20000 })
      .catch(() => problems.push('JSXGraph was not loaded in the background'));
    await context.setOffline(true);
    await page.click('[data-graphing-calculator-launcher]');
    await page.waitForSelector('[data-graphing-calculator]');
    const focusIn = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    if (focusIn !== 'Line 1') problems.push(`focus went to ${focusIn}, not the first line`);
    await page.locator('[data-graphing-line="1"] input').fill('y = 2x + 1');
    await page.getByRole('button', { name: '+ Add line' }).click();
    await page.locator('[data-graphing-line="2"] input').fill('x^2 - 3');
    await page.getByRole('button', { name: '+ Add line' }).click();
    await page.locator('[data-graphing-line="3"] input').fill('(3+4)/2');
    await page.getByRole('button', { name: '+ Add line' }).click();
    await page.locator('[data-graphing-line="4"] input').fill('y = mx + b');
    await page.waitForSelector('[data-graphing-board="ready"]', { timeout: 20000 }).catch(() => problems.push('the graph did not draw offline'));
    await page.waitForTimeout(400);
    const graph = await page.evaluate(() => {
      const board = document.querySelector('[data-graphing-board]');
      const strokes = [...board.querySelectorAll('svg path')].map((element) => element.getAttribute('stroke')).filter(Boolean);
      return {
        strokes,
        statuses: [...document.querySelectorAll('[data-graphing-status]')].map((element) => `${element.getAttribute('data-graphing-status')}:${element.textContent}`),
        description: board.getAttribute('aria-label'),
      };
    });
    const curveColors = ['#1a73e8', '#c5221f', '#8ab4f8', '#f28b82'];
    const drawnCurves = new Set(graph.strokes.filter((stroke) => curveColors.includes(stroke.toLowerCase())));
    if (drawnCurves.size < 2) problems.push(`expected two drawn lines, found strokes ${graph.strokes.join(',')}`);
    if (!graph.statuses.includes('value:= 3.5')) problems.push(`no "= 3.5" for (3+4)/2: ${graph.statuses.join(' | ')}`);
    if (!graph.statuses.some((status) => status.startsWith('error:'))) problems.push('y = mx + b was not refused with a message');
    if (!/line 1, y = 2x \+ 1, as the blue solid line/.test(graph.description || '')) problems.push(`graph description: ${graph.description}`);
    await shot(page, device, 'sat-graphing');
    // Removing a line by keyboard: focus moves to the line before it, still
    // inside the panel, so Escape still closes it.
    await page.getByRole('button', { name: 'Remove line 4' }).focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const afterRemove = await page.evaluate(() => ({ lines: document.querySelectorAll('[data-graphing-line]').length, focus: document.activeElement?.getAttribute('aria-label'), inPanel: Boolean(document.activeElement?.closest('[data-graphing-calculator]')) }));
    if (afterRemove.lines !== 3) problems.push(`removing line 4 left ${afterRemove.lines} lines`);
    if (afterRemove.focus !== 'Line 3' || !afterRemove.inPanel) problems.push(`after removing a line, focus went to ${afterRemove.focus} (in the panel: ${afterRemove.inPanel})`);
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.waitForTimeout(200);
    const zoomed = await page.evaluate(() => document.querySelector('[data-graphing-board]').getAttribute('aria-label'));
    if (!/x from −5 to 5/.test(zoomed || '')) problems.push(`zoom in did not narrow the view: ${zoomed}`);
    await page.getByLabel('Find y when x =').fill('1/2');
    await page.waitForTimeout(150);
    const traceHalf = await page.evaluate(() => [...document.querySelectorAll('[data-graphing-trace]')].map((element) => element.textContent.trim()));
    if (!traceHalf.includes('Line 1: y = 2') || !traceHalf.includes('Line 2: y = −2.75')) problems.push(`trace at x = 1/2: ${traceHalf.join(' | ')}`);
    await page.getByLabel('Find y when x =').fill('2');
    await page.waitForTimeout(150);
    const trace = await page.evaluate(() => [...document.querySelectorAll('[data-graphing-trace]')].map((element) => element.textContent.trim()));
    if (!trace.includes('Line 1: y = 5') || !trace.includes('Line 2: y = 1')) problems.push(`trace at x = 2: ${trace.join(' | ')}`);
    await page.locator('details summary', { hasText: 'Table of values' }).click();
    await page.waitForSelector('[data-graphing-table]');
    const table = await page.evaluate(() => [...document.querySelectorAll('[data-graphing-table] tbody tr')].map((row) => [...row.cells].map((cell) => cell.textContent).join(',')));
    if (table[0] !== '−3,−5' || table.length !== 7) problems.push(`table of y = 2x + 1: ${table.join(' | ')}`);
    // An empty start box is no number — not a table from 0.
    const startBox = page.getByLabel('Start at x =');
    await startBox.fill('');
    await page.waitForTimeout(120);
    if (await page.locator('[data-graphing-table]').count()) problems.push('an empty "Start at x =" still drew a table');
    await startBox.fill('-3');
    await page.waitForSelector('[data-graphing-table]');
    const calculatorSmall = (await layout(page, '[data-graphing-calculator]')).small;
    if (calculatorSmall.length) problems.push(`graphing controls under ${MIN_TAP}px: ${calculatorSmall.map((entry) => entry.name).join(', ')}`);
    measured = await layout(page);
    if (measured.scrollWidth > measured.clientWidth) problems.push(`scrolls sideways with the calculator open (${measured.scrollWidth} > ${measured.clientWidth})`);
    await shot(page, device, 'sat-graphing-table');
    if (!device.mobile) {
      const covered = await coveredQuestionControls(page);
      if (covered.length) problems.push(`with the graphing calculator open: ${covered.join('; ')}`);
    }

    // Both tools: side by side on a Chromebook, with the question between
    // them; on a phone, where both rise into the same place, one at a time.
    await page.click('[data-sat-reference-launcher]');
    await page.waitForSelector('[data-sat-reference-sheet]');
    await page.waitForTimeout(400);
    const both = await page.evaluate(() => ({ sheet: Boolean(document.querySelector('[data-sat-reference-sheet]')), calculator: Boolean(document.querySelector('[data-graphing-calculator]')), room: window.__mmRoom }));
    if (device.mobile) {
      if (both.calculator) problems.push('on a phone the calculator stayed open under the reference sheet');
      if (both.room.paddingLeft || both.room.paddingRight) problems.push(`a phone pads the question for a bottom sheet: ${JSON.stringify(both.room)}`);
      await shot(page, device, 'sat-one-tool-at-a-time');
    } else {
      if (!both.sheet || !both.calculator) problems.push(`at ${device.width}px both tools should stay open side by side: ${JSON.stringify(both)}`);
      const covered = await coveredQuestionControls(page);
      if (covered.length) problems.push(`with both tools open: ${covered.join('; ')}`);
      measured = await layout(page);
      if (measured.scrollWidth > measured.clientWidth) problems.push(`scrolls sideways with both tools open (${measured.scrollWidth} > ${measured.clientWidth})`);
      await shot(page, device, 'sat-both-tools');
    }

    // "Enlarge question" opened with a tool already open: the tool stays on
    // top of Work View (2147483000), under the layers that must cover it.
    await page.evaluate(() => window.__mmSetWorkView(true));
    await page.waitForTimeout(250);
    for (const tool of await toolsOnTop(page)) {
      if (!tool.onTop) problems.push(`the ${tool.name} is hidden behind Work View`);
      if (!(tool.zIndex > 2147483050 && tool.zIndex < 2147483100)) problems.push(`the ${tool.name} is at layer ${tool.zIndex}: above Work View and its keypad, below the inactivity dialog`);
    }
    await shot(page, device, 'sat-tools-over-work-view');
    await page.evaluate(() => window.__mmSetWorkView(false));
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    if (await page.locator('[data-sat-reference-sheet]').count()) problems.push('Escape did not close the reference sheet');
    if (!device.mobile) {
      await page.locator('[data-graphing-line="1"] input').focus();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    if (await page.locator('[data-graphing-calculator]').count()) problems.push('Escape did not close the graphing calculator');
    if (JSON.stringify(await page.evaluate(() => [window.__mmRoom.paddingLeft, window.__mmRoom.paddingRight])) !== '[0,0]') problems.push('the question column kept its room after the tools closed');
    await context.setOffline(false);
    await closePage(page, problems);
    record(device.id, 'SAT item: supports, reference sheet, graphing (offline)', problems);
  }

  // ------------------------------------------- 5b. the tools in dark mode
  if (want('dark')) {
    const problems = [];
    const page = await openPage(context, 'scene=item&examType=digitalSAT&supports=none&theme=dark', problems);
    await page.waitForSelector('[data-exam-tools]', { state: 'attached', timeout: 30000 });
    await page.click('[data-graphing-calculator-launcher]');
    await page.locator('[data-graphing-line="1"] input').fill('y = x^2');
    await page.waitForSelector('[data-graphing-board="ready"]', { timeout: 20000 }).catch(() => problems.push('the graph did not draw'));
    await page.waitForTimeout(300);
    const dark = await page.evaluate(() => ({
      strokes: [...document.querySelectorAll('[data-graphing-board] svg path')].map((element) => String(element.getAttribute('stroke') || '').toLowerCase()),
      panel: getComputedStyle(document.querySelector('[data-graphing-calculator]')).backgroundColor,
    }));
    if (!dark.strokes.includes('#8ab4f8')) problems.push(`the first line is not drawn in the dark palette: ${dark.strokes.join(',')}`);
    if (dark.panel === 'rgb(255, 255, 255)') problems.push('the calculator panel stayed white in dark mode');
    await shot(page, device, 'dark-graphing');
    await page.keyboard.press('Escape');
    await page.click('[data-sat-reference-launcher]');
    await page.waitForSelector('[data-sat-reference-sheet]');
    await page.waitForTimeout(400);
    const sheetBackground = await page.evaluate(() => getComputedStyle(document.querySelector('[data-sat-reference-sheet]')).backgroundColor);
    if (sheetBackground === 'rgb(255, 255, 255)') problems.push('the reference sheet stayed white in dark mode');
    await shot(page, device, 'dark-reference-sheet');
    await closePage(page, problems);
    record(device.id, 'dark mode: calculator palette and sheet surfaces', problems);
  }

  // ------------------------------------------------ 3b. who gets the tray
  if (want('supports')) for (const [supports, expectTools, label] of [
    ['none', [], 'no profile, no tray'],
    ['practiceOnly', ['vocabulary'], 'Read aloud limited to practice is not on a test'],
  ]) {
    const problems = [];
    const page = await openPage(context, `scene=item&examType=digitalSAT&supports=${supports}`, problems);
    await page.waitForSelector('[data-exam-tools]', { state: 'attached', timeout: 30000 });
    await page.waitForTimeout(800);
    const shown = await page.evaluate(() => [...document.querySelectorAll('[data-support-tool]')].map((element) => element.getAttribute('data-support-tool')));
    if (JSON.stringify(shown) !== JSON.stringify(expectTools)) problems.push(`showed ${JSON.stringify(shown)}, expected ${JSON.stringify(expectTools)}`);
    if (!expectTools.length && await page.locator('[data-secure-access-supports]').count()) problems.push('rendered a supports block with nothing in it');
    await closePage(page, problems);
    record(device.id, `supports: ${label}`, problems);
  }

  // ------------------------------- 3c. an authored translation, as itself
  if (want('supports')) {
    const problems = [];
    const page = await openPage(context, 'scene=item&examType=digitalSAT&supports=spanishOnly&translations=authored', problems);
    await page.waitForSelector('[data-support-tool="translate"]', { timeout: 15000 }).catch(() => problems.push('no Translate for a Spanish-language student with an authored translation'));
    if (await page.locator('[data-support-tool="translate"]').count()) {
      await page.click('[data-support-tool="translate"]');
      await page.waitForSelector('[data-support-panel="translate"]', { timeout: 10000 }).catch(() => problems.push('the translate panel did not open'));
      const panel = await page.evaluate(() => ({ text: document.querySelector('[data-support-panel="translate"]')?.textContent || '', lang: document.querySelector('[data-support-panel="translate"]')?.getAttribute('lang') }));
      if (!/Una recta tiene una pendiente/.test(panel.text)) problems.push(`the authored translation is not shown: ${panel.text.slice(0, 120)}`);
      if (/A line has a slope/.test(panel.text)) problems.push('the Translate panel repeats the English prompt');
      if (panel.lang !== 'es') problems.push(`the translation is not marked Spanish (lang=${panel.lang})`);
      const evidence = await page.evaluate(() => window.__mmEvidence.filter((entry) => entry.supportId === 'translation').map((entry) => `${entry.eventType}:${entry.details?.provider || ''}`));
      if (!evidence.includes('available:authored') || !evidence.includes('used:')) problems.push(`translation evidence: ${evidence.join(', ')}`);
      await shot(page, device, 'sat-item-authored-translate');
    }
    await closePage(page, problems);
    record(device.id, 'supports: an authored translation is shown as the translation', problems);
  }

  // ---------------------------- 3d. a new item without a remount starts clean
  if (want('supports')) {
    const problems = [];
    const page = await openPage(context, 'scene=item&examType=digitalSAT&supports=full', problems);
    await page.waitForSelector('[data-support-tool="read-aloud"]', { timeout: 15000 }).catch(() => problems.push('no Read aloud'));
    await page.click('[data-support-tool="read-aloud"]');
    await page.click('[data-support-tool="vocabulary"]');
    await page.waitForTimeout(200);
    const onFirst = await page.evaluate(() => ({ stop: Boolean(document.querySelector('[data-support-stop-reading]')), panel: Boolean(document.querySelector('[data-support-panel]')) }));
    if (!onFirst.stop || !onFirst.panel) problems.push(`item 1 should show Stop reading and the open panel: ${JSON.stringify(onFirst)}`);
    await page.evaluate(() => window.__mmNextItem());
    await page.waitForTimeout(400);
    const onSecond = await page.evaluate(() => ({
      stop: Boolean(document.querySelector('[data-support-stop-reading]')),
      panel: Boolean(document.querySelector('[data-support-panel]')),
      speaking: window.speechSynthesis.speaking,
      item: document.querySelector('[data-secure-access-supports]')?.getAttribute('data-secure-access-supports'),
    }));
    if (onSecond.item !== 'harness-item-2') problems.push(`did not move to item 2: ${onSecond.item}`);
    if (onSecond.stop) problems.push('Stop reading carried over to the next item');
    if (onSecond.panel) problems.push('a panel stayed open on the next item');
    if (onSecond.speaking) problems.push('the previous item was still being read');
    await page.click('[data-support-tool="read-aloud"]');
    await page.waitForTimeout(150);
    const spokenNow = await page.evaluate(() => window.__mmSpoken.at(-1));
    if (spokenNow !== speechTextFor('What is the value of $x$ if $2x + 5 = 11$?')) problems.push(`Read aloud on item 2 said ${JSON.stringify(spokenNow)}`);
    await closePage(page, problems);
    record(device.id, 'supports: a new item starts clean without a remount', problems);
  }

  // ------------------------------------------------- 6. tools by exam type
  if (want('tools')) for (const [query, expect] of [
    ['examType=act', { reference: false, graphing: true }],
    ['examType=tsia2', { reference: false, graphing: false }],
    ['examType=tsia2&itemCalculator=graphing', { reference: false, graphing: true }],
    ['examType=asvab', { reference: false, graphing: false }],
    ['examType=courseTest&sessionCalculator=questionSpecific&itemCalculator=none', { reference: false, graphing: false }],
    ['examType=courseTest&sessionCalculator=questionSpecific&itemCalculator=graphing', { reference: false, graphing: true }],
  ]) {
    const problems = [];
    const page = await openPage(context, `scene=item&supports=none&${query}`, problems);
    await page.waitForSelector('[data-exam-tools]', { state: 'attached', timeout: 30000 });
    const seen = await page.evaluate(() => ({
      reference: Boolean(document.querySelector('[data-sat-reference-launcher]')),
      graphing: Boolean(document.querySelector('[data-graphing-calculator-launcher]')),
    }));
    if (seen.reference !== expect.reference || seen.graphing !== expect.graphing) problems.push(`showed ${JSON.stringify(seen)}, expected ${JSON.stringify(expect)}`);
    await closePage(page, problems);
    record(device.id, `tools: ${query}`, problems);
  }

  await context.close();
}

await browser.close();

for (const entry of findings) {
  console.log(`${entry.problems.length ? 'FAIL' : 'ok  '} ${entry.device.padEnd(11)} ${entry.check}${entry.detail ? ` (${entry.detail})` : ''}`);
  for (const problem of entry.problems) console.log(`       -> ${problem}`);
}
console.log('\nWhat the editor sent, graded by the server:');
for (const entry of recorded) {
  console.log(`  ${entry.gradedCorrect ? 'ok  ' : 'FAIL'} ${entry.device.padEnd(11)} ${entry.profile.padEnd(11)} ${entry.editor.padEnd(4)} ${JSON.stringify(entry.typed).padEnd(24)} -> ${JSON.stringify(entry.serialized)}`);
}
console.log(`\nblocked ${blockedRequests} non-local request(s) — no production contact`);

if (write) {
  writeFileSync(RESULT, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'tests/browser/secureAccessParity.mjs',
    trials: recorded,
  }, null, 2)}\n`);
  console.log(`Wrote ${path.relative(repo, RESULT)}`);
}

const failures = findings.filter((entry) => entry.problems.length);
if (failures.length) {
  console.error(`\n${failures.length} of ${findings.length} checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${findings.length} checks pass at ${DEVICES.map((device) => `${device.id} ${device.width}x${device.height}`).join(' / ')}.`);
