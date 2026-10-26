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
 *                          starts, and what lies behind it.
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

const teacherUrl = (origins) => `${origins.app}/tests/browser/teacherWorkflow/index.html?reset=1`;
const liveClassHeading = (page) => page.getByRole('heading', { name: 'Live Class', exact: true });

export const openTeacherApp = async (page, origins) => {
  await page.goto(teacherUrl(origins), { timeout: 180_000 });
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

const teacherScreen = (id, scenes, extra = {}) => ({
  id, harness: 'app', schoolClock: true, keyboard: true, open: openTeacherApp, scenes, ...extra,
});

export const TEACHER_SCREENS = [
  teacherScreen('teacher-home', [{ id: null, run: goHome }]),
  teacherScreen('teacher-live-class', [
    { id: 'walkthrough', run: liveClassMode(/^Walkthrough/) },
    { id: 'attention', run: liveClassMode(/^Attention/) },
  ]),
  teacherScreen('teacher-assignments', [{ id: null, run: openAssignments }]),
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
