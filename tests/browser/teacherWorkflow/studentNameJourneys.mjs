// THE STUDENT NAME JOURNEYS, AGAINST THE REAL APP IN MEMORY.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/studentNameJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults are not installed; VIEWPORTS=1440x900,1024x768;
//    ONLY=N1,N4 to run some journeys; HARNESS_QUERY=&rosterSelect=legacy
//    replays the pre-contract roster projection, to reproduce the original
//    defect against an older client.)
//
// Same harness as journeys.mjs: the real App.jsx with `firebase/*` replaced by
// in-memory fakes and a synthetic school (fixture.js) — nothing can reach a
// Firebase project. listSignInAccess and setStudentName are faked with the
// SHARED projection, row builder, order and validation the server uses
// (functions/shared/studentIdentity.mjs), so the teacher's lightweight roster
// here is the one production sends.
//
// The fixture puts five invented identity edge cases in the Lab section of
// Period 3, all working on today's lesson (fixture.js IDENTITY_EDGE_STUDENTS):
//   910090  googleName is the ONLY name      -> "Rowan Exampleton"
//   910091  no name field at all             -> "Name unavailable" + "ID 910091"
//   910092  displayName equal to its own id  -> "Name unavailable" + "ID 910092"
//   910093, 910094  two students, one name   -> two tiles/rows, never merged
//
//   N1  Home (summary roster): Live Class tiles in Room, Attention and
//       Walkthrough; a support action on a nameless tile stores no id as a name;
//       the Student Support section's picker, a teacher note and its history
//   N2  Classes workspace, the Assignment Hub, Attendance History, and Find by
//       first name, last name, full name and student id
//   N3  full student data: Students, Grades and Grade Export name every student
//       the way the lightweight roster does
//   N4  Sign-in Access: the missing-name diagnostic, "Add name" (an id is
//       refused), then every surface shows the new name after the roster
//       refresh — and grades/910091 (attempt history included) is otherwise
//       byte-identical, as is every other student's record (Test E)
//
// Every screen is swept for a bare roster id used as text or as an accessible
// name: a text node or aria-label/title equal to a roster id, starting with
// one ("910091: Working"), or holding one anywhere, that is not labelled as an
// id ("ID 910091", or a table column headed ID) is a finding.
//
// Exit code 1 on any finding. Advisories (product decisions worth a second
// look, not rule violations) are printed but do not fail the run.
// Screenshots in tests/browser/artifacts/studentNames/ (git-ignored).

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { IDENTITY_EDGE_IDS, IDENTITY_NAME_TO_ADD, TEACHER_EMAIL } from './fixture.js';
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/studentNames');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html?reset=1${process.env.HARNESS_QUERY || ''}`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const VIEWPORTS = (process.env.VIEWPORTS || '1440x900')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

// ---------------------------------------------------------------- the people
const [GOOGLE_ONLY, NO_NAME, ID_AS_NAME, TWIN_A, TWIN_B] = IDENTITY_EDGE_IDS;
const NAMELESS = [NO_NAME, ID_AS_NAME];
const TWINS = [TWIN_A, TWIN_B];
const GOOGLE_NAME = /Rowan Exampleton|Exampleton, Rowan/;
const TWIN_NAME = /Juniper Samplewood|Samplewood, Juniper/;
const ADDED = IDENTITY_NAME_TO_ADD;
const ADDED_NAME = new RegExp(`${ADDED.firstName} ${ADDED.lastName}|${ADDED.lastName}, ${ADDED.firstName}`);
const UNAVAILABLE = 'Name unavailable';
const LAB = 'Algebra II Lab — Period 3';
// The fields setStudentName may change on grades/{id}; everything else is history.
const NAME_WRITE_FIELDS = new Set(['firstName', 'lastName', 'displayName', 'nameUpdatedAt', 'nameUpdatedBy', 'identityBackfill']);

// ---------------------------------------------------------------- reporting
const findings = [];
const advisories = [];
const passed = [];
const squash = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const text = async (locator) => squash(await locator.innerText());
const expect = (journey, condition, detail) => {
  if (!condition) findings.push({ journey, detail });
  return Boolean(condition);
};
const advise = (journey, detail) => { if (!advisories.some((entry) => entry.detail === detail)) advisories.push({ journey, detail }); };

// ---------------------------------------------------------------- harness helpers
const settle = (page, ms = 600) => page.waitForTimeout(ms);
const sidebar = async (page, name) => {
  await page.locator('nav, aside').getByRole('button', { name: new RegExp(`${name}(\\s*\\(\\d+\\))?$`) }).first().click();
  await settle(page, 1500);
};
const store = (page) => page.evaluate(() => Object.fromEntries(JSON.parse(localStorage.getItem('mm-teacher-workflow-harness-db-v1'))));
const harnessStats = (page) => page.evaluate(() => window.__mmHarnessStore?.stats?.() || {});
const rosterIds = (page) => page.evaluate(() => window.__mmHarnessStore.paths('grades/')
  .filter((key) => key.split('/').length === 2).map((key) => key.split('/')[1]).filter((id) => /^\d+$/.test(id)));
const shot = (page, name) => page.screenshot({ path: path.join(ARTIFACTS, `${name}-${page.viewportSize().width}.png`), fullPage: false }).catch(() => {});

/*
 * THE SWEEP. Every text node, aria-label, title and alt under `scope` that
 * holds a roster id the way a NAME would: exactly the id, starting with it, or
 * containing it — unless the text right before it labels it as an id
 * ("ID 910091", "ID: 910091", "#910091") or it sits in a table column headed
 * "ID". Returns [{ kind, where, id, text }].
 */
const sweepForBareIds = (page, scope, ids) => page.evaluate(({ scope: selector, ids: rosterIdList }) => {
  const root = document.querySelector(selector) || document.body;
  const LABELLED = /(?:\bID|#)\s*[:#]?\s*$/i;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'TITLE']);
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = rosterIdList.map((id) => ({ id, re: new RegExp(`(?<![\\w])${escape(id)}(?![\\w])`, 'g') }));
  const short = (value) => String(value).replace(/\s+/g, ' ').trim().slice(0, 140);
  const describe = (element) => {
    const parts = [];
    for (let cursor = element; cursor && cursor !== document.body && parts.length < 3; cursor = cursor.parentElement) {
      parts.unshift(`${cursor.tagName.toLowerCase()}${cursor.getAttribute('aria-label') ? `[aria-label="${short(cursor.getAttribute('aria-label')).slice(0, 40)}"]` : ''}`);
    }
    return parts.join(' > ');
  };
  const columnHeadedId = (element) => {
    const cell = element.closest('td, th');
    const table = cell?.closest('table');
    if (!cell || !table) return false;
    const header = table.tHead?.rows?.[0]?.cells?.[cell.cellIndex]?.textContent || '';
    return /\bID\b/i.test(header);
  };
  const kindOf = (value, id, index) => {
    const trimmed = value.trim();
    if (trimmed === id) return 'exact';
    if (value.slice(0, index).trim() === '') return 'leading';
    return 'inline';
  };
  const results = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || SKIP.has(parent.tagName) || parent.closest('script, style, noscript, textarea')) continue;
    const value = node.nodeValue;
    for (const { id, re } of patterns) {
      re.lastIndex = 0;
      for (let match = re.exec(value); match; match = re.exec(value)) {
        // The text before the id within its own block: a label in a sibling
        // node ("ID " then "910091") counts.
        const container = parent.closest('li, td, th, p, div, button, option, label, dd, dt, h1, h2, h3, h4, span, strong') || parent;
        const range = document.createRange();
        range.setStart(container, 0);
        range.setEnd(node, match.index);
        const before = range.toString();
        if (LABELLED.test(before) || columnHeadedId(parent)) continue;
        results.push({ kind: kindOf(value, id, match.index), where: describe(parent), id, text: short(squashText(container)) });
      }
    }
  }
  function squashText(element) { return element.innerText || element.textContent || ''; }
  root.querySelectorAll('[aria-label], [title], [alt]').forEach((element) => {
    ['aria-label', 'title', 'alt'].forEach((attribute) => {
      const value = element.getAttribute(attribute);
      if (!value) return;
      patterns.forEach(({ id, re }) => {
        re.lastIndex = 0;
        for (let match = re.exec(value); match; match = re.exec(value)) {
          if (LABELLED.test(value.slice(0, match.index))) continue;
          results.push({ kind: `@${attribute}:${kindOf(value, id, match.index)}`, where: describe(element), id, text: short(value) });
        }
      });
    });
  });
  return results;
}, { scope, ids });

const sweep = async (journey, page, where, scope = 'body') => {
  const ids = await rosterIds(page);
  const hits = await sweepForBareIds(page, scope, ids);
  // One finding per distinct text, so a list of 30 rows is not 30 findings.
  const distinct = [...new Map(hits.map((hit) => [`${hit.kind}|${hit.text}`, hit])).values()];
  distinct.forEach((hit) => expect(journey, false, `${where}: roster id ${hit.id} shown as text, not labelled as an id (${hit.kind} in ${hit.where}: "${hit.text}")`));
  return distinct.length;
};

/*
 * The visible "row" that names a student whose id is shown labelled ("ID x"):
 * the nearest element around that label holding more than the label itself.
 * Returns the squashed text of each such row under `scope`.
 */
const rowsForId = (page, scope, id) => page.evaluate(({ scope: selector, id: studentId }) => {
  const root = document.querySelector(selector) || document.body;
  const squashed = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const label = `ID ${studentId}`;
  const bare = (value) => squashed(value).replace(/^[·\s|(),-]+|[·\s|(),-]+$/g, '');
  const rows = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue.includes(studentId)) continue;
    let element = node.parentElement;
    if (!element || !squashed(element.textContent).includes(label)) continue;
    if (element.closest('option, select, [role="listbox"]')) continue;
    while (element.parentElement && element !== root && bare(element.innerText) === label) element = element.parentElement;
    if (element.offsetParent === null && element.getClientRects().length === 0) continue;
    rows.add(element);
  }
  return [...rows].map((element) => squashed(element.innerText).slice(0, 260));
}, { scope, id });

const expectNamelessRow = async (journey, page, where, scope, id) => {
  const rows = await rowsForId(page, scope, id);
  expect(journey, rows.length > 0, `${where}: a row labelled "ID ${id}" is shown for the nameless student`);
  rows.forEach((row) => expect(journey, row.includes(UNAVAILABLE), `${where}: the nameless student ${id} reads "${UNAVAILABLE}" (${row.slice(0, 120)})`));
  return rows;
};
const expectNamedRow = async (journey, page, where, scope, id, name) => {
  const rows = await rowsForId(page, scope, id);
  expect(journey, rows.length > 0, `${where}: a row labelled "ID ${id}" is shown`);
  rows.forEach((row) => {
    expect(journey, name.test(row), `${where}: student ${id} is named ${name} (${row.slice(0, 120)})`);
    expect(journey, !row.includes(UNAVAILABLE), `${where}: student ${id} has a name on file, not "${UNAVAILABLE}" (${row.slice(0, 120)})`);
  });
  return rows;
};

// A comparable name: case and "Last, First" order do not matter.
const nameKey = (value) => squash(value).toLowerCase().replace(/,/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

const chooseLab = async (page) => {
  await page.getByRole('group', { name: 'Classes in session' }).getByRole('button', { name: /Lab/ }).click();
  await settle(page, 1500);
};
const liveTiles = (page) => page.locator('#home-live-class [role="button"][aria-label]').evaluateAll((elements) => elements.map((element) => ({
  label: element.getAttribute('aria-label') || '',
  name: (element.querySelector('span')?.textContent || '').trim(),
  idLine: (element.querySelector('[data-student-id-label]')?.textContent || '').trim(),
})));
const liveMode = async (page, name) => {
  await page.locator('#home-live-class').getByRole('tab', { name: new RegExp(`^${name}`) }).click();
  await settle(page, 900);
};

const openFind = async (page, query) => {
  await page.getByRole('button', { name: /Find/ }).first().click();
  // The palette clears its query as it opens; type once it has.
  await settle(page, 300);
  await page.getByPlaceholder('Student, class, assignment or TEKS code').fill(query);
  await settle(page, 700);
  return page.locator('[role="listbox"] [role="option"]').evaluateAll((elements) => elements.map((element) => (element.innerText || '').replace(/\s+/g, ' ').trim()));
};
const closeFind = async (page) => { await page.keyboard.press('Escape'); await settle(page, 300); };

// Find must reach the right student by first name, last name, full name and id.
const checkFind = async (journey, page, cases) => {
  for (const { query, id, name, count = 1 } of cases) {
    const options = (await openFind(page, query)).filter((option) => /^Student\b/.test(option));
    await closeFind(page);
    const forId = options.filter((option) => option.includes(`ID ${id}`));
    expect(journey, forId.length === 1, `Find "${query}" finds student ${id} (${JSON.stringify(options.slice(0, 4))})`);
    forId.forEach((option) => expect(journey, name.test(option), `Find "${query}": student ${id} is named ${name} (${option})`));
    expect(journey, options.length >= count, `Find "${query}" lists ${count} student(s) (${options.length})`);
  }
};

const supportSection = (page) => page.locator('section', { has: page.getByRole('heading', { name: 'Student Support & Intervention' }) }).first();
const notePicker = (page) => supportSection(page).locator('select').filter({ has: page.locator('option', { hasText: 'Choose student…' }) }).first();

// An option's text (allInnerTexts is empty for a closed <select>).
const pickerOptions = (page) => notePicker(page).locator('option').evaluateAll((elements) => elements.map((element) => (element.textContent || '').replace(/\s+/g, ' ').trim()));

// Saves a teacher note for one student through the Student Support section.
const saveTeacherNote = async (page, studentId, note) => {
  const section = supportSection(page);
  const summary = section.locator('summary', { hasText: 'Add teacher note / intervention' });
  const details = summary.locator('xpath=..');
  if (!(await details.evaluate((element) => element.open))) await summary.click();
  await notePicker(page).selectOption(studentId);
  await section.getByPlaceholder('What did you observe or do?').fill(note);
  await section.getByRole('button', { name: 'Save teacher note' }).click();
  await settle(page, 1200);
};
const supportEventsFor = async (page, studentId) => Object.entries(await store(page))
  .filter(([key, value]) => key.startsWith('studentSupportEvents/') && value?.studentId === studentId)
  .map(([key, value]) => ({ key, ...value }));
const recentHistory = async (page) => {
  const section = supportSection(page);
  const summary = section.locator('summary', { hasText: /Recent support history/ });
  const details = summary.locator('xpath=..');
  if (!(await details.evaluate((element) => element.open))) await summary.click();
  await settle(page, 300);
  return text(details);
};

// A stored name copy is a real name or nothing: never the id, never a label.
const expectStoredNameIsNotAnId = (journey, where, record, studentId) => {
  const stored = record?.studentName ?? null;
  expect(journey, stored !== studentId && !String(stored ?? '').includes(studentId), `${where}: the stored studentName is not the id (${JSON.stringify(stored)})`);
  expect(journey, stored === null || stored === '' || !/name unavailable|^student$/i.test(String(stored)), `${where}: the stored studentName is not a placeholder (${JSON.stringify(stored)})`);
};

// ---------------------------------------------------------------- journeys
const journeys = {
  async N1(page) {
    const J = 'N1';
    expect(J, /lightweight live roster/.test(await text(page.locator('body'))), 'Home runs on the lightweight (summary) roster');
    await chooseLab(page);
    const live = page.locator('#home-live-class');
    await live.waitFor();

    // Room view (the default).
    let tiles = await liveTiles(page);
    const google = tiles.filter((tile) => tile.label.startsWith('Rowan Exampleton'));
    expect(J, google.length === 1 && google[0].name === 'Rowan Exampleton', `Room: the googleName-only student's tile is named from googleName (${JSON.stringify(google)})`);
    const twins = tiles.filter((tile) => tile.name === 'Juniper Samplewood');
    expect(J, twins.length === 2, `Room: two students who share a name are two tiles (${twins.length})`);
    for (const id of NAMELESS) {
      const tile = tiles.filter((entry) => entry.label.startsWith(`${UNAVAILABLE} · ID ${id}:`));
      expect(J, tile.length === 1 && tile[0].name === UNAVAILABLE, `Room: ${id}'s tile reads "${UNAVAILABLE}", its aria-label names the id as an id (${JSON.stringify(tile)})`);
      if (tile[0] && !tile[0].idLine) advise(J, `Live Class Room view (the default teacher view, "Large room tiles" off): nameless tiles show "${UNAVAILABLE}" with no visible "ID x" line, so two of them look identical (the id is only in the aria-label). src/components/teacher/LiveClassMonitor.jsx showStudentId={mode !== 'room'}`);
    }
    expect(J, tiles.length === 9, `Room: one tile per Lab student (${tiles.length})`);
    await sweep(J, page, 'Live Class (Room)', '#home-live-class');
    await shot(page, 'N1-live-room');

    // Bring the two nameless students into the teacher's Attention and
    // Walkthrough views: their tabs go to the background (pageVisible false).
    await page.evaluate((ids) => ids.forEach((id) => window.__mmHarnessStore.update(`presence/${id}`, { pageVisible: false })), NAMELESS);
    await settle(page, 1200);
    await liveMode(page, 'Attention');
    tiles = await liveTiles(page);
    for (const id of NAMELESS) {
      const tile = tiles.filter((entry) => entry.label.startsWith(`${UNAVAILABLE} · ID ${id}:`));
      expect(J, tile.length === 1, `Attention: ${id} needs a look and has a tile (${tiles.map((entry) => entry.label).join(' | ')})`);
      expect(J, tile[0]?.name === UNAVAILABLE && tile[0]?.idLine === `ID ${id}`, `Attention: ${id} reads "${UNAVAILABLE}" with "ID ${id}" as secondary text (${JSON.stringify(tile[0])})`);
    }
    await sweep(J, page, 'Live Class (Attention)', '#home-live-class');
    await shot(page, 'N1-live-attention');

    // A support action from a nameless tile stores the studentId and no name.
    const tile = live.locator(`[role="button"][aria-label^="${UNAVAILABLE} · ID ${NO_NAME}:"]`).first();
    const watch = tile.getByRole('button', { name: 'Watch Practice' });
    if (expect(J, await watch.count() > 0, `Attention: the nameless tile offers its support actions (${await text(tile)})`)) {
      const before = (await supportEventsFor(page, NO_NAME)).length;
      await watch.first().click();
      await settle(page, 1200);
      // A click inside the tile can open the learning-profile drawer too; close it.
      await page.keyboard.press('Escape');
      await settle(page, 400);
      const events = await supportEventsFor(page, NO_NAME);
      expect(J, events.length === before + 1, `Watch Practice from the tile records one support event for ${NO_NAME} (${events.length - before})`);
      events.forEach((event) => expectStoredNameIsNotAnId(J, `support event ${event.key}`, event, NO_NAME));
    }

    await liveMode(page, 'Walkthrough');
    // Walkthrough opens on "Needs Check"; the whole room is one filter away.
    await live.getByRole('button', { name: /^All \(\d+\)/ }).first().click();
    await settle(page, 600);
    const walkthrough = await text(live);
    for (const id of NAMELESS) {
      // The card's id label is a separate span beside the name ("Name unavailable" "ID 910091").
      expect(J, new RegExp(`${UNAVAILABLE}\\s*·?\\s*ID ${id}\\b`).test(walkthrough), `Walkthrough: ${id} reads "${UNAVAILABLE}" beside "ID ${id}"`);
    }
    await sweep(J, page, 'Live Class (Walkthrough)', '#home-live-class');
    await liveMode(page, 'Room');

    // The Student Support section on Home.
    const options = await pickerOptions(page);
    expect(J, options.filter((option) => option === 'Rowan Exampleton').length === 1, 'Student Support: the googleName-only student is in the note picker by name');
    NAMELESS.forEach((id) => expect(J, options.includes(`${UNAVAILABLE} · ID ${id}`), `Student Support: the note picker lists ${id} as "${UNAVAILABLE} · ID ${id}"`));
    const twinOptions = options.filter((option) => TWIN_NAME.test(option));
    expect(J, twinOptions.length === 2, `Student Support: both students named Juniper Samplewood are in the note picker (${twinOptions.length})`);
    if (twinOptions.length === 2 && twinOptions[0] === twinOptions[1]) {
      advise(J, `Student Support note picker: two different students who share a name are two options with the same text ("${twinOptions[0]}"), so a teacher cannot tell which one a note is for. src/components/teacher/StudentSupportDashboard.jsx (note <select>, formatStudentLabel without the id); Live tiles and the hub lists have the same ambiguity`);
    }
    await saveTeacherNote(page, NO_NAME, 'Checked in at the back table (synthetic note).');
    const notes = (await supportEventsFor(page, NO_NAME)).filter((event) => /synthetic note/.test(event.note || event.summary || ''));
    expect(J, notes.length === 1, `Student Support: the teacher note is stored for ${NO_NAME} (${notes.length})`);
    notes.forEach((event) => expectStoredNameIsNotAnId(J, 'teacher note', event, NO_NAME));
    const history = await recentHistory(page);
    expect(J, history.includes(`${UNAVAILABLE} · ID ${NO_NAME}`), `Student Support history names the nameless student "${UNAVAILABLE} · ID ${NO_NAME}" (${history.slice(0, 160)})`);
    await sweep(J, page, 'Home');
    await shot(page, 'N1-home');
  },

  async N2(page) {
    const J = 'N2';
    await sidebar(page, 'Classes');
    await page.getByRole('button', { name: new RegExp(LAB) }).first().click();
    await settle(page, 1500);
    const main = 'body';
    await expectNamedRow(J, page, 'Classes roster', main, GOOGLE_ONLY, GOOGLE_NAME);
    for (const id of NAMELESS) await expectNamelessRow(J, page, 'Classes roster', main, id);
    for (const id of TWINS) await expectNamedRow(J, page, 'Classes roster', main, id, TWIN_NAME);
    await sweep(J, page, 'Classes workspace');
    await shot(page, 'N2-classes');

    // The Assignment Hub for today's lesson, opened from the Lab class page.
    await page.locator('[data-lesson-group="today"]').first().getByRole('button', { name: 'Details' }).click();
    const hub = page.locator('[data-assignment-hub]');
    await hub.waitFor();
    await settle(page, 800);
    await hub.getByRole('button', { name: /Working now/i }).first().click();
    await settle(page, 800);
    const working = await hub.locator('section[aria-labelledby="assignment-hub-live"] li').allInnerTexts().catch(() => []);
    const hubText = working.length ? working.map(squash) : [await text(hub)];
    expect(J, hubText.some((row) => GOOGLE_NAME.test(row)), `Assignment Hub: the googleName-only student is listed by name (${hubText.slice(0, 6).join(' | ')})`);
    NAMELESS.forEach((id) => expect(J, hubText.some((row) => row.includes(`${UNAVAILABLE} · ID ${id}`)), `Assignment Hub: ${id} is listed as "${UNAVAILABLE} · ID ${id}"`));
    expect(J, hubText.filter((row) => TWIN_NAME.test(row)).length === 2, `Assignment Hub: both Juniper Samplewoods are listed (${hubText.filter((row) => TWIN_NAME.test(row)).length})`);
    await sweep(J, page, 'Assignment Hub', '[data-assignment-hub]');
    await shot(page, 'N2-hub');
    await hub.getByRole('button', { name: 'Close' }).first().click().catch(() => page.keyboard.press('Escape'));
    await settle(page, 500);

    // Attendance History for the Lab.
    await sidebar(page, 'Attendance History');
    await page.getByRole('combobox', { name: 'Class' }).last().selectOption({ label: LAB });
    await settle(page, 1200);
    await expectNamedRow(J, page, 'Attendance History', main, GOOGLE_ONLY, GOOGLE_NAME);
    for (const id of NAMELESS) await expectNamelessRow(J, page, 'Attendance History', main, id);
    for (const id of TWINS) await expectNamedRow(J, page, 'Attendance History', main, id, TWIN_NAME);
    await sweep(J, page, 'Attendance History');
    await shot(page, 'N2-attendance');

    // Find: first name, last name, full name and id each reach the student.
    await checkFind(J, page, [
      { query: 'Rowan', id: GOOGLE_ONLY, name: GOOGLE_NAME },
      { query: 'Exampleton', id: GOOGLE_ONLY, name: GOOGLE_NAME },
      { query: 'Rowan Exampleton', id: GOOGLE_ONLY, name: GOOGLE_NAME },
      { query: GOOGLE_ONLY, id: GOOGLE_ONLY, name: GOOGLE_NAME },
      { query: NO_NAME, id: NO_NAME, name: new RegExp(UNAVAILABLE) },
      { query: ID_AS_NAME, id: ID_AS_NAME, name: new RegExp(UNAVAILABLE) },
      { query: 'Juniper', id: TWIN_A, name: TWIN_NAME, count: 2 },
      { query: 'Samplewood', id: TWIN_B, name: TWIN_NAME, count: 2 },
      { query: 'Juniper Samplewood', id: TWIN_B, name: TWIN_NAME, count: 2 },
    ]);
    // Choosing the result opens THAT student.
    await openFind(page, GOOGLE_ONLY);
    await page.locator('[role="listbox"]').getByRole('option', { name: new RegExp(`ID ${GOOGLE_ONLY}`) }).first().click();
    await settle(page, 1200);
    const drawer = page.locator('aside[aria-label^="Learning profile for"]').first();
    const drawerLabel = (await drawer.count()) ? await drawer.getAttribute('aria-label') : '';
    expect(J, GOOGLE_NAME.test(drawerLabel || ''), `Find → the learning profile opens for the googleName-only student (${drawerLabel})`);
    await sweep(J, page, 'Learning profile drawer (googleName-only student)');
  },

  async N3(page) {
    const J = 'N3';
    const names = {};
    // Students (full student data).
    await sidebar(page, 'Students');
    const main = 'body';
    names.students = {
      [GOOGLE_ONLY]: await expectNamedRow(J, page, 'Students', main, GOOGLE_ONLY, GOOGLE_NAME),
    };
    for (const id of NAMELESS) await expectNamelessRow(J, page, 'Students', main, id);
    for (const id of TWINS) await expectNamedRow(J, page, 'Students', main, id, TWIN_NAME);
    await sweep(J, page, 'Students');
    await shot(page, 'N3-students');

    // Grades for the Lab.
    await sidebar(page, 'Grades');
    const chooser = page.locator('section[aria-labelledby="gradebook-choose-class"]');
    if (await chooser.count()) await chooser.getByRole('button', { name: /Lab/ }).first().click();
    await settle(page, 2000);
    const gradebook = 'table';
    await expectNamedRow(J, page, 'Grades', gradebook, GOOGLE_ONLY, GOOGLE_NAME);
    for (const id of NAMELESS) {
      const rows = await expectNamelessRow(J, page, 'Grades', gradebook, id);
      if (rows.some((row) => row.split(`ID ${id}`).length > 2)) advise(J, `Grades: a nameless student's row prints "ID ${id}" twice (StudentNameLink's own id line plus the gradebook's). Pass showMissingId={false} to the gradebook row's StudentNameLink (src/App.jsx, the Grades table), as StudentsRoster does`);
    }
    for (const id of TWINS) await expectNamedRow(J, page, 'Grades', gradebook, id, TWIN_NAME);
    await sweep(J, page, 'Grades');
    await shot(page, 'N3-grades');

    // Grade Export: last week's closed review is also given to the Lab, and
    // reopened for the five edge students, so they are listed by name as held back.
    await page.evaluate((ids) => {
      const harness = window.__mmHarnessStore;
      const assignment = harness.get('assignments/a-lastweek');
      harness.update('assignments/a-lastweek', {
        assignedClassIds: [...new Set([...(assignment.assignedClassIds || []), 'c-lab-p3'])],
        reopenedStudentIds: ids,
      });
    }, IDENTITY_EDGE_IDS);
    await settle(page, 600);
    await sidebar(page, 'Grade Export');
    const labGroup = page.locator('.tw-class-group', { hasText: LAB });
    const row = labGroup.locator('.tw-export-row', { hasText: 'Linear Functions — Review' });
    if (expect(J, await row.count() === 1, 'Grade Export: the Lab has last week\'s review')) {
      await row.locator('summary', { hasText: /Held back/ }).click();
      await settle(page, 300);
      const people = (await row.locator('li').allInnerTexts()).map(squash);
      expect(J, people.filter((person) => GOOGLE_NAME.test(person)).length === 1, `Grade Export: the googleName-only student is held back by name (${people.join(' | ')})`);
      NAMELESS.forEach((id) => expect(J, people.some((person) => person.startsWith(`${UNAVAILABLE} · ID ${id}`)), `Grade Export: ${id} is "${UNAVAILABLE} · ID ${id}"`));
      expect(J, people.filter((person) => TWIN_NAME.test(person)).length === 2, `Grade Export: both Juniper Samplewoods are listed (${people.filter((person) => TWIN_NAME.test(person)).length})`);
    }
    await sweep(J, page, 'Grade Export');
    await shot(page, 'N3-grade-export');

    // The full-data screens name the googleName-only student as the roster does.
    const studentsName = names.students[GOOGLE_ONLY][0]?.match(GOOGLE_NAME)?.[0] || '';
    expect(J, nameKey(studentsName) === nameKey('Rowan Exampleton'), `Students and the Live roster agree on the googleName-only student's name (${studentsName})`);
  },

  async N4(page) {
    const J = 'N4';
    const before = await store(page);
    const gradesBefore = Object.fromEntries(Object.entries(before).filter(([key]) => key.startsWith('grades/')));

    // A note for the nameless student, BEFORE it has a name.
    await chooseLab(page);
    await saveTeacherNote(page, NO_NAME, 'Brought a calculator from home (synthetic note).');
    const noteBefore = (await supportEventsFor(page, NO_NAME)).filter((event) => /synthetic note/.test(event.note || event.summary || ''));
    expect(J, noteBefore.length === 1, 'a teacher note is stored before the name is added');

    await sidebar(page, 'Student Access');
    const main = page.locator('body');
    const diagnostic = await text(main.getByRole('note').first()).catch(() => '');
    expect(J, /2 students have no name on file/.test(diagnostic), `Sign-in Access: the missing-name diagnostic counts both nameless students (${diagnostic})`);
    for (const id of NAMELESS) await expectNamelessRow(J, page, 'Sign-in Access', 'body', id);
    await expectNamedRow(J, page, 'Sign-in Access', 'body', GOOGLE_ONLY, GOOGLE_NAME);
    await sweep(J, page, 'Sign-in Access');
    await shot(page, 'N4-access-before');

    const addName = main.getByRole('button', { name: `Add name for ${UNAVAILABLE} · ID ${NO_NAME}` });
    if (!expect(J, await addName.count() === 1, `Sign-in Access: "Add name" is offered for ${NO_NAME}`)) return;
    await addName.click();
    const form = main.getByRole('form', { name: `Add name for ${UNAVAILABLE} · ID ${NO_NAME}` });
    await form.waitFor();
    // An id is not a name: refused before anything is written.
    const callsBefore = (await harnessStats(page)).callables?.setStudentName || 0;
    await form.getByLabel('First name').fill(NO_NAME);
    await form.getByLabel('Last name').fill(ADDED.lastName);
    await form.getByRole('button', { name: 'Save name' }).click();
    await settle(page, 500);
    const refusal = await text(form.getByRole('alert')).catch(() => '');
    expect(J, /not an ID/.test(refusal), `Sign-in Access: an id typed as a first name is refused (${refusal})`);
    expect(J, JSON.stringify((await store(page))[`grades/${NO_NAME}`]) === JSON.stringify(gradesBefore[`grades/${NO_NAME}`]), 'a refused name writes nothing');

    await form.getByLabel('First name').fill(ADDED.firstName);
    await form.getByRole('button', { name: 'Save name' }).click();
    await main.getByRole('status').filter({ hasText: 'Name saved' }).waitFor({ timeout: 10000 });
    await settle(page, 1500);
    const stats = await harnessStats(page);
    expect(J, (stats.callables?.setStudentName || 0) - callsBefore === 1, `setStudentName was called once (${(stats.callables?.setStudentName || 0) - callsBefore})`);
    await expectNamedRow(J, page, 'Sign-in Access (after)', 'body', NO_NAME, ADDED_NAME);
    const after = await text(main.getByRole('note').first()).catch(() => '');
    expect(J, /1 student has no name on file/.test(after), `Sign-in Access: the diagnostic now counts one nameless student (${after})`);
    expect(J, await main.getByRole('button', { name: new RegExp(`^Edit name for ${ADDED.lastName}, ${ADDED.firstName} · ID ${NO_NAME}$`) }).count() === 1, 'Sign-in Access: the row now offers "Edit name"');
    await shot(page, 'N4-access-after');

    // TEST E — the name write touched the three name fields and their
    // provenance on grades/910091, nothing else there, and nothing anywhere else.
    const afterStore = await store(page);
    const record = afterStore[`grades/${NO_NAME}`] || {};
    const previous = gradesBefore[`grades/${NO_NAME}`] || {};
    expect(J, record.firstName === ADDED.firstName && record.lastName === ADDED.lastName && record.displayName === `${ADDED.firstName} ${ADDED.lastName}`, `grades/${NO_NAME} holds the new name (${JSON.stringify({ firstName: record.firstName, lastName: record.lastName, displayName: record.displayName })})`);
    expect(J, record.nameUpdatedBy === TEACHER_EMAIL && record.nameUpdatedAt && record.identityBackfill === undefined, 'the name carries who and when, and no backfill stamp');
    expect(J, JSON.stringify(record.gradesByAssignment) === JSON.stringify(previous.gradesByAssignment), `grades/${NO_NAME} gradesByAssignment is unchanged`);
    const changedFields = [...new Set([...Object.keys(previous), ...Object.keys(record)])]
      .filter((field) => !NAME_WRITE_FIELDS.has(field) && JSON.stringify(previous[field]) !== JSON.stringify(record[field]));
    expect(J, changedFields.length === 0, `only name fields changed on grades/${NO_NAME} (${changedFields.join(', ')})`);
    const otherChanges = Object.keys(gradesBefore).filter((key) => key !== `grades/${NO_NAME}` && JSON.stringify(gradesBefore[key]) !== JSON.stringify(afterStore[key]));
    expect(J, otherChanges.length === 0, `no other grades document changed (${otherChanges.slice(0, 5).join(', ')})`);
    const audit = Object.values(afterStore).filter((value) => value?.action === 'student_name_set' && value?.target === NO_NAME);
    expect(J, audit.length === 1, 'the name change is in the admin audit log');

    // Every surface follows the roster refresh.
    await sidebar(page, 'Home');
    await chooseLab(page);
    const tiles = await liveTiles(page);
    expect(J, tiles.some((tile) => tile.label.startsWith(`${ADDED.firstName} ${ADDED.lastName}:`) && tile.name === `${ADDED.firstName} ${ADDED.lastName}`), `Home Live tile shows the new name (${tiles.map((tile) => tile.label).join(' | ')})`);
    expect(J, !tiles.some((tile) => tile.label.includes(`ID ${NO_NAME}`)), `Home Live: no "${UNAVAILABLE} · ID ${NO_NAME}" tile remains`);
    const options = await pickerOptions(page);
    expect(J, options.includes(`${ADDED.firstName} ${ADDED.lastName}`) && !options.includes(`${UNAVAILABLE} · ID ${NO_NAME}`), 'Student Support: the note picker shows the new name');
    const history = await recentHistory(page);
    expect(J, history.includes(`${ADDED.firstName} ${ADDED.lastName}`) && !history.includes(`ID ${NO_NAME}`), `Student Support history names the earlier note's student by the new name (${history.slice(0, 200)})`);
    const noteAfter = (await supportEventsFor(page, NO_NAME)).filter((event) => /synthetic note/.test(event.note || event.summary || ''));
    expect(J, JSON.stringify(noteAfter) === JSON.stringify(noteBefore), 'the earlier note is not rewritten (its name is resolved by studentId at display time)');
    await sweep(J, page, 'Home (after)');

    await sidebar(page, 'Classes');
    await page.getByRole('button', { name: new RegExp(LAB) }).first().click();
    await settle(page, 1500);
    await expectNamedRow(J, page, 'Classes roster (after)', 'body', NO_NAME, ADDED_NAME);
    await page.locator('[data-lesson-group="today"]').first().getByRole('button', { name: 'Details' }).click();
    const hub = page.locator('[data-assignment-hub]');
    await hub.waitFor();
    await settle(page, 800);
    await hub.getByRole('button', { name: /Working now/i }).first().click();
    await settle(page, 800);
    const hubText = await text(hub);
    expect(J, ADDED_NAME.test(hubText) && !hubText.includes(`ID ${NO_NAME}`), 'Assignment Hub (after) lists the new name');
    await hub.getByRole('button', { name: 'Close' }).first().click().catch(() => page.keyboard.press('Escape'));
    await settle(page, 500);

    await sidebar(page, 'Attendance History');
    await page.getByRole('combobox', { name: 'Class' }).last().selectOption({ label: LAB });
    await settle(page, 1200);
    await expectNamedRow(J, page, 'Attendance History (after)', 'body', NO_NAME, ADDED_NAME);

    await checkFind(J, page, [
      { query: ADDED.firstName, id: NO_NAME, name: ADDED_NAME },
      { query: ADDED.lastName, id: NO_NAME, name: ADDED_NAME },
      { query: `${ADDED.firstName} ${ADDED.lastName}`, id: NO_NAME, name: ADDED_NAME },
      { query: NO_NAME, id: NO_NAME, name: ADDED_NAME },
    ]);

    await sidebar(page, 'Students');
    await expectNamedRow(J, page, 'Students (after)', 'body', NO_NAME, ADDED_NAME);
    await sidebar(page, 'Grades');
    const chooser = page.locator('section[aria-labelledby="gradebook-choose-class"]');
    if (await chooser.count()) await chooser.getByRole('button', { name: /Lab/ }).first().click();
    await settle(page, 2000);
    await expectNamedRow(J, page, 'Grades (after)', 'table', NO_NAME, ADDED_NAME);
    await sweep(J, page, 'Grades (after)');
    await shot(page, 'N4-grades-after');
  },
};

for (const viewport of VIEWPORTS) {
  for (const [name, run] of Object.entries(journeys).filter(([key]) => !ONLY || ONLY.includes(key))) {
    const context = await newSchoolContext(browser, { viewport, acceptDownloads: true });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error.message || error).split('\n')[0]));
    const label = `${name} @ ${viewport.width}x${viewport.height}`;
    const before = findings.length;
    try {
      await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.getByText('IN SESSION NOW').waitFor({ timeout: 60000 });
      await settle(page, 1500);
      await run(page);
      expect(name, pageErrors.length === 0, `no page errors (${pageErrors.slice(0, 2).join(' | ')})`);
    } catch (error) {
      findings.push({ journey: name, detail: `stopped: ${String(error.message || error).split('\n')[0]}` });
      await page.screenshot({ path: path.join(ARTIFACTS, `error-${name}-${viewport.width}.png`) }).catch(() => {});
    }
    findings.slice(before).forEach((finding) => { finding.viewport = `${viewport.width}x${viewport.height}`; });
    if (findings.length === before) passed.push(label);
    console.log(`${findings.length === before ? 'ok  ' : 'FAIL'} ${label}`);
    await context.close();
  }
}
await browser.close();

console.log(`\n${passed.length} journey run(s) passed: ${passed.join(', ') || 'none'}`);
if (advisories.length) {
  console.log(`\n${advisories.length} advisory note(s) (not failures):`);
  advisories.forEach(({ journey, detail }) => console.log(`- [${journey}] ${detail}`));
}
if (findings.length) {
  console.log(`\n${findings.length} finding(s):`);
  findings.forEach(({ journey, viewport, detail }) => console.log(`- [${journey} ${viewport || ''}] ${detail}`));
  process.exit(1);
}
console.log('\nStudent names: no roster id shown as a name, every surface names every student the same way.');
