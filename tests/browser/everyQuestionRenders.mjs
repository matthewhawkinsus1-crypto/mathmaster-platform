// EVERY QUESTION OF EVERY PUBLISHED LESSON RENDERS FOR A STUDENT.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/everyQuestionRenders.mjs              # every question (local, ~10 min)
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/everyQuestionRenders.mjs --sample     # the stratified sample
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/everyQuestionRenders.mjs --self-test  # each check sees its fault
//   EVERY_QUESTION_MODE=ci node tests/browser/everyQuestionRenders.mjs                         # what CI runs: self-test, then sample
//   npm run audit:every-question                                                              # the full run, local
//
//   --sample         one question of each (lesson, section, question type,
//                    family-backed or not): about 450 of the ~1,500
//   --only <text>    only lesson files whose path contains <text>
//   --ids a,b        only these question ids
//   --workers <n>    pages in parallel per screen (default 4)
//   --json <path>    write every finding as JSON (default artifacts/everyQuestionRenders/findings.json)
//
// Every lesson file under teacher-import-jsons/ is compiled the way a teacher's
// import reaches a student (tests/browser/everyQuestionRendersMain.jsx) and
// every question — Warm-Up, Classwork, Practice, DOL and Test, in the order
// the lesson gives them — is mounted in the real QuestionEngine, as a student
// sees it, at 1366×900 and on a 390×844 touch phone, in the light theme and
// then the dark one. For each, in each:
//
//   error        no uncaught error, no console error from a question boundary,
//                and no boundary's fallback on screen ("This question could
//                not be displayed", "could not be prepared", the harness's own);
//   blank        the question says something: its prompt, or its tool's text;
//   latex        no raw LaTeX in the visible text (a `$…$` span, `\frac` and
//                friends, `\(…\)`), and no `$` that is not a price;
//   placeholder  no `{name}` / `{{name}}` template slot left unfilled;
//   scroll       nothing scrolls the page sideways;
//   name         every control in the accessibility tree has a name
//                (Chromium's own tree, CDP Accessibility.getFullAXTree);
//   mount        the answer box or tool mounts: the question's workspace is
//                there, has a control in it, and is not still "Loading".
//
// And on the phone at 200% browser text (Page.setFontSizes, WCAG 1.4.4), up to
// three questions of each question type: scroll, mount and error again.
//
// Exits non-zero when any check fails. Screenshots of each failure:
// tests/browser/artifacts/everyQuestionRenders/<check>/.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// --serve: start a dev server of our own on a spare port, and stop exactly that
// process (by its PID) when the run ends. What `npm run audit:every-question` does.
const SERVE_PORT = 5213;
let server = null;
if (process.argv.includes('--serve')) {
  const repo = path.resolve(here, '../..');
  server = spawn(process.execPath, [path.join(repo, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(SERVE_PORT), '--strictPort'], { cwd: repo, stdio: 'ignore' });
  const stop = () => { if (server && server.exitCode === null) process.kill(server.pid); };
  process.on('exit', stop);
  for (let tries = 0; ; tries += 1) {
    // eslint-disable-next-line no-await-in-loop
    const up = await fetch(`http://127.0.0.1:${SERVE_PORT}/tests/browser/everyQuestionRenders.html`).then((response) => response.ok, () => false);
    if (up) break;
    if (tries > 120) { console.error('the dev server did not start'); process.exit(2); }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 500); });
  }
}
const ORIGIN = server ? `http://127.0.0.1:${SERVE_PORT}` : (process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199');
const ARTIFACTS = path.join(here, 'artifacts/everyQuestionRenders');
mkdirSync(ARTIFACTS, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;

const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
// EVERY_QUESTION_MODE=ci (what CI runs): the self-test, then the sample.
const MODE = process.env.EVERY_QUESTION_MODE || '';
const SAMPLE = process.argv.includes('--sample') || MODE === 'ci' || MODE === 'sample';
const SELF_TEST_ONLY = process.argv.includes('--self-test') || MODE === 'self-test';
const SELF_TEST_FIRST = SELF_TEST_ONLY || MODE === 'ci';
let selfTesting = false;
const ONLY = argOf('--only', '');
const IDS = new Set(String(argOf('--ids', '')).split(',').map((id) => id.trim()).filter(Boolean));
const WORKERS = Math.max(1, Number(argOf('--workers', '4')) || 4);
const JSON_OUT = argOf('--json', path.join(ARTIFACTS, 'findings.json'));

const DEVICES = [
  { name: 'desktop', viewport: { width: 1366, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];
const THEMES = ['light', 'dark'];

// --- what the page is asked --------------------------------------------------

// Everything read from the DOM, in one evaluate per (question, theme).
const readScreen = () => {
  const stage = document.querySelector('main.mathmaster-question-stage');
  const out = { texts: [], promptText: '', workspaceText: '', hasWorkspace: false, controls: 0, loading: false, boundary: null, overflow: 0 };
  if (!stage) return out;
  // Painted for a sighted student. KaTeX's MathML copy and an <annotation> hold
  // the source LaTeX for screen readers and are drawn nowhere; a screen-reader
  // line is not "visible text" either.
  const unpainted = (element) => {
    for (let node = element; node && node !== stage.parentElement; node = node.parentElement) {
      if (node.matches?.('.katex-mathml, annotation, script, style, template, [aria-hidden="true"] .katex-mathml')) return true;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
      if (style.position === 'absolute' && style.clip && style.clip !== 'auto') return true;
      if (style.clipPath === 'inset(50%)') return true;
    }
    return false;
  };
  const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent;
    if (!text || !text.trim()) continue;
    const parent = node.parentElement;
    if (!parent || unpainted(parent)) continue;
    // A text box's own value is the student's typing, not the question.
    // A math box's light-DOM text is its LaTeX value; MathLive draws it in its
    // shadow root, and that is what the student sees.
    if (parent.closest('textarea, [contenteditable="true"], math-field')) continue;
    // MathLive's static <math-span> and <math-div> hold their LaTeX as
    // light-DOM text too and draw it in their shadow root — once upgraded. One
    // that has not (no shadow root) shows the student its source: a finding.
    const span = parent.closest('math-span, math-div');
    if (span && span.shadowRoot) continue;
    out.texts.push(text.replace(/\s+/g, ' ').trim());
  }
  const prompt = stage.querySelector('.mathmaster-question-prompt, .mathmaster-tool-task-prompt');
  out.promptText = (prompt?.innerText || '').trim();
  const workspace = stage.querySelector('.mathmaster-question-tool-workspace');
  out.hasWorkspace = Boolean(workspace);
  out.workspaceText = (workspace?.innerText || '').trim().slice(0, 400);
  if (workspace) {
    out.controls = workspace.querySelectorAll([
      'math-field', 'input', 'textarea', 'select', 'button',
      '[role="radio"]', '[role="checkbox"]', '[role="slider"]', '[role="spinbutton"]', '[role="textbox"]',
      '[role="combobox"]', '[role="listbox"]', '[role="option"]', '[role="gridcell"]', '[role="application"]',
      '[tabindex="0"]', 'canvas',
    ].join(',')).length;
    out.loading = [...workspace.querySelectorAll('[role="status"], [aria-busy="true"]')]
      .some((element) => element.getAttribute('aria-busy') === 'true' || /^\s*Loading/i.test(element.textContent || ''));
    if (!out.loading && /^\s*(Loading\b|Opening Work View)/i.test(workspace.innerText || '')) out.loading = true;
  }
  const boundary = stage.querySelector('[data-harness-boundary], [data-question-resolution-failure], [data-screen-code-failed]')
    || [...stage.querySelectorAll('[role="alert"] h3, [role="alert"] h2')].find((heading) => /could not be displayed|could not load|was just updated|could not be prepared/i.test(heading.textContent || ''));
  if (boundary) out.boundary = (boundary.closest('[role="alert"]') || boundary).textContent.replace(/\s+/g, ' ').trim().slice(0, 300);
  // SIDEWAYS. The app clips overflow-x on html, body and #root (index.css),
  // so a box wider than the screen never makes the page scroll: it is cut
  // off at the screen's edge instead, which is worse. So both count: the page
  // scrolling, and any painted box that runs past the screen's edge without a
  // scrolling box of its own, inside the screen, holding it.
  const width = document.documentElement.clientWidth;
  out.overflow = document.documentElement.scrollWidth - width;
  out.overflowBy = null;
  const pageClips = new Set([document.documentElement, document.body, document.getElementById('root')]);
  for (const element of stage.querySelectorAll('*')) {
    const box = element.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    const past = Math.max(box.right - width, -box.left);
    if (past <= 1) continue;
    let held = false;
    for (let ancestor = element.parentElement; ancestor && !pageClips.has(ancestor); ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      // A box the student can scroll holds it; one that only hides its
      // overflow cuts it off just as the page does.
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
        const clip = ancestor.getBoundingClientRect();
        if (clip.right <= width + 1 && clip.left >= -1) { held = true; break; }
      }
    }
    if (held || unpainted(element)) continue;
    if (!out.overflowBy || past > out.overflowBy.past) {
      const name = `${element.tagName.toLowerCase()}${element.className && typeof element.className === 'string' ? `.${element.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`;
      out.overflowBy = { past: Math.round(past), name, text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) };
    }
  }
  return out;
};

// --- what counts as a finding in the text ------------------------------------

const LATEX_PATTERNS = [
  { rule: 'dollar-span', pattern: /\$[^$\n]{1,160}\$/g },
  { rule: 'latex-command', pattern: /\\(?:frac|dfrac|tfrac|sqrt|left|right|cdot|times|div|le|ge|leq|geq|neq|ne|pm|infty|cup|cap|text|textbf|mathrm|mathbf|begin|end|pi|theta|alpha|beta|circ|degree|approx|in|notin|emptyset|varnothing|R|mathbb|overline|underline|hat|vec|log|ln|sin|cos|tan|quad|qquad)(?![A-Za-z])/g },
  { rule: 'paren-delimited', pattern: /\\\(|\\\)|\\\[|\\\]/g },
  { rule: 'brace-group', pattern: /[_^]\{[^}\n]{1,40}\}/g },
];
// A price is a `$` followed by its digits ("$22 plus $8 each week"), and a
// matched pair of prices is not a LaTeX span (see tests/browser/renderAudit.mjs).
const isPricePair = (text, match) => {
  const at = text.indexOf(match);
  return /[0-9]/.test(match[1] || '') && /[0-9]/.test(text[at + match.length] || '');
};
const latexIn = (text) => {
  const found = [];
  for (const { rule, pattern } of LATEX_PATTERNS) {
    pattern.lastIndex = 0;
    let matches = text.match(pattern) || [];
    if (rule === 'dollar-span') matches = matches.filter((match) => !isPricePair(text, match) && !/^\$\d[\d,.]*\s/.test(match));
    if (matches.length) {
      const at = text.indexOf(matches[0]);
      found.push(`${rule}: ${[...new Set(matches)].slice(0, 3).join(' | ')} in "…${text.slice(Math.max(0, at - 40), at + matches[0].length + 40)}…"`);
    }
  }
  // A lone `$` that is not a price: "$x" or "x$".
  // "Price ($)" names a unit, and is fine.
  const STRAY = /(?<!\()\$(?![0-9])|(?<![0-9 (])\$(?!\))/g;
  const stray = text.match(STRAY);
  if (!found.length && stray) {
    STRAY.lastIndex = 0;
    const at = text.search(STRAY);
    found.push(`stray-dollar: …${text.slice(Math.max(0, at - 20), at + 20)}…`);
  }
  return found;
};
const PLACEHOLDER = /\{\{\s*[A-Za-z_][A-Za-z0-9_.]*\s*\}\}|(?<![\\_^A-Za-z0-9])\{[A-Za-z_][A-Za-z0-9_]{1,}\}/g;
const placeholdersIn = (text) => [...new Set(text.match(PLACEHOLDER) || [])];

// --- the accessibility tree --------------------------------------------------

const CONTROL_ROLES = new Set(['button', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'slider', 'spinbutton', 'switch', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'listbox', 'option', 'treeitem', 'gridcell']);
const unnamedControls = async (page) => {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Accessibility.enable');
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const unnamed = nodes.filter((node) => !node.ignored
      && CONTROL_ROLES.has(node.role?.value)
      && !String(node.name?.value || '').trim()
      && !(node.properties || []).some((prop) => prop.name === 'hidden' && prop.value?.value));
    const described = [];
    for (const node of unnamed.slice(0, 6)) {
      let html = '';
      try {
        // eslint-disable-next-line no-await-in-loop
        const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: node.backendDOMNodeId });
        // eslint-disable-next-line no-await-in-loop
        const { result } = await cdp.send('Runtime.callFunctionOn', {
          objectId: object.objectId,
          functionDeclaration: 'function () { const el = this.nodeType === 1 ? this : this.parentElement; const host = el.getRootNode()?.host; return (host ? `<${host.tagName.toLowerCase()} class="${host.className}"> ▸ ` : "") + el.outerHTML.slice(0, 160); }',
          returnByValue: true,
        });
        html = result.value;
      } catch { /* a node that went away */ }
      described.push(`${node.role.value} ${html}`);
    }
    return { count: unnamed.length, described };
  } finally {
    await cdp.detach().catch(() => {});
  }
};

// --- run -----------------------------------------------------------------------

const browser = await chromium.launch(launch);
const findings = [];
const seen = new Set();
const consoleNotes = new Map();
const counts = { hints: 0, workViews: 0, everyPart: 0 };
// Questions with no prompt element on screen, whose tool still says enough not
// to be blank: listed beside the findings so a person can look at them.
const noPrompt = new Set();
const record = async (page, finding) => {
  const key = `${finding.check}|${finding.file}|${finding.id}|${finding.device}|${finding.theme}|${finding.view || ''}|${finding.scale || 1}`;
  if (seen.has(key)) return;
  seen.add(key);
  const directory = path.join(ARTIFACTS, finding.check);
  mkdirSync(directory, { recursive: true });
  const shot = path.join(directory, `${path.basename(finding.file, '.json')}__${finding.id}__${finding.device}-${finding.theme}${finding.view ? `-${finding.view.replace(/\s+/g, '-')}` : ''}${finding.scale ? `-${finding.scale * 100}` : ''}.png`.replace(/[^A-Za-z0-9_.\-/]/g, '_'));
  await screenshotKeepingTouch(page, { path: shot, fullPage: true }).catch(() => {});
  finding.screenshot = path.relative(path.resolve(here, '../..'), shot);
  findings.push(finding);
  console.log(`${selfTesting ? '  seen' : 'FAIL'} ${finding.check} ${finding.file} ${finding.id} [${finding.device} ${finding.theme}${finding.view ? ` ${finding.view}` : ''}${finding.scale ? ` ${finding.scale * 100}%` : ''}] ${finding.detail}`);
};

const openPage = async (device, { textScale = 1 } = {}) => {
  const context = await browser.newContext({
    viewport: device.viewport,
    isMobile: device.isMobile || false,
    hasTouch: device.hasTouch || false,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const state = { errors: [], current: null };
  page.__state = state;
  page.on('pageerror', (error) => state.errors.push(`uncaught: ${String(error?.message || error).slice(0, 300)}`));
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    const text = message.text();
    // Every other console error or warning is kept beside the findings (not
    // one itself): React's own warnings, a failed fetch, a deprecation.
    const note = `${message.type()}: ${text.replace(/\s+/g, ' ').slice(0, 240)}`;
    const noted = consoleNotes.get(note) || { count: 0, first: state.current };
    noted.count += 1;
    consoleNotes.set(note, noted);
    if (message.type() !== 'error') return;
    // A boundary's own report, or React's: the question (or a panel of it) fell over.
    if (/Question module crashed|Question panel could not be shown|Question could not be prepared|The above error occurred|Uncaught|Maximum update depth|Rendered (more|fewer) hooks/i.test(text)) {
      state.errors.push(`console: ${text.replace(/\s+/g, ' ').slice(0, 300)}`);
    }
  });
  if (textScale !== 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: Math.round(16 * textScale), fixed: Math.round(13 * textScale) } });
  }
  await page.goto(`${ORIGIN}/tests/browser/everyQuestionRenders.html`, { waitUntil: 'networkidle', timeout: 180000 });
  await page.waitForFunction(() => Boolean(window.__mmEveryQuestion), null, { timeout: 120000 });
  return { page, context, state };
};

const setTheme = (page, theme) => page.evaluate((scheme) => {
  if (scheme === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = scheme;
}, theme);

// What a student opens next. The first hint (where the question offers one):
// the Hint control on the work bar, then "Show a hint" in its panel.
const revealHint = async (page) => {
  const show = page.locator('main button:visible', { hasText: /^Show a hint$/ }).first();
  if (!(await show.count())) {
    const control = page.locator('main [data-hint-control]:visible').first();
    if (!(await control.count())) return false;
    await control.click();
    await show.waitFor({ timeout: 1500 }).catch(() => {});
  }
  if (!(await show.count())) return false;
  const before = await page.locator('main li[data-hint-source]').count();
  await show.click();
  await page.waitForFunction((count) => document.querySelectorAll('main li[data-hint-source]').length > count, before, { timeout: 2000 }).catch(() => {});
  counts.hints += 1;
  return true;
};
// Work View: the question's own "Open Work View".
const openWorkView = async (page) => {
  const opener = page.locator('main button:visible', { hasText: /Open Work View/ }).first();
  if (!(await opener.count())) return false;
  await opener.click();
  await page.waitForTimeout(700);
  counts.workViews += 1;
  return true;
};

// Mounted, settled: no lazy chunk still on its way, and a frame painted.
const showQuestion = async (page, item, { everyPart = false } = {}) => {
  if (page.__state) page.__state.current = `${item.file} ${item.id}`;
  await page.evaluate(([file, index, all]) => window.__mmEveryQuestion.show(file, index, { everyPart: all }), [item.file, item.index, everyPart]);
  await page.waitForFunction(() => {
    const workspace = document.querySelector('main .mathmaster-question-tool-workspace');
    const busy = document.querySelector('main [aria-busy="true"]');
    const loading = [...document.querySelectorAll('main [role="status"]')].some((element) => /^\s*Loading/i.test(element.textContent || ''))
      || /Opening Work View…/.test(workspace?.innerText || '');
    const failed = document.querySelector('main [role="alert"], main [data-question-resolution-failure]');
    return failed || (workspace && !busy && !loading);
  }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(150);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};

const checkScreen = async (page, state, item, device, theme, { scale = null, full = true } = {}) => {
  const base = { file: item.file, id: item.id, role: item.role, type: item.type, device: device.name, theme, ...(item.view ? { view: item.view } : {}), ...(scale ? { scale } : {}) };
  const screen = await page.evaluate(readScreen);
  const errors = state.errors.splice(0);
  if (errors.length || screen.boundary) {
    await record(page, { ...base, check: 'error', detail: [screen.boundary ? `boundary: ${screen.boundary}` : null, ...errors].filter(Boolean).join(' ; ') });
  }
  if (screen.overflow > 1) await record(page, { ...base, check: 'scroll', detail: `the page scrolls ${screen.overflow}px sideways` });
  else if (screen.overflowBy) await record(page, { ...base, check: 'scroll', detail: `${screen.overflowBy.name} runs ${screen.overflowBy.past}px past the screen's edge and is cut off ("${screen.overflowBy.text}")` });
  if (!screen.hasWorkspace || screen.loading || screen.controls === 0) {
    await record(page, { ...base, check: 'mount', detail: !screen.hasWorkspace ? 'no answer workspace on screen' : screen.loading ? 'the tool is still loading after 8 s' : `the workspace has no control in it ("${screen.workspaceText.slice(0, 120)}")` });
  }
  if (!full) return;
  if (!screen.promptText && !item.view) noPrompt.add(`${item.file} ${item.id} (${item.type})`);
  if (!screen.promptText && screen.workspaceText.replace(/\s+/g, '').length < 10) {
    await record(page, { ...base, check: 'blank', detail: 'no prompt and no tool text' });
  }
  const visible = screen.texts.join(' ‖ ');
  const leaks = latexIn(visible);
  if (leaks.length) await record(page, { ...base, check: 'latex', detail: leaks.join(' ; ') });
  const slots = placeholdersIn(visible);
  if (slots.length) await record(page, { ...base, check: 'placeholder', detail: slots.join(', ') });
  if (theme === 'light') {
    const unnamed = await unnamedControls(page);
    if (unnamed.count) await record(page, { ...base, check: 'name', detail: `${unnamed.count} unnamed: ${unnamed.described.join(' ; ')}` });
  }
};

// --- the checks can fail (--self-test) ---------------------------------------
//
// One clean question, broken on screen in each way the audit looks for: each
// break must produce its own finding, and the clean screen none. Run first in
// CI, so a check that has quietly stopped seeing anything fails the job.
const FAULTS = [
  { check: 'latex', inject: () => { const p = document.createElement('p'); p.textContent = 'Solve $2x + 1 = 7$ for x.'; document.querySelector('.mathmaster-question-prompt, main').append(p); } },
  { check: 'latex', inject: () => { const p = document.createElement('p'); p.textContent = 'y = \\frac{1}{2}x'; document.querySelector('main').append(p); } },
  { check: 'latex', inject: () => { const s = document.createElement('span'); s.textContent = 'x^{2} + \\left(3\\right)'; document.querySelector('main').append(s); } },
  { check: 'latex', inject: () => { const p = document.createElement('p'); p.textContent = 'It costs $x per ticket.'; document.querySelector('main').append(p); } },
  { check: 'placeholder', inject: () => { const p = document.createElement('p'); p.textContent = 'Maria buys {itemCount} apples.'; document.querySelector('main').append(p); } },
  { check: 'scroll', inject: () => { const d = document.createElement('div'); d.style.width = '3000px'; d.style.height = '4px'; document.querySelector('main').append(d); } },
  { check: 'name', inject: () => { const b = document.createElement('button'); b.type = 'button'; document.querySelector('.mathmaster-question-tool-workspace').append(b); } },
  { check: 'mount', inject: () => { document.querySelector('.mathmaster-question-tool-workspace')?.remove(); } },
  { check: 'blank', inject: () => { document.querySelectorAll('.mathmaster-question-prompt, .mathmaster-tool-task-prompt').forEach((e) => { e.textContent = ''; }); const w = document.querySelector('.mathmaster-question-tool-workspace'); if (w) w.replaceChildren(Object.assign(document.createElement('input'), { ariaLabel: 'x' })); } },
  { check: 'error', inject: () => { setTimeout(() => { throw new Error('self-test: an uncaught error'); }, 0); } },
  // eslint-disable-next-line no-console
  { check: 'error', inject: () => { console.error('Question module crashed:', 'selfTest', new Error('self-test: a boundary caught it')); } },
  { check: 'error', inject: () => { const a = document.createElement('div'); a.setAttribute('role', 'alert'); a.innerHTML = '<h3>This question could not be displayed</h3>'; document.querySelector('main').append(a); } },
];
const selfTest = async () => {
  selfTesting = true;
  const device = DEVICES[1];
  const { page, context, state } = await openPage(device);
  const lessons = await page.evaluate(() => window.__mmEveryQuestion.lessons());
  const lesson = lessons.find((entry) => entry.questions.some((question) => question.type === 'multiAnswer'));
  const item = { ...lesson.questions.find((question) => question.type === 'multiAnswer'), file: lesson.file };
  const problems = [];
  await showQuestion(page, item);
  await checkScreen(page, state, item, device, 'light');
  if (findings.length) problems.push(`the clean question has findings: ${findings.map((finding) => finding.check).join(', ')}`);
  for (const [index, fault] of FAULTS.entries()) {
    findings.length = 0;
    seen.clear();
    // A fault is appended outside the remounted question, so each starts on a fresh page.
    // eslint-disable-next-line no-await-in-loop
    await page.reload({ waitUntil: 'networkidle' });
    // eslint-disable-next-line no-await-in-loop
    await page.waitForFunction(() => Boolean(window.__mmEveryQuestion));
    // eslint-disable-next-line no-await-in-loop
    await showQuestion(page, item);
    state.errors.length = 0;
    // eslint-disable-next-line no-await-in-loop
    await page.evaluate(fault.inject);
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(100);
    // eslint-disable-next-line no-await-in-loop
    await checkScreen(page, state, { ...item, id: `self-test-${index}` }, device, 'light');
    const caught = findings.some((finding) => finding.check === fault.check);
    console.log(`${caught ? 'ok  ' : 'FAIL'} self-test: a ${fault.check} fault (#${index}) is found`);
    if (!caught) problems.push(`a ${fault.check} fault (#${index}) went unseen`);
  }
  await context.close();
  findings.length = 0;
  seen.clear();
  consoleNotes.clear();
  noPrompt.clear();
  selfTesting = false;
  return problems;
};
if (SELF_TEST_FIRST) {
  const problems = await selfTest();
  if (problems.length || SELF_TEST_ONLY) {
    await browser.close();
    console.log(problems.length ? `\n${problems.join('\n')}` : '\nEvery check sees its fault.');
    process.exit(problems.length ? 1 : 0);
  }
  console.log('Every check sees its fault.\n');
}

// --- the questions -------------------------------------------------------------

const { page: indexPage, context: indexContext } = await openPage(DEVICES[0]);
const lessons = await indexPage.evaluate(() => window.__mmEveryQuestion.lessons());
await indexContext.close();
const compileFailures = lessons.filter((lesson) => lesson.error);
for (const lesson of compileFailures) {
  findings.push({ check: 'error', file: lesson.file, id: '(lesson)', device: '-', theme: '-', detail: `the lesson does not compile: ${lesson.error.split('\n')[0]}`, screenshot: null });
  console.log(`FAIL error ${lesson.file}: does not compile — ${lesson.error.split('\n')[0]}`);
}
let all = lessons.flatMap((lesson) => lesson.questions.map((question) => ({ ...question, file: lesson.file })));
if (ONLY) all = all.filter((item) => item.file.includes(ONLY));
if (IDS.size) all = all.filter((item) => IDS.has(item.id));
const sampleOf = (items) => {
  const kept = new Map();
  for (const item of items) {
    const key = `${item.file}|${item.role}|${item.type}|${item.family ? 'family' : 'static'}`;
    if (!kept.has(key)) kept.set(key, item);
  }
  return [...kept.values()];
};
const selected = SAMPLE ? sampleOf(all) : all;
// The hint pass: every question in a full run; in the sample, the first
// question of each type in each lesson that offers one (DOL and Warm-Up offer none).
const hintSample = new Set(SAMPLE
  ? [...new Map(selected.filter((item) => item.role === 'classwork' || item.role === 'practice').map((item) => [`${item.file}|${item.type}`, item]).reverse()).values()]
  : selected);
const roleCounts = selected.reduce((counts, item) => ({ ...counts, [item.role]: (counts[item.role] || 0) + 1 }), {});
console.log(`${lessons.length} lessons, ${all.length} questions; rendering ${selected.length}${SAMPLE ? ' (stratified sample)' : ''} — ${JSON.stringify(roleCounts)}`);

const started = Date.now();
let rendered = 0;
const runDevice = async (device) => {
  const queue = [...selected];
  const worker = async () => {
    let { page, context, state } = await openPage(device);
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await setTheme(page, 'light');
        // eslint-disable-next-line no-await-in-loop
        await showQuestion(page, item);
        for (const theme of THEMES) {
          // eslint-disable-next-line no-await-in-loop
          await setTheme(page, theme);
          // eslint-disable-next-line no-await-in-loop
          if (theme === 'dark') await page.waitForTimeout(60);
          // eslint-disable-next-line no-await-in-loop
          await checkScreen(page, state, item, device, theme);
        }
        // The first hint, read on the laptop in the light theme.
        // eslint-disable-next-line no-await-in-loop
        if (device.name === 'desktop' && hintSample.has(item) && await revealHint(page)) {
          // eslint-disable-next-line no-await-in-loop
          await setTheme(page, 'light');
          // eslint-disable-next-line no-await-in-loop
          await checkScreen(page, state, { ...item, view: 'hint shown' }, device, 'light');
        }
        // A multi-part question opens one part at a time, so its later parts
        // are checked with every part shown (a student's accommodation).
        if (item.type === 'multiAnswer') {
          // eslint-disable-next-line no-await-in-loop
          await setTheme(page, 'light');
          // eslint-disable-next-line no-await-in-loop
          await showQuestion(page, item, { everyPart: true });
          counts.everyPart += 1;
          // eslint-disable-next-line no-await-in-loop
          await checkScreen(page, state, { ...item, view: 'every part' }, device, 'light');
        }
      } catch (error) {
        // eslint-disable-next-line no-await-in-loop
        await record(page, { file: item.file, id: item.id, role: item.role, type: item.type, device: device.name, theme: '-', check: 'error', detail: `the driver could not render it: ${String(error?.message || error).split('\n')[0]}` });
        // A page that hung is replaced, so one question cannot stop the rest.
        // eslint-disable-next-line no-await-in-loop
        await context.close().catch(() => {});
        // eslint-disable-next-line no-await-in-loop
        ({ page, context, state } = await openPage(device));
      }
      rendered += 1;
      if (rendered % 100 === 0) console.log(`  … ${rendered} renders, ${Math.round((Date.now() - started) / 1000)} s`);
    }
    await context.close();
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
};
for (const device of DEVICES) {
  // eslint-disable-next-line no-await-in-loop
  await runDevice(device);
}

// 200% text on the phone: of each question type, up to three questions, each
// from a different lesson (the first of the type in each).
const LARGE_TEXT_PER_TYPE = 3;
const byType = new Map();
for (const item of selected) {
  const kept = byType.get(item.type) || [];
  if (kept.length < LARGE_TEXT_PER_TYPE && !kept.some((other) => other.file === item.file)) byType.set(item.type, [...kept, item]);
}
const largeText = [...byType.values()].flat();
{
  const phone = DEVICES[1];
  const { page, context, state } = await openPage(phone, { textScale: 2 });
  for (const item of largeText) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await showQuestion(page, item);
      // eslint-disable-next-line no-await-in-loop
      await checkScreen(page, state, item, phone, 'light', { scale: 2, full: false });
      // eslint-disable-next-line no-await-in-loop
      if (await openWorkView(page)) await checkScreen(page, state, { ...item, view: 'work view' }, phone, 'light', { scale: 2, full: false });
    } catch (error) {
      // eslint-disable-next-line no-await-in-loop
      await record(page, { file: item.file, id: item.id, role: item.role, type: item.type, device: phone.name, theme: 'light', scale: 2, check: 'error', detail: String(error?.message || error).split('\n')[0] });
    }
  }
  await context.close();
}

// The same questions in Work View on the phone at ordinary text size.
{
  const phone = DEVICES[1];
  const { page, context, state } = await openPage(phone);
  for (const item of largeText) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await showQuestion(page, item);
      // eslint-disable-next-line no-await-in-loop
      if (await openWorkView(page)) await checkScreen(page, state, { ...item, view: 'work view' }, phone, 'light');
    } catch (error) {
      // eslint-disable-next-line no-await-in-loop
      await record(page, { file: item.file, id: item.id, role: item.role, type: item.type, device: phone.name, theme: 'light', view: 'work view', check: 'error', detail: String(error?.message || error).split('\n')[0] });
    }
  }
  await context.close();
}

await browser.close();

const byCheck = findings.reduce((counts, finding) => ({ ...counts, [finding.check]: (counts[finding.check] || 0) + 1 }), {});
const questionsWithFindings = new Set(findings.map((finding) => `${finding.file}|${finding.id}`)).size;
const summary = {
  lessons: lessons.length,
  questions: all.length,
  rendered: selected.length,
  sample: SAMPLE,
  screens: selected.length * DEVICES.length * THEMES.length,
  largeTextSample: largeText.length,
  largeTextTypes: byType.size,
  hintsShown: counts.hints,
  workViewsOpened: counts.workViews,
  everyPartViews: counts.everyPart,
  roles: roleCounts,
  findings: findings.length,
  questionsWithFindings,
  byCheck,
  seconds: Math.round((Date.now() - started) / 1000),
};
const consoleSeen = [...consoleNotes.entries()].map(([message, { count, first }]) => ({ message, count, first })).sort((a, b) => b.count - a.count);
writeFileSync(JSON_OUT, `${JSON.stringify({ summary, findings, consoleSeen, noPrompt: [...noPrompt] }, null, 2)}\n`);
if (noPrompt.size) console.log(`no prompt element (not findings; the tool carries the task): ${noPrompt.size} question(s), listed in the JSON`);
if (consoleSeen.length) console.log(`console (not findings): ${consoleSeen.length} distinct error/warning message(s), listed in the JSON`);
console.log(`\n${JSON.stringify(summary)}`);
console.log(`findings: ${JSON_OUT}`);
if (findings.length) {
  console.log(`\n${findings.length} finding(s) on ${questionsWithFindings} question(s).`);
  process.exit(1);
}
console.log('\nEvery question rendered cleanly.');
