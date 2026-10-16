import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const engine = fs.readFileSync('src/QuestionEngine.jsx', 'utf8');
const viewport = fs.readFileSync('src/components/student/MobileViewportContainer.jsx', 'utf8');
const preflight = fs.readFileSync('src/platform/preflight/assignmentV5PreflightModel.js', 'utf8');

// Pass 3, RUN-7 / RUN-16: the grade lines moved from the sticky navigator into
// Overview, which every size of navigator can open; "Grade so far", never
// "if submitted now" (there is no assignment-level submit).
test('Overview shows the live grade and attempted-work accuracy, in student words', () => {
  const grade = region(app, 'className="mathmaster-overview-grade"', '</section>', 'Overview\'s grade lines');
  assert.match(grade, /`Grade so far: \$\{recordedGrade\}%`/);
  assert.match(grade, /gradeSplit\.attempted > 0/);
  assert.match(grade, /\{gradeSplit\.creditOnAttempted\}% on what you have answered/);
  // Held feedback hides the score; post-deadline practice names the set grade.
  assert.match(grade, /assignmentFeedbackHeld\s*\?\s*'Your score shows after your teacher releases it'/);
  assert.match(grade, /lifecycle\.isPracticeOnly\s*\?\s*`Your grade: \$\{recordedGrade\}% · set when the assignment closed`/);
  assert.doesNotMatch(executableSource(app), /if submitted now/i);
  // Overview is reachable from the compact navigator too: its button is not
  // inside the expanded-only branch.
  const nav = region(app, '<nav ref={stickyHeightRef(ASSIGNMENT_NAV_HEIGHT_VAR)}', '</nav>', 'the navigator');
  const beforeOverviewButton = nav.slice(Math.max(0, nav.indexOf('className="mathmaster-overview-button"') - 140), nav.indexOf('className="mathmaster-overview-button"'));
  assert.doesNotMatch(beforeOverviewButton, /assignmentNavigationCollapsed &&/);
  // And the navigator itself carries no grade line any more.
  assert.doesNotMatch(nav, /recordedGrade|gradeSplit/);
});

test('TEKS and CCMR alignment travel with the persistent YOUR TASK anchor', () => {
  assert.match(engine, /const questionAlignmentPanel = showStandardBadge/);
  assert.match(engine, /taskMeta=\{questionAlignmentPanel\}/);
  assert.match(viewport, /taskMeta = null/);
  assert.match(viewport, /mathmaster-question-task-meta/);
  assert.match(viewport, /<QuestionPrompt[\s\S]*variant="task"[\s\S]*taskMeta/);
});

test('Preflight distinguishes bank-backed direct CCMR from independently authored exam-style items', () => {
  assert.match(preflight, /ccmrSource\?\.source !== 'auditedBank'/);
  assert.match(preflight, /cannot label its provenance as bank-backed/);
});
