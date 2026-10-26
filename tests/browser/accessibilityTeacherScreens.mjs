/*
 * THE TEACHER SCREENS OF THE ACCESSIBILITY CERTIFICATION (TT27, VH-39).
 *
 * accessibilityCertification.mjs audits the student screens; this file lists
 * the teacher's. They are the same kind of entry (`id`, `harness`, `open`,
 * `scenes`) and run through the same loop, so axe, the contrast review and the
 * ratchet (scripts/accessibility-baseline.json) cover them with no second
 * driver. Two differences:
 *
 *   schoolClock   The teacher harness builds the bell schedule, the DOL window
 *                 and "yesterday" from the browser's clock, so the screens show
 *                 a different thing at a different time of day. The run opens
 *                 these on the school's clock (teacherWorkflow/schoolClock.mjs,
 *                 a Wednesday at 11:00 in Chicago), as the dark-mode
 *                 certification does, so a count means the same on every run.
 *   keyboard      The screen is also walked by Tab (accessibilityKeyboardReach
 *                 .mjs): its stops and its pointer-only controls are counted
 *                 into the same ratchet.
 *
 * THE SCREENS, each the REAL App.jsx signed in as the synthetic teacher (the
 * in-memory harness; firebase/* faked), reached through the teacher's own
 * navigation:
 *
 *   teacher-home           Home: the day's classes, the class in session, Live
 *                          Class in its Room view, Student Support.
 *   teacher-live-class     Live Class's other two views, Walkthrough and
 *                          Attention (Room is Home's).
 *   teacher-assignments    the Assignments list: where the Pre-Flight review
 *                          starts, and what lies behind it; and the two pop-ups
 *                          on it, the class selector's list and a card's ⋮
 *                          menu, each opened by keyboard.
 *   teacher-assignment-hub one assignment's drawer, opened from the class page,
 *                          and with its progress shown.
 *   teacher-gradebook      Grades, with one assignment's table open.
 *   teacher-preflight      the Pre-Flight review of an imported lesson, step by
 *                          step.
 *   teacher-live-challenge the Live Challenge console: the form that creates a
 *                          game, and a game in its lobby with three players.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEACHER_EMAIL } from './teacherWorkflow/fixture.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');

// The smallest importable lesson in the repository (10 KB). Importing it opens
// the Pre-Flight review in about two seconds; the fixture's own assignments
// cannot ("This saved assignment does not contain enough course/TEKS
// information to reconstruct Assignment V5 safely").
const LESSON_NAME = 'L1_Day1_Interval_Domain_Range.json';
const LESSON_PATH = path.join(repo, 'teacher-import-jsons/algebra2-honors-module1', LESSON_NAME);

// `query` opts into one of the harness's other schools (`&innerScreens=1`: a Test Cycle).
const teacherUrl = (origins, query = '') => `${origins.app}/tests/browser/teacherWorkflow/index.html?reset=1${query}`;
const liveClassHeading = (page) => page.getByRole('heading', { name: 'Live Class', exact: true });

export const openTeacherApp = async (page, origins, query = '') => {
  await page.goto(teacherUrl(origins, query), { timeout: 180_000 });
  await liveClassHeading(page).waitFor({ timeout: 180_000 });
  await page.waitForTimeout(900);
};

// The teacher's sidebar, clicked programmatically (on a phone it is a strip of
// tabs that can sit under a bar, and an open drawer can lie over it).
const goTo = async (page, title) => {
  await page.locator('nav[aria-label="Teacher dashboard navigation"]').locator(`button[title="${title}"]`).evaluate((button) => button.click());
  await page.waitForTimeout(900);
};

const goHome = async (page) => {
  await goTo(page, 'Home');
  await liveClassHeading(page).waitFor({ timeout: 30_000 });
};

const liveClassMode = (name) => async (page) => {
  await goHome(page);
  // Programmatic, like the sidebar: on a phone a sticky bar can sit over a real click.
  await page.getByRole('tab', { name }).evaluate((tab) => tab.click());
  await page.waitForTimeout(800);
};

// Classes -> the class in session -> today's lesson -> Details: the drawer.
const openAssignmentHub = async (page) => {
  await goTo(page, 'Classes');
  await page.getByRole('button', { name: /Algebra II — Period 3/ }).first().evaluate((button) => button.click());
  await page.getByText("Today's lessons").first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(600);
  await page.locator('[data-lesson-group="today"]').first().getByRole('button', { name: 'Details' }).evaluate((button) => button.click());
  await page.locator('[data-assignment-hub]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
};

const openAssignments = async (page) => {
  await goTo(page, 'Assignments');
  await page.locator('summary', { hasText: 'Create and Assign' }).first().waitFor({ timeout: 30_000 });
  await page.getByRole('heading', { name: /^Assignments/ }).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(600);
};

// The two pop-ups of the Assignments screen, opened as a keyboard teacher opens
// them: the button focused and a key pressed (not clicked). Focus has to land on
// an item of the pop-up (platform/interaction/popupMenu.js), or the scene is not
// reached and the run fails; so these scenes show the audit an open pop-up, and
// fail if the keys that open it stop working. A pop-up a scene left open is
// closed the same way a teacher closes one: Escape from its button.
const OPEN_POPUP = '[aria-haspopup][aria-expanded="true"]';
const closePopups = async (page) => {
  const open = page.locator(OPEN_POPUP);
  if (!(await open.count())) return;
  await open.first().focus();
  await page.keyboard.press('Escape');
  await open.first().waitFor({ state: 'detached', timeout: 10_000 });
};
const focusIsOnItem = (page, popupRole, itemRole) => page.waitForFunction(([popup, item]) => {
  const active = document.activeElement;
  return active?.getAttribute('role') === item && Boolean(active.closest(`[role="${popup}"]`));
}, [popupRole, itemRole], { timeout: 10_000 });

const openClassList = async (page) => {
  await closePopups(page);
  await page.locator('button[aria-haspopup="listbox"]').first().focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('listbox', { name: 'Class' }).waitFor({ timeout: 10_000 });
  await focusIsOnItem(page, 'listbox', 'option');
  await page.waitForTimeout(600);
};

const openCardMenu = async (page) => {
  await closePopups(page);
  await page.getByRole('button', { name: /^More actions for/ }).first().focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menu').waitFor({ timeout: 10_000 });
  await focusIsOnItem(page, 'menu', 'menuitem');
  await page.waitForTimeout(600);
};

// Grades are one class at a time: the assignment list stays disabled until a
// class is chosen.
const openGradebookTable = async (page) => {
  await goTo(page, 'Grades');
  await page.getByRole('heading', { name: 'Gradebook and Evidence' }).waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: /Algebra II — Period 3/ }).first().evaluate((button) => button.click());
  await page.locator('select[aria-label="Gradebook assignment"]:not([disabled])').selectOption('a-today');
  await page.locator('table tbody tr').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
};

// Assignments -> Create and Assign -> a lesson file: the Pre-Flight review.
const reviewDialog = (page) => page.locator('[aria-label="Lesson pre-flight review"]');
const openPreflight = async (page) => {
  await goTo(page, 'Assignments');
  const creator = page.locator('summary', { hasText: 'Create and Assign' }).first();
  await creator.waitFor({ timeout: 30_000 });
  if (!(await creator.evaluate((summary) => summary.parentElement.open))) await creator.click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: LESSON_NAME, mimeType: 'application/json', buffer: Buffer.from(readFileSync(LESSON_PATH, 'utf8')),
  });
  await reviewDialog(page).waitFor({ timeout: 120_000 });
  // "Assignment read — MathMaster repaired N authoring details" opens with the
  // review and leaves after a few seconds, over the corner of the page (on a phone,
  // over the header's Close). It is not the review: dismissed, the scene is the same
  // whenever it is audited.
  await page.locator('.mm-toast').first().waitFor({ timeout: 5_000 }).catch(() => {});
  await page.locator('.mm-toast__close').evaluateAll((buttons) => buttons.forEach((button) => button.click()));
  await page.locator('.mm-toast').first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(900);
};
const preflightStep = (label) => async (page) => {
  await reviewDialog(page).getByRole('navigation', { name: 'Review steps' }).getByRole('button', { name: new RegExp(label) }).click();
  await page.waitForTimeout(900);
};

const openLiveChallenge = async (page) => {
  await goTo(page, 'Live Challenge');
  await page.getByRole('heading', { name: 'Create a challenge' }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(900);
};

// A game in its lobby, written into the harness's in-memory store as the server
// writes one: the room, three players who have joined, and the teacher's pointer
// to it (what reopens a game after a refresh, and how the console finds it). The
// console is on its setup form first, so it is mounted and listening when the
// pointer arrives; a room it cannot show leaves the setup form, which this
// waits past and does not find.
const LOBBY_ROOM_ID = 'a11y-teacher-room';
const openLiveChallengeLobby = async (page) => {
  await openLiveChallenge(page);
  await page.evaluate(({ roomId, email }) => {
    const store = window.__mmHarnessStore;
    const now = Date.now();
    store.set(`liveChallengeRooms/${roomId}`, {
      schemaVersion: 2, roomId, title: 'Period 3 Warm-Up Challenge', status: 'lobby', hostEmail: email, teacherEmail: email,
      classId: 'c-alg2-p3', classPeriod: 'Period 3', className: 'Algebra II — Period 3', courseId: 'algebra2', standardCode: 'mixed',
      challengeMode: 'classic', questionStyle: 'choice', roundCount: 3, roundSeconds: 45, timingMode: 'fixed', currentRound: -1,
      currentQuestion: null, roundStartedAt: null, roundEndsAt: null, createdAt: now, lobbyOpenedAt: now,
    });
    for (const [key, alias] of [['p1', 'Swift Otter'], ['p2', 'Quick Fox'], ['p3', 'Calm Heron']]) {
      store.set(`liveChallengeRooms/${roomId}/players/${key}`, {
        playerKey: key, alias, joined: true, score: 0, correctCount: 0, roundsAnswered: 0, streak: 0, answeredRound: -1,
      });
    }
    store.set(`liveChallengeTeacherActive/${email}`, { roomId, status: 'lobby' });
  }, { roomId: LOBBY_ROOM_ID, email: TEACHER_EMAIL });
  await page.locator('[data-mm-host-console="lobby"]').waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Start Challenge' }).waitFor({ timeout: 30_000 });
  await page.getByText('Players in lobby').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);
};

// ----------------------------------------------------------------------------------------------
// A STUDENT'S SCREEN INSIDE THE TEACHER'S PAGE (TT27, third slice).
//
// Three states of the teacher's workspace run one of the student's own components, which drew
// a <main> of its own inside the workspace's: the Test Cycle's student preview (the shared
// RichQuestionRuntime, in the student's secure question player), and a running Demo Experience
// session and a running Path Simulator session (PathSessionPlayer). They are not scenes of the
// audit: the landmarks driver (accessibilityTeacherLandmarks.mjs) opens them with these.
// ----------------------------------------------------------------------------------------------

// The harness's `&innerScreens=1` school has a Test Cycle, which Secure Exams lists.
export const openTeacherAppWithTestCycle = (page, origins) => openTeacherApp(page, origins, '&innerScreens=1');

const testCyclePreview = (page) => page.getByRole('dialog', { name: /Student preview of/ });

// Secure Exams -> "Preview as student" on the Test Cycle.
export const openTestCyclePreview = async (page) => {
  await goTo(page, 'Secure Exams');
  await page.getByRole('button', { name: 'Preview as student' }).first().evaluate((button) => button.click());
  await testCyclePreview(page).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
};

// An item of the preview as a student meets it. `stage` is 'test' (the secure Test) or
// 'corrections'; the preview offers two items (testCyclePreviewFixture.js): the first is a field
// item (a typed answer), the second a tool item (the interval number line). Each stage opens from
// its card, so a stage is entered once and its items read by `ordinal`.
export const enterTestCycleStage = (stage) => async (page) => {
  const preview = testCyclePreview(page);
  const card = preview.locator('[data-preview-device] button').first();
  if (stage === 'corrections') {
    await preview.getByRole('button', { name: 'Corrections', exact: true }).click();
    await card.click();
    await preview.getByRole('button', { name: 'Try correction items as a student' }).click();
  } else {
    await preview.getByRole('button', { name: 'Test unlocked', exact: true }).click();
    await card.click();
  }
  await preview.getByText('Item 1 of 2').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
};
export const showTestCycleItem = (ordinal) => async (page) => {
  const preview = testCyclePreview(page);
  await preview.getByRole('button', { name: ordinal === 1 ? 'Previous item' : 'Next item' }).click();
  await preview.getByText(`Item ${ordinal} of 2`).waitFor({ timeout: 30_000 });
  // The tool item's code loads on demand, and the field item's form is there at once.
  if (ordinal === 2) await preview.locator('[data-rich-question-runtime]').waitFor({ timeout: 60_000 });
  else await preview.locator('form').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);
};

// Demo Experience -> Student Paths -> a student's Path -> "Start live path". The demo's questions
// are typed answers; `tool` gives the first student's first question the interval number line
// instead (a Path question that carries a tool), which PathSessionPlayer draws in its other wrapper.
const seedDemoWithToolQuestion = async (page) => {
  const { createDemoSeed, DEMO_STORAGE_KEY } = await import('../../src/demo/demoExperienceData.js');
  const { PATH_TOOL_QUESTIONS } = await import('../platform/fixtures/pathToolQuestions.mjs');
  const seed = createDemoSeed();
  const authored = PATH_TOOL_QUESTIONS.intervalNumberLine;
  const [first, ...rest] = seed.students[0].mathPath.questions;
  seed.students[0].mathPath.questions = [
    { ...first, prompt: authored.prompt, canonicalQuestion: { id: first.questionInstanceId, questionId: first.questionInstanceId, ...authored } },
    ...rest,
  ];
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [DEMO_STORAGE_KEY, JSON.stringify(seed)]);
};
export const openDemoSession = ({ tool = false } = {}) => async (page) => {
  // The demo reads its state from the device when it opens.
  if (tool) await seedDemoWithToolQuestion(page);
  await goTo(page, 'Demo Experience');
  await page.getByRole('button', { name: 'Student Paths' }).click();
  await page.getByRole('button', { name: 'Open Path' }).first().click();
  await page.getByRole('button', { name: /Start live path|Continue live path/ }).first().click();
  await page.getByText(/Question 1 of 5/).waitFor({ timeout: 30_000 });
  if (tool) await page.locator('[data-question-id], .mathmaster-question-engine').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1200);
};

// The Path Simulator reads the secure Path bank from Firestore, which the harness's school does not
// hold: the course's seed (the documents a deployed bank starts from) goes into the in-memory store.
export const loadPathBank = async (page) => {
  const seed = JSON.parse(readFileSync(path.join(repo, 'functions/seeds/pathQuestionBank/algebra1_pathQuestionBank_seed.json'), 'utf8'));
  const documents = (seed.documents || []).filter((document) => document.active !== false);
  await page.evaluate((records) => { for (const record of records) window.__mmHarnessStore.set(`pathQuestionBank/${record.id}`, record); }, documents);
};

// Path Simulator -> a fresh simulated student -> My Math Path -> the first weekly session.
export const openSimulatorSession = async (page) => {
  await loadPathBank(page);
  await goTo(page, 'Path Simulator');
  await page.getByRole('button', { name: 'Start as fresh student' }).click();
  await page.getByRole('button', { name: 'My Math Path' }).first().click();
  // Programmatic, like the sidebar: the page is busy drawing the week while it is pressed.
  await page.getByRole('button', { name: 'Start session 1 of 4' }).evaluate((button) => button.click());
  await page.getByText(/Question 1 of \d+/).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1200);
};

const teacherScreen = (id, scenes, extra = {}) => ({
  id, harness: 'app', schoolClock: true, keyboard: true, open: openTeacherApp, scenes, ...extra,
});

export const TEACHER_SCREENS = [
  teacherScreen('teacher-home', [{ id: null, run: goHome }]),
  teacherScreen('teacher-live-class', [
    { id: 'walkthrough', run: liveClassMode(/^Walkthrough/) },
    { id: 'attention', run: liveClassMode(/^Attention/) },
  ]),
  teacherScreen('teacher-assignments', [
    { id: null, run: openAssignments },
    // A pop-up is audited as itself, as a modal screen audits its dialog: axe and the contrast
    // review read the page behind it as covered, undecided text. And it is not walked by Tab: Tab
    // closes a pop-up, so the walk would read the page behind one that a keyboard teacher cannot
    // be on (its stops are "under" it). The page is audited and walked above; the keys of the
    // pop-ups are driven by accessibilityTeacherMenus.mjs.
    { id: 'class-list', run: openClassList, include: '[role="listbox"][aria-label="Class"]', keyboard: false },
    { id: 'card-menu', run: openCardMenu, include: '[data-assignment-menu]', keyboard: false },
  ]),
  // A modal drawer: the page behind its scrim is not what a person is reading,
  // so the audit is of the drawer (the page is teacher-assignments, above).
  teacherScreen('teacher-assignment-hub', [
    { id: 'drawer', run: openAssignmentHub },
    { id: 'progress', run: async (page) => {
      await page.locator('[data-assignment-hub]').getByRole('button', { name: /Show progress for/ }).click();
      await page.locator('[data-assignment-hub] section[aria-labelledby="assignment-hub-progress"]').getByText(/IN PROGRESS/i).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(600);
    } },
  ], { include: '[data-assignment-hub]' }),
  teacherScreen('teacher-gradebook', [
    { id: 'table', run: openGradebookTable },
  ]),
  teacherScreen('teacher-preflight', [
    { id: 'details', run: openPreflight },
    { id: 'delivery', run: preflightStep('Delivery') },
    { id: 'check', run: preflightStep('Check') },
  ], { include: '[aria-label="Lesson pre-flight review"]' }),
  teacherScreen('teacher-live-challenge', [
    { id: 'setup', run: openLiveChallenge },
    { id: 'lobby', run: openLiveChallengeLobby },
  ]),
];
