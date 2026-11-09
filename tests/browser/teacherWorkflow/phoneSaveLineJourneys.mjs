// THE SAVE LINE IS SEEN ON A PHONE (pass 3, wave 7, W7-8).
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   TEACHER_HARNESS_ORIGIN=http://127.0.0.1:5188 node tests/browser/teacherWorkflow/phoneSaveLineJourneys.mjs
//
// The real App, signed in as a student, in an assignment. On a phone the
// question stage clips (overflow: hidden) and the question was as tall as the
// stage, so the lines App.jsx puts after it — "Draft saved.", "Not saved ·
// this device could not store your last change…", and the draft-save problem
// notice — sat below the stage's box: at 390×844 "Draft saved." was drawn at
// 851–874, and no sighted student ever saw it.
//
// For every phone layout — upright 390×844, on its side 844×390 and 664×390,
// 320px reflow, 200% browser text (at 390×844, 375×667, 360×640, 320×568 and
// 844×390), and the WCAG 1.4.12 text-spacing override — and a Chromebook for
// reference:
//
//   R  on a phone, after the student types, the routine save line ("Draft
//      saved." and its kind) is not drawn, and the lines under the question
//      take no height: the question keeps its work area (the owner,
//      2026-10-20). On the Chromebook it is drawn as before;
//   L  a save line that needs the student is inside the screen, inside every
//      box that clips it, and nothing (the action bar, a toast) is drawn over
//      it. The line is the real one: the device refuses the write
//      (deviceStorageFault.mjs, the harness switch that aborts every
//      IndexedDB write as a full disk does), the app's own failure path runs,
//      and its longest line that needs the student is drawn ("Not saved ·
//      this device could not store your last change…"). The journey checks
//      that the sentence is the app's, not only where it sits (CI13: it used
//      to type that sentence into the line, because this harness's server
//      accepts every write, offline too). On the Chromebook the routine line
//      is measured first, as before, and then the same real failure;
//   N  with a draft the backup refused (planted the way
//      draftSaveNoticeReloadJourneys.mjs does), the problem notice is the same;
//   B  and upright, the question keeps its whole action bar beside either: at
//      200% text the notice once took the question's room and cut it in half,
//      and on a 320×568 or 360×640 phone even "Draft saved." or the notice
//      left no button of it reachable (W7-8 review, B1).
//
// At 200% text the lines under the question may be taller than the 30% of
// the stage they get; there the notice may scroll in place with its start in
// view: two lines upright, one on its side, where the whole stage is 177px
// and a second line would leave the question nothing (W7-8 review, S1).
//
// THE LINE SAYS "SAVED" ONLY FOR WORK THAT WAS (RUN-3). App.jsx's queued-work
// reconcile drains the device queue at sign-in, on a reconnect and every 10
// seconds, and a drain that left nothing owed used to say "Draft saved."
// whether or not it had delivered anything. On the Chromebook, where every
// line is drawn:
//
//   U  after sign-in, and after the reconcile's next drain, an untouched
//      question has had no save line at all (it read "Draft saved.");
//   T  the refused save's line still stands after the reconcile's next drain
//      (the drain wrote "Draft saved." over it, with nothing stored);
//   Q  and so it does while the device queue holds other work: the question's
//      progress, queued by Next and Previous, which this harness's server
//      never takes. The reconcile says the queued work is there before it
//      drains, and said "Draft saved on this device" over the refused line;
//   M  and the student moves on from that refused save: Home says an answer is
//      only on this screen; another assignment's untouched question has no
//      save line (the refusal is not about it); a save stored there leaves
//      Home saying it; a later save of the refused assignment's work clears
//      it; Log Out asks first while it stands, and the next student signed in
//      on this Chromebook is not told it.
//
// PHONE_SAVE_LINE_SHOTS=<dir> also saves a screenshot of each.
// PHONE_SAVE_LINE_ONLY="phone 390×844,Chromebook 1366×768" runs only the layouts
// whose id starts with one of those (all of them when it is not set).
// Exit code 1 on any failure.
import { mkdirSync } from 'node:fs';
import { installDeviceStorageFault, setDeviceStorageFull } from './deviceStorageFault.mjs';
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const STUDENT = '910002';
const ASSIGNMENT = 'a-today';
const KEPT = 'mathmaster:draft-save-health:v1';
const REFUSED = /can only be saved on this device, not backed up/;
// The longest save line, and one that needs the student (App.jsx, the
// device queue could not be written). What the app says when the device
// refuses a write: the journey checks the line it measures is this one.
const NEEDS_STUDENT_LINE = 'Not saved · this device could not store your last change. Keep this tab open and try it again.';
// studentShellLargeText.mjs's text-spacing override (the bookmarklet's values).
const SPACING = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }';

const SETTINGS = [
  { id: 'phone 390×844', width: 390, height: 844, mobile: true },
  { id: 'phone on its side 844×390', width: 844, height: 390, mobile: true },
  { id: 'reflow 320×640', width: 320, height: 640, mobile: true },
  { id: 'phone 390×844 at 200% text', width: 390, height: 844, mobile: true, textScale: 2 },
  { id: 'phone 375×667 at 200% text', width: 375, height: 667, mobile: true, textScale: 2 },
  { id: 'phone 360×640 at 200% text', width: 360, height: 640, mobile: true, textScale: 2 },
  { id: 'phone 320×568 at 200% text', width: 320, height: 568, mobile: true, textScale: 2 },
  { id: 'phone on its side 844×390 at 200% text', width: 844, height: 390, mobile: true, textScale: 2, minLines: 1 },
  { id: 'phone on its side 664×390', width: 664, height: 390, mobile: true },
  { id: 'phone 390×844 with text spacing', width: 390, height: 844, mobile: true, spacing: true },
  { id: 'Chromebook 1366×768', width: 1366, height: 768 },
];
// PHONE_SAVE_LINE_ONLY names layouts by their exact id, to run a few of them.
const ONLY = (process.env.PHONE_SAVE_LINE_ONLY || '').split(',').map((id) => id.trim()).filter(Boolean);
const CHOSEN = ONLY.length ? SETTINGS.filter((setting) => ONLY.includes(setting.id)) : SETTINGS;
if (ONLY.length && CHOSEN.length !== ONLY.length) {
  console.error(`PHONE_SAVE_LINE_ONLY names a layout that does not exist: ${ONLY.filter((id) => !SETTINGS.some((setting) => setting.id === id)).join(', ')}`);
  process.exit(2);
}

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launch.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launch);
const SHOTS = process.env.PHONE_SAVE_LINE_SHOTS || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name.replace(/[^a-z0-9]+/gi, '-')}.png` }) : null);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  return Boolean(ok);
};

// Everything a sighted student needs to see the element, measured in the
// page: the part of it left after the screen and every box that clips or
// scrolls it (its visible part), and what is drawn on top of that part. A
// Chromebook page scrolls, so there the element is first brought into view,
// as the student would.
const SEEN = ([selector, minLines = 2]) => {
  // The save line on screen as this measures, read in the same task: whether
  // what is measured is still beside the line it is meant to be.
  const saveLineNode = document.querySelector('[data-save-line]');
  const saveLine = saveLineNode ? { text: saveLineNode.textContent.trim(), routine: saveLineNode.hasAttribute('data-save-line-routine') } : null;
  const element = document.querySelector(selector);
  if (!element) return { cutBy: ['not on the page'], covered: [], full: false, startSeen: false, saveLine };
  const lineHeight = (node) => {
    const style = getComputedStyle(node);
    return parseFloat(style.lineHeight) || 1.2 * parseFloat(style.fontSize);
  };
  const name = (node) => `${node.tagName.toLowerCase()}.${String(node.className).split(' ')[0]}`;
  // The rectangle of `node` left after the screen and every ancestor whose
  // overflow is not visible; `cutBy` collects those that took something.
  const visiblePart = (node, cutBy = null) => {
    const rect = node.getBoundingClientRect();
    let part = { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    const clip = (box, by) => {
      const next = { top: Math.max(part.top, box.top), bottom: Math.min(part.bottom, box.bottom), left: Math.max(part.left, box.left), right: Math.min(part.right, box.right) };
      if (cutBy && (next.top > part.top + 0.5 || next.bottom < part.bottom - 0.5 || next.left > part.left + 0.5 || next.right < part.right - 0.5)) cutBy.push(by);
      part = next;
    };
    for (let parent = node.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (/hidden|clip|auto|scroll/.test(style.overflowX + style.overflowY)) {
        clip(parent.getBoundingClientRect(), `${name(parent)} (${Math.round(parent.getBoundingClientRect().top)}–${Math.round(parent.getBoundingClientRect().bottom)}, overflow ${style.overflowY})`);
      }
    }
    clip({ top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }, `the screen (${window.innerHeight}px)`);
    return { ...part, rect };
  };
  const cutBy = [];
  const part = visiblePart(element, cutBy);
  const { rect } = part;
  const visibleHeight = Math.max(0, part.bottom - part.top);
  const covered = [];
  if (visibleHeight > 6 && part.right - part.left > 6) {
    const inset = 3;
    [[part.left + inset, part.top + inset], [part.right - inset, part.top + inset],
      [part.left + inset, part.bottom - inset], [part.right - inset, part.bottom - inset],
      [(part.left + part.right) / 2, (part.top + part.bottom) / 2]].forEach(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      if (hit && !element.contains(hit)) covered.push(`covered at (${Math.round(x)}, ${Math.round(y)}) by ${name(hit)}`);
    });
  }
  // The action bar where it is drawn: in landscape it scrolls inside the
  // prompt's column, and most of its box is outside that column.
  const bar = [...document.querySelectorAll('.portrait-action-bar, .landscape-action-bar, .mathmaster-desktop-action-bar')]
    .find((candidate) => candidate.getBoundingClientRect().height > 0);
  if (bar && bar !== element) {
    const barPart = visiblePart(bar);
    if (barPart.left < part.right && part.left < barPart.right && barPart.top < part.bottom - 1 && part.top < barPart.bottom - 1) {
      covered.push(`under the action bar (${Math.round(barPart.top)}–${Math.round(barPart.bottom)})`);
    }
  }
  return {
    cutBy,
    covered: [...new Set(covered)],
    full: cutBy.length === 0 && rect.height >= 1,
    // Its start is on screen, uncut, with at least `minLines` lines of it.
    startSeen: part.top <= rect.top + 1 && visibleHeight >= Math.min(rect.height, minLines * lineHeight(element) - 2),
    // Cut only by the lines' own scrolling area under the question.
    onlyByStatus: cutBy.length > 0 && cutBy.every((by) => by.startsWith('div.mathmaster-question-stage-status')),
    text: element.textContent.trim().slice(0, 60),
    top: Math.round(rect.top),
    bottom: Math.round(rect.bottom),
    shown: `${Math.round(part.top)}–${Math.round(part.bottom)}`,
    saveLine,
  };
};

const settle = async (page, setting) => {
  if (setting.textScale) {
    await page.__cdp.send('Page.setFontSizes', { fontSizes: { standard: 16 * setting.textScale, fixed: 13 * setting.textScale } });
  }
  if (setting.spacing) await page.addStyleTag({ content: SPACING });
  await page.waitForTimeout(500);
};
const signedIn = async (page, setting, { reset = false } = {}) => {
  const search = new URLSearchParams({ as: 'student', studentId: STUDENT, questions: 'real', ...(reset ? { reset: '1' } : {}) });
  await page.goto(`${PAGE}?${search}`, { timeout: 180000 });
  await page.getByText('Log Out').first().waitFor({ timeout: 180000 });
  await settle(page, setting);
};
const openAssignment = async (page, setting) => {
  await page.getByRole('button', { name: /^(Continue|Resume Question|Start)/ }).first().click();
  await page.locator('.mathmaster-question-stage math-field').first().waitFor({ timeout: 60000 });
  await settle(page, setting);
};
const typeIntoFirst = async (page, text) => {
  const field = page.locator('.mathmaster-question-stage math-field').first();
  await field.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(text, { delay: 25 });
  await page.keyboard.press('Tab');
};
// EVERY STATE OF THE SAVE LINE, IN ORDER, recorded from before the app runs
// (an init script on the context). The student's saves are not the line's only
// writer: App.jsx's queued-work reconcile drains the device queue on sign-in,
// on a reconnect and every 10 seconds. A drain that left nothing owed used to
// say "Draft saved." whether or not anything was saved, so it was up before
// the student typed, and it landed on a refused save's line after the journey
// had read it: under load the journey took the first for the student's own
// save, and measured the second, hidden on a phone, as the refused line. A
// drain now says it only for work it delivered (U and T), but it can still
// deliver the student's save before that save's own drain does. Which save a
// line belongs to is read from this history.
const recordSaveLine = (context) => context.addInitScript(() => {
  const history = [];
  window.__saveLineHistory = history;
  const record = () => {
    const line = document.querySelector('[data-save-line]');
    const state = line ? { text: line.textContent.trim(), routine: line.hasAttribute('data-save-line-routine') } : { text: null, routine: false };
    const last = history[history.length - 1];
    if (!last || last.text !== state.text || last.routine !== state.routine) history.push(state);
  };
  new MutationObserver(record).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-save-line-routine'] });
});
const saveLineHistoryLength = (page) => page.evaluate(() => window.__saveLineHistory.length);
const saveLineSince = (page, from) => page.evaluate((start) => window.__saveLineHistory.slice(start).map((state) => state.text), from).catch(() => null);
// The save the student just made, finished: since they began typing (`from`,
// the history's length then) the line has said their draft was saved on this
// device, that save queued, and it now says "Draft saved.", which a drain says
// only once it has delivered work and nothing is owed (App.jsx
// drainStudentOutbox), so after that save was drained. The checkpoint waits out
// a debounce before it is written, so a "Draft saved." already on the line
// (an earlier save's) is not it: waiting for that, or for a fixed time, let the
// journey switch the device's storage off with the student's save still to come
// or still being written.
const QUEUED_DRAFT_LINE = 'Draft saved on this device. You may keep working.';
const savedAndSettled = (page, from) => page.waitForFunction(([start, queuedLine]) => {
  const since = window.__saveLineHistory.slice(start);
  const queued = since.findIndex((state) => state.routine && state.text === queuedLine);
  const now = since[since.length - 1];
  return queued >= 0 && queued < since.length - 1 && now.routine && now.text === 'Draft saved.';
}, [from, QUEUED_DRAFT_LINE], { timeout: 30000 }).catch(async () => {
  throw new Error(`the student's save never settled on "Draft saved." (the line since they typed: ${JSON.stringify(await saveLineSince(page, from))})`);
});
// The device refuses what the student types next (deviceStorageFault.mjs), and
// the app's own line for that save is read: the first line after the switch
// that needs the student, from the history. The switch stays on until the page
// is reloaded, so no later save is stored.
const failASave = async (page, digit = '8') => {
  const from = await saveLineHistoryLength(page);
  await page.evaluate((start) => { window.__refusalFrom = start; }, from);
  await setDeviceStorageFull(page, true);
  await typeIntoFirst(page, digit);
  try {
    const refused = await page.waitForFunction((start) => window.__saveLineHistory.slice(start).find((state) => state.text && !state.routine)?.text || false, from, { timeout: 15000 });
    return await refused.jsonValue();
  } catch {
    throw new Error(`the device refused a write, but the app showed no save line that needs the student (the line since: ${JSON.stringify(await saveLineSince(page, from))})`);
  }
};
// The refused save's line, and what is measured beside it, measured while it
// is the line on screen. Nothing may write over it first: the student changes
// nothing meanwhile, and a drain leaves a refused save's line as it is (App.jsx
// drainStudentOutbox). The reconcile's tick used to write "Draft saved." over
// it, and this journey then refused the next change too and measured that one,
// up to three times. That retry now guards nothing, and on a phone, where T
// does not run, it would hide a line written over again. So a line written
// over before it is measured fails the journey, with what replaced it.
const whileTheRefusedLineShows = async (page, refusedLine, measure) => {
  const results = await measure();
  const replaced = results.filter(Boolean).map((result) => result.saveLine).find((line) => !line || line.routine || line.text !== refusedLine);
  if (replaced === undefined) return results;
  const since = await saveLineSince(page, await page.evaluate(() => window.__refusalFrom ?? 0));
  throw new Error(`the refused save's line was written over before it was measured, by ${JSON.stringify(replaced ? replaced.text : null)} (the line since the refusal: ${JSON.stringify(since)})`);
};
// EVERY DRAIN OF THE DEVICE QUEUE, from the page's own copy of the telemetry
// module: a drain ends by reporting the queue's depth (durableActionOutbox.js,
// `submission_queue_depth`). A save that reaches the queue reports it too, so
// a check reads this only while nothing is being stored. With no sample, a
// check fails rather than pass on a reconcile that never ran.
const watchDrains = (page) => page.evaluate(async () => {
  if (window.__drainsAt) return;
  const telemetry = await import('/src/platform/performance/performanceTelemetry.js');
  window.__drainsAt = [];
  telemetry.subscribeToPerformanceSamples((sample) => {
    if (sample.name === 'submission_queue_depth') window.__drainsAt.push(Date.now());
  });
});
const pageNow = (page) => page.evaluate(() => Date.now());
// The reconcile's next drain after `since` (page time). Nothing the student
// does starts one in these checks, so it is the 10-second tick's.
const nextDrain = async (page, since, after) => {
  await page.waitForFunction((start) => window.__drainsAt.some((at) => at > start), since, { timeout: 25000 })
    .catch(() => { throw new Error(`no reconcile drained the device queue after ${after}`); });
  // Its status is set as the drain returns; let the line take it.
  await page.waitForTimeout(500);
};
const lineNow = (page) => page.evaluate(() => document.querySelector('[data-save-line]')?.textContent.trim() || null);
// U: the question is open and untouched. The sign-in reconcile has drained
// the (empty) queue by now, and the next tick drains it again.
const untouchedSaysNothing = async (page, setting) => {
  await watchDrains(page);
  await nextDrain(page, await pageNow(page), 'the question opened');
  const said = (await saveLineSince(page, 0)).filter((text) => text !== null);
  check(said.length === 0, `U  an untouched question has had no save line since sign-in, after the reconcile's next drain (${setting.id})`,
    said.length ? `the line said ${JSON.stringify(said)}` : 'no line');
};
// T: the refused save's line is on screen. The reconcile's next drain finds
// nothing owed (in Q, only work it cannot deliver) and delivers nothing, and
// the line still says what happened. The app may try the same change again
// meanwhile ("Saving…", refused again); it never says anything was saved.
const SAVING_LINE = 'Saving…';
const refusedLineStands = async (page, setting, label = 'T ', when = '') => {
  await watchDrains(page);
  const from = await saveLineHistoryLength(page);
  await nextDrain(page, await pageNow(page), 'the refused save');
  const since = (await saveLineSince(page, from)) || [];
  const now = await lineNow(page);
  const other = since.filter((text) => text !== NEEDS_STUDENT_LINE && text !== SAVING_LINE);
  check(now === NEEDS_STUDENT_LINE && other.length === 0, `${label} the refused save's line still stands after the reconcile's next drain${when} (${setting.id})`,
    `now "${now}"${other.length ? `; the line since the refusal also said ${JSON.stringify(other)}` : ''}`);
};
// What the device queue holds, read from IndexedDB itself (reads still work
// while the storage fault refuses writes).
const queuedActions = (page) => page.evaluate(() => new Promise((resolve) => {
  const open = indexedDB.open('mathmaster-student-actions');
  open.onerror = () => resolve(-1);
  open.onsuccess = () => {
    const database = open.result;
    try {
      const request = database.transaction('outbox', 'readonly').objectStore('outbox').count();
      request.onsuccess = () => { database.close(); resolve(request.result); };
      request.onerror = () => { database.close(); resolve(-1); };
    } catch {
      database.close();
      resolve(-1);
    }
  };
}));
// Q: Next and Previous queue the question's progress, which stays owed here
// (this harness answers no submission without `server=1`); then the device
// refuses a save on the question, and the reconcile's next tick finds the
// queue holding that progress.
const refusedWithWorkQueued = async (setting) => {
  console.log(`\n${setting.id}: a refused save while other work is queued`);
  const context = await newSchoolContext(browser, { viewport: { width: setting.width, height: setting.height } });
  await installDeviceStorageFault(context);
  await recordSaveLine(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${setting.id} (work queued): page error ${error.message}`));
  try {
    await signedIn(page, setting, { reset: true });
    await openAssignment(page, setting);
    for (const button of ['Next question', 'Previous question']) {
      const from = await saveLineHistoryLength(page);
      await page.locator(`button[aria-label="${button}"]`).filter({ visible: true }).first().click();
      await page.waitForFunction(([start, line]) => window.__saveLineHistory.slice(start).some((state) => state.text === line), [from, QUEUED_DRAFT_LINE], { timeout: 30000 });
      await page.locator('.mathmaster-question-stage math-field').first().waitFor({ timeout: 60000 });
      await settle(page, setting);
    }
    const refused = await failASave(page, '8');
    check(refused === NEEDS_STUDENT_LINE, `Q  the device refused a save while the question's progress is queued (${setting.id})`, `"${refused}"`);
    await refusedLineStands(page, setting, 'Q ', ', with other work still queued');
    const queued = await queuedActions(page);
    check(queued > 0, `Q  that progress was still in the device queue through the drain (${setting.id})`, `${queued} queued`);
  } catch (error) {
    check(false, `${setting.id} (work queued) ran to the end`, error.message.split('\n')[0]);
  }
  await context.close();
};
// M: Home, Assignments and another assignment, in the app (no reload: the
// line's state is the page's).
const NAV = 'nav[aria-label="Student navigation"]';
const ONLY_ON_SCREEN = /an answer is only on this screen/;
const homeLine = async (page) => {
  const line = page.locator('p[role="status"][data-save-tone]').first();
  await line.waitFor({ timeout: 30000 });
  await page.waitForTimeout(300);
  return { tone: await line.getAttribute('data-save-tone'), text: (await line.innerText()).replace(/\s+/g, ' ').trim() };
};
const leaveAssignment = async (page) => {
  await page.locator('.mathmaster-unified-nav-back').filter({ visible: true }).first().click();
  await page.locator(NAV).filter({ visible: true }).first().waitFor({ timeout: 30000 });
};
const goToScreen = async (page, label) => {
  await page.locator(NAV).filter({ visible: true }).first().locator('a', { hasText: label }).first().click();
};
// Start or Continue on the assignment's row, in whichever tab of Assignments
// it is listed under (an assignment not yet started is "Upcoming").
const openFromAssignments = async (page, assignmentId, setting) => {
  await goToScreen(page, 'Assignments');
  const tabs = page.getByRole('tablist', { name: 'Assignment categories' }).getByRole('tab');
  await tabs.first().waitFor({ timeout: 30000 });
  const open = page.locator(`[data-row-actions="${assignmentId}"] button`).filter({ hasText: /^(Start|Continue)/ }).first();
  for (let index = 0; !(await open.count()) && index < await tabs.count(); index += 1) {
    await tabs.nth(index).click();
    await page.waitForTimeout(300);
  }
  await open.click({ timeout: 10000 });
  await page.locator('.mathmaster-question-stage math-field').first().waitFor({ timeout: 60000 });
  await settle(page, setting);
};
// A student with two assignments open at once: the fixture's `&prereq=1`
// opens Lesson 4 early for 910004 (fixture.js PREREQUISITE_EARLY), beside
// today's lesson, whose Warm-Up is open.
const MOVING_ON = Object.freeze({ student: '910004', refusedOn: 'a-prereq-lesson', other: 'a-today', next: '910005' });
const movingOn = async (setting) => {
  console.log(`\n${setting.id}: moving on from a refused save`);
  const context = await newSchoolContext(browser, { viewport: { width: setting.width, height: setting.height } });
  await installDeviceStorageFault(context);
  await recordSaveLine(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${setting.id} (moving on): page error ${error.message}`));
  const { student, refusedOn, other, next } = MOVING_ON;
  try {
    const search = new URLSearchParams({ as: 'student', studentId: student, questions: 'real', prereq: '1', reset: '1' });
    await page.goto(`${PAGE}?${search}`, { timeout: 180000 });
    await page.getByText('Log Out').first().waitFor({ timeout: 180000 });
    await settle(page, setting);
    await watchDrains(page);
    await openFromAssignments(page, refusedOn, setting);
    const refused = await failASave(page, '8');
    check(refused === NEEDS_STUDENT_LINE, `M  the device refused a save on ${refusedOn} (${setting.id})`, `"${refused}"`);
    // M1: Home.
    await leaveAssignment(page);
    await goToScreen(page, 'Home');
    let home = await homeLine(page);
    check(ONLY_ON_SCREEN.test(home.text), `M1 Home says an answer is only on this screen once the student has left it (${setting.id})`, home.text);
    // M2: another assignment, untouched, through the reconcile's next drain.
    const otherFrom = await saveLineHistoryLength(page);
    await openFromAssignments(page, other, setting);
    await nextDrain(page, await pageNow(page), `${other} opened`);
    const otherSaid = (await saveLineSince(page, otherFrom)).filter((text) => text !== null);
    check(otherSaid.length === 0, `M2 another assignment's untouched question has no save line: the refusal is not about it (${setting.id})`,
      otherSaid.length ? `the line said ${JSON.stringify(otherSaid)}` : 'no line');
    // M3: a save stored on that other assignment.
    await setDeviceStorageFull(page, false);
    const otherTyped = await saveLineHistoryLength(page);
    await typeIntoFirst(page, '4');
    await savedAndSettled(page, otherTyped);
    await leaveAssignment(page);
    await goToScreen(page, 'Home');
    home = await homeLine(page);
    check(ONLY_ON_SCREEN.test(home.text), `M3 a save stored on another assignment leaves Home saying an answer is only on this screen (${setting.id})`, home.text);
    // M4: the refused assignment's work, saved later.
    await openFromAssignments(page, refusedOn, setting);
    const againFrom = await saveLineHistoryLength(page);
    await typeIntoFirst(page, '5');
    await savedAndSettled(page, againFrom);
    await leaveAssignment(page);
    await goToScreen(page, 'Home');
    home = await homeLine(page);
    check(home.tone === 'saved' && !ONLY_ON_SCREEN.test(home.text), `M4 once that assignment's work is saved later, Home no longer says it (${setting.id})`, home.text);
    // M5: refused again, then Log Out and the next student on this Chromebook.
    await openFromAssignments(page, refusedOn, setting);
    const refusedAgain = await failASave(page, '6');
    check(refusedAgain === NEEDS_STUDENT_LINE, `M5 the device refused another save on ${refusedOn} (${setting.id})`, `"${refusedAgain}"`);
    await leaveAssignment(page);
    await page.getByRole('button', { name: 'Log Out' }).first().click();
    const dialog = page.getByRole('alertdialog');
    const asked = await dialog.waitFor({ timeout: 10000 }).then(() => dialog.innerText()).catch(() => '');
    check(/hasn't been sent/.test(asked), `M5 Log Out asks first while that work is only on screen (${setting.id})`, asked.replace(/\s+/g, ' ').slice(0, 120) || 'no question');
    if (asked) await dialog.getByRole('button', { name: 'Log out anyway' }).click();
    await page.waitForTimeout(800);
    await page.evaluate((id) => window.__mmHarnessAuth.signInStudent(id), next);
    await page.getByText('Log Out').first().waitFor({ timeout: 60000 });
    await settle(page, setting);
    home = await homeLine(page);
    check(home.tone === 'saved' && !ONLY_ON_SCREEN.test(home.text), `M5 the next student on this Chromebook is not told the last one's work is only on screen (${setting.id})`, home.text);
    await shot(page, `moving on ${setting.id}`);
  } catch (error) {
    check(false, `${setting.id} (moving on) ran to the end`, error.message.split('\n')[0]);
  }
  await context.close();
};
const draftKeys = (page) => page.evaluate((prefix) => Object.keys(window.localStorage).filter((key) => key.startsWith(prefix)), `mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}:`);
const plant = (page, keys) => page.evaluate(([name, value]) => window.sessionStorage.setItem(name, value), [KEPT, JSON.stringify({ 'backup-refused': keys })]);
const seen = async (page, selector, setting) => {
  // The Chromebook page scrolls; a phone's assignment screen does not.
  if (!setting.mobile) await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  return page.evaluate(SEEN, [selector, setting.minLines]);
};
// Whole and uncovered. At 200% text the lines under the question may be
// taller than the 30% of the stage they are given; there they scroll in place,
// and the notice's start must be in view.
const report = (label, result, { mayScroll = false } = {}) => {
  const scrolls = mayScroll && !result.full && result.onlyByStatus && result.startSeen;
  const problems = [...(result.full || scrolls ? [] : result.cutBy.map((by) => `cut by ${by}`)), ...result.covered];
  if (!result.full && !scrolls && !result.cutBy.length) problems.push('has no size');
  return check(problems.length === 0, label, problems.length
    ? `${problems.join('; ')}${result.text ? ` ("${result.text}")` : ''}`
    : `${result.top}–${result.bottom}${scrolls ? `, its start in view (${result.shown}), the rest scrolls in place` : ''}`);
};

for (const setting of CHOSEN) {
  console.log(`\n${setting.id}`);
  const context = await newSchoolContext(browser, {
    viewport: { width: setting.width, height: setting.height },
    isMobile: Boolean(setting.mobile),
    hasTouch: Boolean(setting.mobile),
  });
  await installDeviceStorageFault(context);
  await recordSaveLine(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${setting.id}: page error ${error.message}`));
  if (setting.textScale) {
    page.__cdp = await context.newCDPSession(page);
    await page.__cdp.send('Page.enable');
  }
  try {
    await signedIn(page, setting, { reset: true });
    await openAssignment(page, setting);
    if (!setting.mobile) await untouchedSaysNothing(page, setting);
    const typedFrom = await saveLineHistoryLength(page);
    await typeIntoFirst(page, '7');
    await savedAndSettled(page, typedFrom);
    const upright = setting.mobile && setting.width <= setting.height;
    const barWhole = async (what) => {
      if (!upright) return;
      report(`B  the action bar is whole beside the ${what} (${setting.id})`, await seen(page, '.portrait-action-bar', setting));
    };
    if (setting.mobile) {
      const routine = await page.evaluate(() => {
        const line = document.querySelector('[data-save-line]');
        const status = document.querySelector('.mathmaster-question-stage-status');
        return {
          text: line?.textContent.trim() || '',
          routine: line?.hasAttribute('data-save-line-routine') || false,
          drawn: Boolean(line && line.getClientRects().length),
          statusHeight: status ? status.getBoundingClientRect().height : null,
        };
      });
      check(routine.routine && !routine.drawn && routine.statusHeight === 0,
        `R  the routine save line is not drawn on a phone, and the question keeps the room (${setting.id})`,
        `"${routine.text}" ${routine.routine ? 'routine' : 'not marked routine'}, ${routine.drawn ? 'drawn' : 'not drawn'}, the lines take ${routine.statusHeight}px`);
      await shot(page, `routine ${setting.id}`);
      // A line that needs the student is drawn: the device refuses the next
      // write and the app says so in its own words (see L above).
      const refusedLine = await failASave(page);
      check(refusedLine === NEEDS_STUDENT_LINE, `L  the line is the app's own words for a write the device refused (${setting.id})`, `"${refusedLine}"`);
      // At 200% text the longest line is taller than the 30% cap and scrolls
      // in place, its start in view, as the problem notice does (W7-8).
      const [line, bar] = await whileTheRefusedLineShows(page, refusedLine, async () => [
        await seen(page, '[data-save-line]', setting),
        upright ? await seen(page, '.portrait-action-bar', setting) : null,
      ]);
      report(`L  a save line that needs the student is seen (the real "Not saved" line; ${setting.id})`, line, { mayScroll: setting.textScale === 2 });
      await shot(page, `line ${setting.id}`);
      if (bar) report(`B  the action bar is whole beside the offline save line (${setting.id})`, bar);
    } else {
      report(`L  the save line is seen (${setting.id})`, await seen(page, '[data-save-line]', setting));
      await shot(page, `line ${setting.id}`);
      // And the same real failure: a Chromebook draws every line.
      const refusedLine = await failASave(page);
      check(refusedLine === NEEDS_STUDENT_LINE, `L  the line is the app's own words for a write the device refused (${setting.id})`, `"${refusedLine}"`);
      const [line] = await whileTheRefusedLineShows(page, refusedLine, async () => [await seen(page, '[data-save-line]', setting)]);
      report(`L  a save line that needs the student is seen (the real "Not saved" line; ${setting.id})`, line);
      await shot(page, `line refused ${setting.id}`);
      await refusedLineStands(page, setting);
    }

    const keys = await draftKeys(page);
    const draft = keys.find((key) => !key.includes(':ui') && !key.endsWith(':resume')) || keys[0];
    check(Boolean(draft), `the question has a draft on this device (${setting.id})`, JSON.stringify(keys));
    await plant(page, [draft]);
    await signedIn(page, setting);
    await openAssignment(page, setting);
    await page.locator('[data-draft-save-problem]').first().waitFor({ timeout: 15000 });
    const notice = await seen(page, '[data-draft-save-problem]', setting);
    check(REFUSED.test(await page.locator('[data-draft-save-problem]').first().innerText()), `the notice is the backup's (${setting.id})`);
    report(`N  the draft-save problem notice is seen (${setting.id})`, notice, { mayScroll: setting.textScale === 2 });
    await shot(page, `notice ${setting.id}`);
    await barWhole('notice');
  } catch (error) {
    check(false, `${setting.id} ran to the end`, error.message.split('\n')[0]);
  }
  await context.close();
}
for (const setting of CHOSEN.filter((each) => !each.mobile)) {
  await movingOn(setting);
  await refusedWithWorkQueued(setting);
}

await browser.close();
console.log(`\n${failures.length ? `${failures.length} failure(s)` : 'all passed'}`);
process.exit(failures.length ? 1 : 0);
