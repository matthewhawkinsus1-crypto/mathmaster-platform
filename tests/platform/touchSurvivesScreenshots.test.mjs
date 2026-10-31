// A PHONE STAYS A PHONE AFTER A SCREENSHOT (CI12, finding E1-18).
//
// tests/browser/support/touchEmulation.mjs says why: Chromium takes an emulated
// phone's touch away when a screenshot has to look beyond the viewport, and
// every check after it ran on a laptop with a narrow window. Three things keep
// that from coming back, and this file holds each:
//
//   1. the helper does what it says, against a stand-in page that behaves the
//      way the real one was seen to (a real browser is not needed here);
//   2. no driver that makes a touch context takes a screenshot that can look
//      beyond the viewport without the helper, and the helper is imported from
//      a file that exists;
//   3. a change to the helper runs every workflow that runs a driver that uses
//      it, and the proof against the real Chromium
//      (tests/browser/touchAfterScreenshot.mjs) runs on pull requests.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { screenshotKeepingTouch, touchState } from '../browser/support/touchEmulation.mjs';
import { calledWorkflows, jobsOf, readWorkflow, runsOnPullRequest, stepsOf } from './helpers/ciWorkflows.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HELPER = 'tests/browser/support/touchEmulation.mjs';
const PROOF = 'tests/browser/touchAfterScreenshot.mjs';

// ---------------------------------------------------------------------------
// 1. The helper, against a stand-in page
// ---------------------------------------------------------------------------

const PHONE = { coarse: true, hoverNone: true, points: 1 };
const MOUSE = { coarse: false, hoverNone: false, points: 0 };

/**
 * A page that answers the way Chromium did when it was tried: a screenshot can
 * take touch away (`losesTouch`); touch that a DevTools session switches on
 * lasts only while that session stays attached; `restores: false` is a browser
 * that ignores the switch; `unreadableFirst` is a page in the middle of a
 * navigation, which cannot answer the first time it is asked. `log` is what was
 * asked of it.
 */
const standInPage = ({ start = PHONE, losesTouch = false, restores = true, failsShot = false, closesInShot = false, unreadableFirst = false } = {}) => {
  const log = { sessions: 0, sends: [], detached: 0, shots: [] };
  let current = { ...start };
  let closed = false;
  let asked = 0;
  const take = (who, options) => {
    log.shots.push([who, options]);
    if (losesTouch) current = { ...MOUSE };
    if (closesInShot) closed = true;
    if (failsShot) throw new Error('screenshot failed');
    return Buffer.from('png');
  };
  const session = {
    send: async (method, params) => {
      log.sends.push([method, params]);
      if (method === 'Emulation.setTouchEmulationEnabled' && params.enabled && restores) {
        current = { coarse: true, hoverNone: true, points: params.maxTouchPoints };
      }
    },
    detach: async () => { log.detached += 1; current = { ...MOUSE }; },
  };
  const page = {
    evaluate: async () => {
      asked += 1;
      if (closed) throw new Error('Target page, context or browser has been closed');
      if (unreadableFirst && asked === 1) throw new Error('Execution context was destroyed, most likely because of a navigation');
      return { ...current };
    },
    context: () => ({ newCDPSession: async () => { log.sessions += 1; return session; } }),
    once: () => page,
    isClosed: () => closed,
    screenshot: async (options) => take('page', options),
  };
  const locator = { page: () => page, screenshot: async (options) => take('locator', options) };
  return { page, locator, log, now: () => ({ ...current }) };
};

test('a screenshot that leaves a phone a phone is only taken: no emulation is touched', async () => {
  const { page, log } = standInPage();
  const png = await screenshotKeepingTouch(page, { fullPage: true });
  assert.ok(Buffer.isBuffer(png), 'the screenshot is what comes back');
  assert.deepEqual(log.shots, [['page', { fullPage: true }]]);
  assert.equal(log.sessions, 0, 'nothing to put back, so no DevTools session is opened');
});

test('a screenshot that takes touch away has it put back, with the touch points the page had', async () => {
  const { page, log, now } = standInPage({ start: { coarse: true, hoverNone: true, points: 5 }, losesTouch: true });
  const png = await screenshotKeepingTouch(page, { fullPage: true });
  assert.ok(Buffer.isBuffer(png));
  assert.deepEqual(now(), { coarse: true, hoverNone: true, points: 5 }, 'it answers as before');
  assert.deepEqual(log.sends, [['Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }]]);
});

test('the session that put touch back stays attached, however many screenshots follow', async () => {
  // Touch a session switches on goes with the session: detaching it (what
  // closing a throwaway session does) would take touch away again.
  const { page, log, now } = standInPage({ losesTouch: true });
  await screenshotKeepingTouch(page, { fullPage: true });
  await screenshotKeepingTouch(page, { fullPage: true });
  assert.deepEqual(now(), PHONE);
  assert.equal(log.detached, 0, 'never detached');
  assert.equal(log.sessions, 1, 'one session per page, kept');
});

test('a page that was never touch is never given touch', async () => {
  const { page, log, now } = standInPage({ start: MOUSE, losesTouch: true });
  await screenshotKeepingTouch(page, { fullPage: true });
  assert.deepEqual(now(), MOUSE);
  assert.equal(log.sessions, 0);
});

test('an element screenshot goes to the element, and its page keeps touch', async () => {
  const { page, locator, log, now } = standInPage({ losesTouch: true });
  await screenshotKeepingTouch(locator, { path: 'tall.png' });
  assert.deepEqual(log.shots, [['locator', { path: 'tall.png' }]]);
  assert.deepEqual(now(), PHONE);
  assert.deepEqual(await touchState(page), PHONE);
});

test('a screenshot that fails still gets touch put back, and its own error is the one thrown', async () => {
  const { page, now } = standInPage({ losesTouch: true, failsShot: true });
  await assert.rejects(screenshotKeepingTouch(page, { fullPage: true }), /screenshot failed/);
  assert.deepEqual(now(), PHONE, 'the next check on this page is still a phone check');
});

test('touch that cannot be put back is an error, not a quiet laptop', async () => {
  const { page, now } = standInPage({ losesTouch: true, restores: false });
  await assert.rejects(
    screenshotKeepingTouch(page, { fullPage: true }),
    /touch emulation was lost to a screenshot and could not be restored/,
  );
  assert.deepEqual(now(), MOUSE);
});

test('a page that could not be asked before the screenshot is only photographed', async () => {
  // Mid-navigation there is no "before" to put back; guessing one would be an error of its own.
  const { page, log } = standInPage({ losesTouch: true, unreadableFirst: true });
  const png = await screenshotKeepingTouch(page, { fullPage: true });
  assert.ok(Buffer.isBuffer(png));
  assert.equal(log.sessions, 0);
});

test('no target does nothing, and a page that closed in the screenshot is left alone', async () => {
  assert.equal(await screenshotKeepingTouch(undefined, { fullPage: true }), undefined, 'an absent `pages.at(-1)?.`');
  const { page, log } = standInPage({ losesTouch: true, closesInShot: true });
  const png = await screenshotKeepingTouch(page, { fullPage: true });
  assert.ok(Buffer.isBuffer(png));
  assert.equal(log.sessions, 0, 'no session is opened on a closed page');
});

// ---------------------------------------------------------------------------
// 2. The drivers
// ---------------------------------------------------------------------------

const browserFiles = () => {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'artifacts' || name === 'node_modules') continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.mjs')) files.push(full);
    }
  };
  walk(path.join(repo, 'tests/browser'));
  return files.sort();
};
const relative = (file) => path.relative(repo, file).split(path.sep).join('/');
const code = (file) => executableSource(readFileSync(file, 'utf8'));

/** The text between the parentheses of the call whose "(" is at `open`; strings and template literals are skipped. */
const callArguments = (text, open) => {
  const stack = [];
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    const top = stack[stack.length - 1];
    if (top === "'" || top === '"') {
      if (ch === '\\') i += 1;
      else if (ch === top) stack.pop();
      continue;
    }
    if (top === '`') {
      if (ch === '\\') i += 1;
      else if (ch === '`') stack.pop();
      else if (ch === '$' && text[i + 1] === '{') { stack.push('${'); i += 1; }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { stack.push(ch); continue; }
    if (ch === '(' || ch === '{' || ch === '[') depth += 1;
    if (ch === ')' || ch === '}' || ch === ']') {
      if (top === '${' && ch === '}') { stack.pop(); continue; }
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
};

/** Every `.screenshot(` call in some source: who it is called on and with what. */
const screenshotCalls = (source) => {
  const text = executableSource(source);
  return [...text.matchAll(/([A-Za-z_$][\w$]*(?:(?:\?\.|\.)[A-Za-z_$][\w$]*|\([^()]*\))*)\??\.screenshot\(/g)].map((match) => ({
    receiver: match[1],
    args: (callArguments(text, match.index + match[0].length - 1) ?? '').trim(),
  }));
};

/**
 * Can this call make Chromium capture beyond the viewport? A page (`page`,
 * `handle.page`, `pages.at(-1)`) given nothing, or an object with nothing but a
 * path and `fullPage: false`, captures what is on screen and changes nothing.
 * An element can be taller than the viewport, a full page is, a clip can reach
 * past it, and arguments this cannot read could be any of those.
 */
const mayLookBeyondViewport = ({ receiver, args }) => {
  if (!/^(?:page|[\w$]+\.page|pages\.at\(-1\))$/.test(receiver)) return true;
  if (args === '') return false;
  if (!args.startsWith('{') || args.includes('...')) return true;
  return /\bclip\s*:/.test(args) || /\bfullPage\s*:\s*(?!false\b)\S/.test(args) || /\bfullPage\s*[,}]/.test(args);
};

test('the scan: which screenshots can take touch away', () => {
  const risky = (source) => screenshotCalls(source).filter(mayLookBeyondViewport).length;
  assert.equal(risky('await page.screenshot({ path, fullPage: true });'), 1);
  assert.equal(risky('await page.screenshot({ path, fullPage });'), 1, 'shorthand: the variable could be true');
  assert.equal(risky('await page.screenshot({ path, fullPage: wide });'), 1);
  assert.equal(risky('await page.screenshot({ path, fullPage: false });'), 0);
  assert.equal(risky('await page.screenshot({ path });'), 0, 'what is on screen fits the screen');
  assert.equal(risky('await page.screenshot();'), 0);
  assert.equal(risky("await page.locator('#tall').screenshot({ path });"), 1, 'an element can be taller than the viewport');
  assert.equal(risky('await handle.page.screenshot({ path, fullPage: false });'), 0);
  assert.equal(risky('await pages.at(-1)?.screenshot({ path, fullPage: true });'), 1);
  assert.equal(risky('await page.screenshot({ clip: { x: 0, y: 0, width: 9, height: 9 } });'), 1, 'a clip can reach past the viewport');
  assert.equal(risky('await page.screenshot(options);'), 1, 'arguments it cannot read');
  assert.equal(risky('await page.screenshot({ ...base, path });'), 1);
  assert.equal(risky('await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });'), 1, 'a template literal in the arguments');
  assert.equal(risky('await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false });'), 0);
  assert.equal(risky('await screenshotKeepingTouch(page, { path, fullPage: true });'), 0, 'through the helper');
  assert.equal(risky('// await page.screenshot({ fullPage: true });\nawait screenshotKeepingTouch(page, {});'), 0, 'a comment');
});

const isTouchDriver = (file) => /\bhasTouch\b/.test(code(file)) && ![HELPER, PROOF].includes(relative(file));

test('no driver that makes a touch context takes a screenshot that can look beyond the viewport without the helper', () => {
  const drivers = browserFiles().filter(isTouchDriver);
  assert.ok(drivers.length >= 20, `the scan found the touch drivers (${drivers.length})`);
  const bare = drivers.flatMap((file) => screenshotCalls(readFileSync(file, 'utf8'))
    .filter(mayLookBeyondViewport)
    .map(({ receiver, args }) => `${relative(file)}: ${receiver}.screenshot(${args.replace(/\s+/g, ' ').slice(0, 70)})`));
  assert.deepEqual(bare, [], 'each of these takes touch away from the phone it is called on: use screenshotKeepingTouch(target, options) from tests/browser/support/touchEmulation.mjs');
});

/** Does this driver import screenshotKeepingTouch, from a file that is there? */
const importsHelper = (file) => {
  const imports = [...readFileSync(file, 'utf8').matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)];
  return imports.some(([, names, from]) => /\bscreenshotKeepingTouch\b/.test(names)
    && existsSync(path.resolve(path.dirname(file), from))
    && relative(path.resolve(path.dirname(file), from)) === HELPER);
};
const usesHelper = (file) => /\bscreenshotKeepingTouch\(/.test(code(file)) && relative(file) !== HELPER;

test('a driver that calls screenshotKeepingTouch imports it from the helper, and the helper is used', () => {
  const users = browserFiles().filter(usesHelper);
  assert.ok(users.length >= 20, `the helper is in use (${users.length} drivers)`);
  assert.deepEqual(users.filter((file) => !importsHelper(file)).map(relative), [], 'each of these calls it without importing it from tests/browser/support/touchEmulation.mjs');
});

// ---------------------------------------------------------------------------
// 3. The workflows
// ---------------------------------------------------------------------------

/** The workflows ci.yml calls that run this driver: by its path, or through an npm script that does. */
const workflowsRunning = (file) => {
  const base = relative(file);
  const scripts = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8')).scripts;
  const npmNames = Object.entries(scripts).filter(([, command]) => command.includes(base)).map(([name]) => name);
  const called = [...new Set(Object.values(calledWorkflows()).map((call) => call.workflow))];
  return called.filter((workflow) => {
    const text = readWorkflow(workflow);
    return text.includes(base) || npmNames.some((name) => new RegExp(`npm run ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(text));
  });
};

test('a pull request that changes the helper runs every workflow that runs a driver using it', () => {
  const pairs = browserFiles().filter(usesHelper).flatMap((file) => workflowsRunning(file).map((workflow) => [relative(file), workflow]));
  assert.ok(pairs.length >= 10, `the scan found where the drivers run (${pairs.length})`);
  const missed = pairs.filter(([, workflow]) => !runsOnPullRequest(workflow, HELPER)).map(([file, workflow]) => `${workflow} runs ${file}`);
  assert.deepEqual(missed, [], `a change to ${HELPER} does not run these: add 'tests/browser/support/touchEmulation*' to the workflow's area in scripts/lib/ciAreas.mjs`);
});

test('the proof against the real Chromium runs on pull requests, and a change to it or to the helper runs it', () => {
  const runs = [...new Set(Object.values(calledWorkflows()).map((call) => call.workflow))].flatMap((workflow) => (
    Object.entries(jobsOf(readWorkflow(workflow)))
      .flatMap(([job, text]) => stepsOf(text)
        .filter((step) => /run: node tests\/browser\/touchAfterScreenshot\.mjs\s*$/m.test(step))
        .map((step) => ({ workflow, job, text, step }))
      )
  ));
  assert.ok(runs.length >= 1, 'some workflow ci.yml calls runs tests/browser/touchAfterScreenshot.mjs');
  for (const { workflow, job, text, step } of runs) {
    assert.doesNotMatch(step, /github\.event_name == 'schedule'/, `${workflow} ${job}: on pull requests, not only at night`);
    assert.match(step, /PLAYWRIGHT_MODULE: playwright/, `${workflow} ${job}: the driver is pointed at the installed Playwright`);
    assert.match(text, /timeout-minutes: \d+/, `${workflow} ${job} has a time limit`);
    for (const changed of [PROOF, HELPER]) {
      assert.ok(runsOnPullRequest(workflow, changed), `a change to ${changed} runs ${workflow}`);
    }
  }
});
