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
 *
 * THE THIRD SLICE (TT27) added every other destination of the navigation, each opened from the
 * sidebar and read once its heading is on screen (tests/platform/accessibilityCertificationContract
 * .test.mjs reads the navigation and fails for a destination no scene opens):
 *
 *   teacher-classes        the class list, and one class's page.
 *   teacher-students       the roster, and a student's drawer (a modal: audited as the drawer).
 *   teacher-library, -weekly-path (the harness's `weeklyPath=ok` school, where the callable
 *   answers), -action-center, -grade-export, -secure-exams (the `innerScreens=1` school, which
 *   has a Test Cycle to list), -pacing, -attendance, -parent-contacts, -analytics, -math-tools,
 *   -demo, -schedule (Class & Bell Schedule), -classroom (Google Classroom), -access (Student
 *   Access): the screen as a teacher meets it. Google Classroom (a teacher who has not connected
 *   it) and three of the administrator's sections (Accounts & sign-in, Path content coverage,
 *   Pre-production reset) read callables the harness answers from teacherWorkflow/
 *   fakeAdminScreens.js; without them each drew the harness's "no fake for the callable" banner
 *   in place of what it holds, and a scene of that audits an error. -math-tools closes the
 *   full-screen Work View the Lab opens on a wide screen (a modal over the page, the student's own),
 *   and leaves the text of its coordinate plane out of axe and the contrast review: see its scene.
 *   teacher-teks           TEKS & Mastery: the student matrix and its five other views.
 *   teacher-simulator      the Path Simulator: its start screen, Weekly Path mode and Question
 *                          bench. Not a running session, which is a student's screen in the walk. axe
 *                          finds nothing in it; Tab finds, at 1366x768, the Language tools stopping
 *                          under the Path's own sticky "Check my answer" (the focus reveal, platform/
 *                          layout/actionBarFocusReveal.js, knows only the QuestionEngine's action bar),
 *                          at both sizes a MathLive field whose name the walk cannot read, and on the
 *                          phone a loop at that field. They belong to the student's screen, which a
 *                          teacher's page only hosts, and a fix changes what a student's page does,
 *                          so it needs a product decision first (the landmarks driver opens the
 *                          state, and openSimulatorSession is kept for it).
 *   teacher-find           the Find palette, empty and with results (a modal: audited as the dialog).
 *   teacher-admin          the administrator's workspace (the harness's `rootAdmin=1` teacher), each
 *                          of its five sections.
 *
 * THE FIFTH SLICE (TT27) added the states of those screens that no scene had opened, each reached the way a
 * teacher reaches it: see THE FIFTH SLICE below.
 *
 * teacher-live-challenge/line-final  a Graph the Line game's report on the console, after the classic game's: its
 *                        blocks are headed tables, as the rush report's are (teacher features walk, item 11).
 *
 * teacher-classroom/connected  Google Classroom once it is connected: the courses the account teaches, which the
 *                        harness's stand-in for listGoogleCourses answers (teacherWorkflow/fakeAdminScreens.js).
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

// Classes -> the class in session: its page.
const openClassPage = async (page) => {
  await goTo(page, 'Classes');
  await page.getByRole('button', { name: /Algebra II — Period 3/ }).first().evaluate((button) => button.click());
  await page.getByText("Today's lessons").first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(600);
};

// ...today's lesson -> Details: the drawer.
const openAssignmentHub = async (page) => {
  await openClassPage(page);
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
  // The mode a visit opens in, whatever the page was left in.
  await page.getByRole('button', { name: 'Student experience', exact: true }).evaluate((button) => button.click());
  await page.getByRole('button', { name: 'Start as fresh student' }).click();
  await page.getByRole('button', { name: 'My Math Path' }).first().click();
  // Programmatic, like the sidebar: the page is busy drawing the week while it is pressed.
  await page.getByRole('button', { name: 'Start session 1 of 4' }).evaluate((button) => button.click());
  await page.getByText(/Question 1 of \d+/).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1200);
};

// ----------------------------------------------------------------------------------------------
// THE OTHER DESTINATIONS (TT27, third slice): each opened from the sidebar, and read once its own
// heading is on screen. Their first scene is the screen as a teacher meets it; the states some of
// them have (a class's page, one student, one student's drawer) are scenes of their own.
// ----------------------------------------------------------------------------------------------
const openDestination = (title, heading) => async (page) => {
  await goTo(page, title);
  await page.getByRole('heading', { name: heading }).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
};

// The Math Tools Lab, on a wide screen, opens its first tool in the full-screen Work View: a modal dialog over the
// page, the student's own, which the student scenes audit (assignment-tools/*). A teacher closes it to reach the
// tool list, and this scene audits the page under it. On a phone the Work View is not open, and nothing is closed.
const openMathToolsLab = async (page) => {
  await openDestination('Math Tools Lab', /^Math Tools Lab$/)(page);
  const close = page.getByRole('button', { name: /Close full screen/ });
  if (await close.count()) {
    await close.first().evaluate((button) => button.click());
    await page.waitForTimeout(900);
  }
};

// The administrator's workspace is a view of the same page (the header's "Administration" button), with
// five sections in a tab list. Each is read once its tab is the selected one and the section has drawn.
const ADMIN_SECTIONS = [
  ['classes', 'Classes & rosters'],
  ['accounts', 'Accounts & sign-in'],
  ['coverage', 'Path content coverage'],
  ['ai', 'Assignment AI health'],
  ['reset', 'Pre-production reset'],
];
const openAdministration = (label) => async (page) => {
  const heading = page.getByRole('heading', { name: 'MathMaster Administration' });
  if (!(await heading.count())) {
    await page.getByRole('button', { name: 'Administration', exact: true }).first().evaluate((button) => button.click());
    await heading.waitFor({ timeout: 60_000 });
  }
  await page.getByRole('tab', { name: label, exact: true }).evaluate((tab) => tab.click());
  await page.getByRole('tab', { name: label, exact: true, selected: true }).waitFor({ timeout: 10_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1500);
};

// A student's drawer, opened as a teacher opens it: the student's name on the Students screen.
const openStudentDrawer = async (page) => {
  await goTo(page, 'Students');
  await page.getByRole('heading', { name: /^Students$/ }).first().waitFor({ timeout: 30_000 });
  await page.locator('table tbody tr').first().getByRole('button').first().evaluate((button) => button.click());
  await page.locator('[data-student-profile-drawer]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1500);
};

// The Find palette (Find…, which Ctrl+K also opens), from Home.
const FIND_DIALOG = '[aria-label="Find a student, class, assignment or standard"]';
const openFindPalette = async (page) => {
  await goHome(page);
  await page.getByRole('button', { name: /Find/ }).first().evaluate((button) => button.click());
  await page.locator(FIND_DIALOG).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(900);
};

// ...and with something typed, so that it lists what it found.
const findWithResults = async (page) => {
  await page.locator(FIND_DIALOG).getByRole('searchbox', { name: 'Search' }).fill('Algebra');
  await page.locator(`${FIND_DIALOG} [role="option"]`).first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(900);
};

// One of the TEKS & Mastery screen's six views, from its row of buttons.
const openTeksView = (label) => async (page) => {
  await openDestination('TEKS & Mastery', /^Texas Math TEKS/)(page);
  await page.getByRole('button', { name: label, exact: true }).evaluate((button) => button.click());
  await page.waitForTimeout(1200);
};

// One of the Path Simulator's three modes, from its row of buttons (the screen's first scene has opened it).
const openSimulatorMode = (label) => async (page) => {
  await page.getByRole('group', { name: 'Simulator mode' }).getByRole('button', { name: label, exact: true }).evaluate((button) => button.click());
  await page.waitForTimeout(1500);
};

// ----------------------------------------------------------------------------------------------
// THE FIFTH SLICE (TT27): the states of these screens that no scene opened, which the VPAT's Notes
// row listed as not evaluated. Each is reached the way a teacher reaches it, from the screen's own
// first scene, and audited like the 48.
// ----------------------------------------------------------------------------------------------

// The workspace's main landmark holds the screen, and not the navigation (whose buttons share names
// with some of a screen's own, "Assignments" among them).
const workspaceMain = (page) => page.getByRole('main');

// A student's detail page: Students -> "Open" on a row (the student's name opens the drawer, a scene of
// teacher-students). The page has seven views, chosen from a tab list above them; six are scenes. The student is
// the harness's first in Period 3, the class in session, who has work on four of its lessons.
//
// Left out: My Math Path, which shows the student's own My Math Path read-only. Its Mastery Overview's wheel draws
// each skill as a segment 10 to 22 px across (16 with no room around them at 1366×768, 32 on a phone, WCAG 2.5.8),
// and at 320 px a "0%" in it is cut by its box. Both are the student's own screen: whether the skills listed under the
// wheel count as the equivalent control 2.5.8 allows, or the wheel changes, is a decision for its owner.
const DETAIL_STUDENT_ROW = /ID 910001(?!\d)/;
const STUDENT_DETAIL_VIEWS = [
  ['overview', 'Overview'],
  ['profile', 'Learning Profile'],
  ['progress', 'Progress'],
  ['assignments', 'Assignments'],
  ['supports', 'Supports'],
  ['account', 'Account'],
];
const allStudentsButton = (page) => workspaceMain(page).getByRole('button', { name: '← All students' });
export const openStudentDetailView = (label) => async (page) => {
  if (!(await allStudentsButton(page).count())) {
    await openDestination('Students', /^Students$/)(page);
    await page.locator('table tbody tr').filter({ hasText: DETAIL_STUDENT_ROW }).getByRole('button', { name: 'Open', exact: true }).evaluate((button) => button.click());
    await allStudentsButton(page).waitFor({ timeout: 30_000 });
  }
  await workspaceMain(page).getByRole('tab', { name: label, exact: true }).evaluate((tab) => tab.click());
  await workspaceMain(page).getByRole('tab', { name: label, exact: true, selected: true }).waitFor({ timeout: 10_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1500);
};

// Assignments -> Create and Assign, opened: the assignment creator's form (steps 1 to 3) and the paste
// and upload of step 4. Closed, as the screen opens once a teacher has assignments, it is a summary line.
const openCreateAndAssign = async (page) => {
  await closePopups(page);
  const creator = page.locator('summary', { hasText: 'Create and Assign' }).first();
  if (!(await creator.evaluate((summary) => summary.parentElement.open))) await creator.evaluate((summary) => summary.click());
  await page.getByRole('heading', { name: '1. Lesson and purpose' }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
};

// Grade Export after its first screen. The harness's school has two lessons ready to export in Period 1,
// one exported and changed since in Period 3, a student with no district ID and a roster of them.
const GRADE_EXPORT_REVIEW = '[aria-labelledby="grade-export-review-title"]';
// A row's Export: the review that comes before the download, a modal (audited as the dialog).
const openGradeExportReview = async (page) => {
  await workspaceMain(page).locator('.tw-export-row__actions').getByRole('button', { name: 'Export', exact: true }).first().click();
  await page.locator(GRADE_EXPORT_REVIEW).getByRole('button', { name: 'Download ZIP' }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
};
// Back on the page, a class's "Select all": the bar that says what is selected stays at the foot of the screen.
const selectGradeExports = async (page) => {
  const review = page.locator(GRADE_EXPORT_REVIEW);
  if (await review.count()) {
    await review.getByRole('button', { name: 'Cancel', exact: true }).click();
    await review.waitFor({ state: 'detached', timeout: 10_000 });
  }
  await workspaceMain(page).getByRole('button', { name: /^Select all \d+ exportable$/ }).last().click();
  await page.getByRole('region', { name: 'Selected exports' }).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(900);
};
// The district IDs: the student who has none (the field that adds one), and the roster's, one of them open
// for correction.
const openDistrictIds = async (page) => {
  const bar = page.getByRole('region', { name: 'Selected exports' });
  if (await bar.count()) await bar.getByRole('button', { name: 'Clear', exact: true }).click();
  for (const summary of await workspaceMain(page).locator('details.tw-disclosure > summary').all()) {
    if (!(await summary.evaluate((node) => node.parentElement.open))) await summary.evaluate((node) => node.click());
  }
  await workspaceMain(page).locator('[data-district-id-row] button[aria-expanded]').first().click();
  await workspaceMain(page).locator('[data-district-id-row] button[aria-expanded="true"]').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(900);
};

// Secure Exams after its first screen (the `innerScreens=1` school): a practice test created for a
// student, which the live proctor monitor then lists with its actions; a Test Cycle's "Archive or delete"
// with the typed confirmation of Delete permanently open; and "Preview as student" (a modal: audited as
// the dialog, its student screen inside it).
const createPracticeTestSession = async (page) => {
  const main = workspaceMain(page);
  const student = main.locator('label', { hasText: /^Student/ }).locator('select').first();
  const first = await student.locator('option').evaluateAll((options) => options.map((option) => option.value).find(Boolean));
  await student.selectOption(first);
  await main.getByRole('button', { name: 'Create session' }).click();
  await main.getByRole('status').filter({ hasText: 'Secure session created' }).waitFor({ timeout: 30_000 });
  await main.getByRole('region', { name: 'Live proctor monitor sessions' }).getByRole('button', { name: 'Pause' }).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
};
const openTestCycleDelete = async (page) => {
  const main = workspaceMain(page);
  await main.getByRole('button', { name: 'Archive or delete' }).first().click();
  await main.getByRole('button', { name: /^Delete permanently/ }).first().click();
  await main.getByRole('alertdialog').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(900);
};
const TEST_CYCLE_PREVIEW = '[role="dialog"][aria-label^="Student preview of"]';
const openTestCyclePreviewScene = async (page) => {
  const confirm = workspaceMain(page).getByRole('alertdialog');
  if (await confirm.count()) await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await openTestCyclePreview(page);
};

// The Live Challenge console past its lobby, written into the store as the server writes it, on the
// lobby scene's game: round 1 open (two seconds in, ten minutes left, so the round and never "Time!"),
// with two of the three players answered; the projector during that round; the round's results (the
// teacher's whole table, hostRounds/0, and the standings it left); and the game finished, with the report
// the server writes after it (built here by the server's own buildChallengeReport).
const LIVE_PLAYERS = [
  { playerKey: 'p1', alias: 'Swift Otter', studentId: '910001', score: 940, correctCount: 1, roundsAnswered: 1, answeredRound: 0 },
  { playerKey: 'p2', alias: 'Quick Fox', studentId: '910002', score: 610, correctCount: 1, roundsAnswered: 1, answeredRound: 0 },
  { playerKey: 'p3', alias: 'Calm Heron', studentId: '910003', score: 0, correctCount: 0, roundsAnswered: 0, answeredRound: -1 },
];
const ROUND_QUESTION = {
  questionInstanceId: `challenge_${LOBBY_ROOM_ID}_r1`, challengeRound: 0, teksCode: 'A.5A',
  prompt: 'Solve $2x + 5 = 17$. What is the value of $x$?',
};
const hostConsoleStage = (page, stage) => page.locator(`[data-mm-host-console="${stage}"]`).waitFor({ timeout: 30_000 });
const openLiveChallengeRound = async (page) => {
  await page.evaluate(({ roomId, question, players }) => {
    const store = window.__mmHarnessStore;
    const startsAt = Date.now() - 2000;
    for (const player of players) store.update(`liveChallengeRooms/${roomId}/players/${player.playerKey}`, { ...player, joined: true, streak: player.correctCount });
    store.update(`liveChallengeRooms/${roomId}`, {
      status: 'running', currentRound: 0, currentQuestion: question, roundVersion: 1, roundToken: 'a11y-teacher-round-1', roundState: 'open',
      phase: 'answering', startsAt, endsAt: startsAt + 600_000, roundStartedAt: startsAt, roundEndsAt: startsAt + 600_000,
    });
  }, { roomId: LOBBY_ROOM_ID, question: ROUND_QUESTION, players: LIVE_PLAYERS });
  await hostConsoleStage(page, 'roundActive');
  await page.getByText('2 of 3 joined students answered').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);
};
// Projector View, which the class sees: a full-screen layer over the console, with the host's controls in
// a strip at its foot.
const PROJECTOR = '.mm-arena-shell';
const openLiveChallengeProjector = async (page) => {
  await workspaceMain(page).getByRole('button', { name: 'Projector View' }).click();
  await page.locator(`${PROJECTOR}[data-mm-arena-stage="roundActive"]`).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);
};
// The projector is a modal layer: a keyboard teacher leaves it with Escape, and focus comes back to the console's
// Projector View, the control that opened it. The results scene starts by leaving it so, and is not reached if
// either stops working.
const exitLiveChallengeProjector = async (page) => {
  const projector = page.locator(PROJECTOR);
  if (!(await projector.count())) return;
  await projector.getByRole('button', { name: 'Exit Projector View' }).focus();
  await page.keyboard.press('Escape');
  await projector.waitFor({ state: 'detached', timeout: 10_000 });
  await page.waitForFunction(() => document.activeElement?.textContent === 'Projector View', null, { timeout: 10_000 });
};
const openLiveChallengeResults = async (page) => {
  await exitLiveChallengeProjector(page);
  const { matchStandingsAfterRound } = await import('../../functions/shared/liveChallengeResults.mjs');
  const standingsAfterRound = matchStandingsAfterRound({ players: LIVE_PLAYERS.map((player) => ({ ...player, joined: true })) });
  // The teacher's copy of the round (functions/shared/liveChallengeResults.mjs publicRoundSummary): every player,
  // by place, with the points the round gave.
  const summary = {
    schemaVersion: 1, roundIndex: 0, roundVersion: 1, isSecondChance: false, modeId: 'classic', scoringStrategyId: 'accuracyFirst',
    closedAtMs: Date.now(), participantCount: 3, completedCount: 2, fieldSize: 2, standingsAfterRound,
    standings: LIVE_PLAYERS.map((player, index) => ({
      playerKey: player.playerKey, alias: player.alias, rank: player.roundsAnswered ? index + 1 : null, position: index, tied: false,
      participated: player.roundsAnswered > 0, finished: player.roundsAnswered > 0, roundPoints: player.score, matchPointsAwarded: 0,
    })),
  };
  await page.evaluate(({ roomId, roundSummary }) => {
    const store = window.__mmHarnessStore;
    store.set(`liveChallengeRooms/${roomId}/hostRounds/0`, roundSummary);
    store.update(`liveChallengeRooms/${roomId}`, { roundState: 'closed', phase: 'results', roundClosedAt: Date.now() });
  }, { roomId: LOBBY_ROOM_ID, roundSummary: summary });
  await hostConsoleStage(page, 'roundResults');
  await page.waitForTimeout(1200);
};
const openLiveChallengeFinal = async (page) => {
  const { buildChallengeReport } = await import('../../functions/shared/liveChallengeReport.mjs');
  const room = { title: 'Period 3 Warm-Up Challenge', className: 'Algebra II — Period 3', courseId: 'algebra2', standardCode: 'mixed', roundSeconds: 45 };
  const report = {
    ...buildChallengeReport({
      room, scheduledRoundCount: 3, playedRoundCount: 1, roundMisses: { 0: 0 }, roundStandards: { 0: 'A.5A' }, answeredCounts: { 0: 2 },
      players: [...LIVE_PLAYERS.map((player) => ({ ...player, joined: player.roundsAnswered > 0 })), { playerKey: 'p4', alias: 'Bright Lark', studentId: '910004', joined: false }],
      finishedAt: Date.now(),
    }),
    roomId: LOBBY_ROOM_ID,
  };
  await page.evaluate(({ roomId, email, challengeReport }) => {
    const store = window.__mmHarnessStore;
    store.set(`liveChallengeReports/${roomId}`, challengeReport);
    store.update(`liveChallengeRooms/${roomId}`, { status: 'finished', phase: 'finished', finishedAt: Date.now() });
    // A finished game has no active pointer (the console keeps the room it hosted).
    store.remove(`liveChallengeTeacherActive/${email}`);
  }, { roomId: LOBBY_ROOM_ID, email: TEACHER_EMAIL, challengeReport: report });
  await hostConsoleStage(page, 'completed');
  await page.getByRole('heading', { name: 'After the game' }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);
};

// Graph the Line's report, whose blocks are headed tables (teacher features walk, item 11). After the classic game the
// teacher chooses New Challenge, and the class plays a Graph the Line Sprint, written into the store as the server writes
// one: the room in its lobby with the teacher's pointer to it (how the console finds a game), then the game over, the
// pointer gone and the report written (writeLiveChallengeReportFromResult: the classic report's totals and, under
// `lineGraph`, the mode's own breakdown, built here by the server's buildChallengeReport and buildLineGraphReport). By
// form, by what students do, the class's mistakes, and "By student", opened as a teacher opens it, so its list is audited.
const LINE_ROOM_ID = 'a11y-teacher-line-room';
const LINE_ROOM = { title: 'Period 3 Line Sprint', className: 'Algebra II — Period 3', courseId: 'algebra2', standardCode: 'mixed', roundSeconds: 240 };
const lineBucket = (questions, completed, attempts, hits) => ({ questions, completed, attempts, hits });
// Each player's own line work, as the server keeps it (the standing's questionSetSummary).
const LINE_PLAYERS = [
  { playerKey: 'p1', alias: 'Swift Otter', studentId: '910001', summary: {
    questions: 5, completed: 4, skipped: 0, attempts: 6, hits: 4,
    byTag: { form: { slopeIntercept: lineBucket(3, 3, 3, 3), standard: lineBucket(2, 1, 3, 1) }, itemType: { graph: lineBucket(3, 3, 4, 3), name: lineBucket(2, 1, 2, 1) } },
    byTier: { standard: lineBucket(5, 4, 6, 4) }, mistakes: { slopeSign: 1, offTrack: 1 },
  } },
  { playerKey: 'p2', alias: 'Quick Fox', studentId: '910002', summary: {
    questions: 5, completed: 3, skipped: 1, attempts: 7, hits: 3, extraTimeCompleted: 1,
    byTag: { form: { slopeIntercept: lineBucket(3, 2, 4, 2), standard: lineBucket(2, 1, 3, 1) }, itemType: { graph: lineBucket(3, 2, 4, 2), name: lineBucket(2, 1, 3, 1) } },
    byTier: { standard: lineBucket(5, 3, 7, 3) }, mistakes: { interceptSign: 2, slopeSign: 1, offTrack: 1 },
  } },
  { playerKey: 'p3', alias: 'Calm Heron', studentId: '910003', summary: {
    questions: 5, completed: 2, skipped: 2, attempts: 5, hits: 2,
    byTag: { form: { slopeIntercept: lineBucket(2, 1, 2, 1), standard: lineBucket(3, 1, 3, 1) }, itemType: { graph: lineBucket(5, 2, 5, 2) } },
    byTier: { standard: lineBucket(5, 2, 5, 2) }, mistakes: { rightSlope: 2, horizontalVertical: 1 },
  } },
];
const openLineGraphReport = async (page) => {
  const { normalizeLineGraphConfig } = await import('../../functions/shared/lineGraphConfig.mjs');
  const { buildLineGraphReport } = await import('../../functions/shared/lineGraphAttempts.mjs');
  const { buildChallengeReport } = await import('../../functions/shared/liveChallengeReport.mjs');
  // Programmatic, like the sidebar: on a phone a sticky bar can sit over a real click.
  await workspaceMain(page).getByRole('button', { name: 'New Challenge', exact: true }).evaluate((button) => button.click());
  await page.getByRole('heading', { name: 'Create a challenge' }).waitFor({ timeout: 30_000 });
  // A Sprint of five lines a student, as each player's work below is.
  const config = normalizeLineGraphConfig({ itemTypes: ['graph', 'name'], forms: ['slopeIntercept', 'standard'], difficulty: 'standard', sprintLength: 5 }, { format: 'sprint' });
  await page.evaluate(({ roomId, email, room, lineGraphConfig, players }) => {
    const store = window.__mmHarnessStore;
    const now = Date.now();
    store.set(`liveChallengeRooms/${roomId}`, {
      ...room, schemaVersion: 2, roomId, status: 'lobby', hostEmail: email, teacherEmail: email, classId: 'c-alg2-p3', classPeriod: 'Period 3',
      challengeMode: 'lineGraphSprint', scoringStrategyId: 'correctCount', questionStyle: 'any', roundCount: 1, timingMode: 'fixed', currentRound: -1,
      currentQuestion: null, roundStartedAt: null, roundEndsAt: null, createdAt: now, lobbyOpenedAt: now, lineGraph: { config: lineGraphConfig, generatorVersion: 1 },
    });
    for (const { playerKey, alias } of players) {
      store.set(`liveChallengeRooms/${roomId}/players/${playerKey}`, { playerKey, alias, joined: true, score: 0, correctCount: 0, roundsAnswered: 0, streak: 0, answeredRound: -1 });
    }
    store.set(`liveChallengeTeacherActive/${email}`, { roomId, status: 'lobby' });
  }, { roomId: LINE_ROOM_ID, email: TEACHER_EMAIL, room: LINE_ROOM, lineGraphConfig: config, players: LINE_PLAYERS });
  await hostConsoleStage(page, 'lobby');
  // A Correct Count game: a player's score is the lines they got right.
  const final = LINE_PLAYERS.map(({ playerKey, alias, studentId, summary }) => ({ playerKey, alias, studentId, joined: true, score: summary.completed, correctCount: summary.completed, roundsAnswered: 1, answeredRound: 0 }));
  const lineGraph = buildLineGraphReport({ standings: final.map((player, index) => ({ ...player, rank: index + 1, questionSetSummary: LINE_PLAYERS[index].summary })) });
  const report = {
    ...buildChallengeReport({
      room: LINE_ROOM, scheduledRoundCount: 1, playedRoundCount: 1, finishedAt: Date.now(),
      players: [...final, { playerKey: 'p4', alias: 'Bright Lark', studentId: '910004', joined: false }],
    }),
    lineGraph, classAccuracyPercent: lineGraph.accuracyPercent, rounds: [], standards: [], weakestStandard: null, roomId: LINE_ROOM_ID,
  };
  await page.evaluate(({ roomId, email, players, challengeReport }) => {
    const store = window.__mmHarnessStore;
    for (const player of players) store.update(`liveChallengeRooms/${roomId}/players/${player.playerKey}`, player);
    store.set(`liveChallengeReports/${roomId}`, challengeReport);
    store.update(`liveChallengeRooms/${roomId}`, { status: 'finished', phase: 'finished', finishedAt: Date.now() });
    store.remove(`liveChallengeTeacherActive/${email}`);
  }, { roomId: LINE_ROOM_ID, email: TEACHER_EMAIL, players: final, challengeReport: report });
  await hostConsoleStage(page, 'completed');
  await page.getByRole('heading', { name: 'By form, hardest first' }).waitFor({ timeout: 30_000 });
  const breakdown = workspaceMain(page).locator('[data-mm-line-report="summary"]');
  await breakdown.locator('summary', { hasText: 'By student (game names)' }).evaluate((summary) => summary.click());
  await breakdown.locator('details[open] li').first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(1200);
};

// Google Classroom once it is connected (the November build's section 6). The harness's teacher has not connected it,
// which the screen's first scene audits; here the harness is told the account is connected (teacherWorkflow/
// fakeAdminScreens.js, GOOGLE CLASSROOM, CONNECTED: three active courses, the first mapped to Algebra II — Period 3), and
// the screen is opened again, as a teacher comes back to it once connected. It loads the courses itself
// (listGoogleCourses) and takes the first for the roster, and is read once the courses' sections have drawn.
const openClassroomConnected = async (page) => {
  await page.evaluate(() => { window.__mmHarness.classroomConnected = true; });
  await goHome(page);
  await openDestination('Google Classroom', /^Google Classroom Manager$/)(page);
  await workspaceMain(page).getByText('2. Map Google Classroom courses to MathMaster classes').waitFor({ timeout: 30_000 });
  await workspaceMain(page).getByText('ID-only students: paste an identity list (optional)').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
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
    // The fifth slice: Create and Assign opened, the page audited and walked whole.
    { id: 'create', run: openCreateAndAssign },
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
    // The fifth slice: the step that says which classes receive the lesson.
    { id: 'classes', run: preflightStep('Classes') },
    { id: 'delivery', run: preflightStep('Delivery') },
    { id: 'check', run: preflightStep('Check') },
  ], { include: '[aria-label="Lesson pre-flight review"]' }),
  teacherScreen('teacher-live-challenge', [
    { id: 'setup', run: openLiveChallenge },
    { id: 'lobby', run: openLiveChallengeLobby },
    // The fifth slice: the same game played on (a round, the projector during it, the round's results, the game
    // over with its report). The projector is a layer over the whole page: audited as itself.
    { id: 'round', run: openLiveChallengeRound },
    { id: 'projector', run: openLiveChallengeProjector, include: PROJECTOR },
    { id: 'results', run: openLiveChallengeResults },
    { id: 'final', run: openLiveChallengeFinal },
    // Then New Challenge, and a Graph the Line game over, with its report (teacher features walk, item 11).
    { id: 'line-final', run: openLineGraphReport },
  ]),
  teacherScreen('teacher-classes', [
    { id: null, run: openDestination('Classes', /^Classes$/) },
    { id: 'class', run: openClassPage },
  ]),
  teacherScreen('teacher-students', [
    { id: null, run: openDestination('Students', /^Students$/) },
    // A modal drawer: audited as the drawer, as the Assignment Hub is, and not the page behind its scrim.
    { id: 'drawer', run: openStudentDrawer, include: '[data-student-profile-drawer]' },
  ]),
  // The fifth slice: a student's detail page (the Students screen's "Open"), six of its seven views.
  teacherScreen('teacher-student-detail', STUDENT_DETAIL_VIEWS.map(([id, label]) => ({ id, run: openStudentDetailView(label) }))),
  teacherScreen('teacher-library', [{ id: null, run: openDestination('Library', /Library/) }]),
  teacherScreen('teacher-weekly-path', [{ id: null, run: openDestination('Weekly Path', /^Weekly Path/) }], { open: (page, origins) => openTeacherApp(page, origins, '&weeklyPath=ok') }),
  teacherScreen('teacher-action-center', [{ id: null, run: openDestination('Action Center', /^Action Center$/) }]),
  teacherScreen('teacher-grade-export', [
    { id: null, run: openDestination('Grade Export', /^Grade Export$/) },
    // The fifth slice: the flow after the first screen.
    { id: 'review', run: openGradeExportReview, include: GRADE_EXPORT_REVIEW },
    { id: 'selection', run: selectGradeExports },
    { id: 'district-ids', run: openDistrictIds },
  ]),
  teacherScreen('teacher-secure-exams', [
    { id: null, run: openDestination('Secure Exams', /^My Course Tests$/) },
    // The fifth slice: the flow after the first screen.
    { id: 'session', run: createPracticeTestSession },
    { id: 'delete', run: openTestCycleDelete },
    { id: 'preview', run: openTestCyclePreviewScene, include: TEST_CYCLE_PREVIEW },
  ], { open: openTeacherAppWithTestCycle }),
  teacherScreen('teacher-pacing', [{ id: null, run: openDestination('Curriculum Pacing', /^Curriculum pacing/i) }]),
  teacherScreen('teacher-attendance', [{ id: null, run: openDestination('Attendance History', /^Attendance History$/) }]),
  teacherScreen('teacher-parent-contacts', [{ id: null, run: openDestination('Parent Contacts', /^Parent Contact Center$/) }]),
  teacherScreen('teacher-teks', [
    { id: null, run: openDestination('TEKS & Mastery', /^Texas Math TEKS/) },
    { id: 'demand', run: openTeksView('Demand & Complexity') },
    { id: 'ccmr', run: openTeksView('CCMR Readiness') },
    { id: 'items', run: openTeksView('Item Analysis') },
    { id: 'registry', run: openTeksView('TEKS Registry') },
    { id: 'pathway', run: openTeksView('TEKS Pathway') },
  ]),
  teacherScreen('teacher-analytics', [{ id: null, run: openDestination('Analytics', /Suggested instructional groups/) }]),
  // The Lab's first tool, the Transformations Lab, draws the source segment through the tick and point labels of the
  // shared coordinate plane (its sample is the diagonal y = x): "0", "-2", "S1" and "S2" measure 1.1:1 to 4.5:1 in the contrast
  // review. The plane's label text is left out here, and listed in the third slice's report; the plane is audited on its own
  // in assignment-tools/graphing, where no line crosses a label.
  teacherScreen('teacher-math-tools', [{ id: null, run: openMathToolsLab }], { exclude: ['svg[role="application"] text'] }),
  teacherScreen('teacher-simulator', [
    { id: null, run: openDestination('Path Simulator', /^Teacher controls$/) },
    { id: 'week', run: openSimulatorMode('Weekly Path') },
    { id: 'bench', run: openSimulatorMode('Question bench') },
  ]),
  // The Find palette is a dialog over any screen: audited as the dialog.
  teacherScreen('teacher-find', [
    { id: null, run: openFindPalette },
    { id: 'results', run: findWithResults },
  ], { include: FIND_DIALOG }),
  teacherScreen('teacher-demo', [{ id: null, run: openDestination('Demo Experience', /^Avery Daniels$/) }]),
  teacherScreen('teacher-schedule', [{ id: null, run: openDestination('Class & Bell Schedule', /A\/B Bell Schedule/) }]),
  teacherScreen('teacher-classroom', [
    { id: null, run: openDestination('Google Classroom', /^Google Classroom Manager$/) },
    // Once connected: the courses (listGoogleCourses, which the harness now answers) and what they open.
    { id: 'connected', run: openClassroomConnected },
  ]),
  teacherScreen('teacher-access', [{ id: null, run: openDestination('Student Access', /^Student Access$/) }]),
  // The administrator's workspace: the harness's root-admin teacher, its Administration view, and each of its five sections.
  teacherScreen('teacher-admin', ADMIN_SECTIONS.map(([id, label]) => ({ id, run: openAdministration(label) })), { open: (page, origins) => openTeacherApp(page, origins, '&rootAdmin=1') }),
];
