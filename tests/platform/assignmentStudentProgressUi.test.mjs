import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const engine = fs.readFileSync('src/QuestionEngine.jsx', 'utf8');
const viewport = fs.readFileSync('src/components/student/MobileViewportContainer.jsx', 'utf8');
const preflight = fs.readFileSync('src/platform/preflight/assignmentV5PreflightModel.js', 'utf8');

test('sticky assignment navigation exposes the live grade and attempted-work accuracy', () => {
  assert.match(app, /Current grade \$\{recordedGrade\}% if submitted now/);
  assert.match(app, /gradeSplit\.attempted/);
  assert.match(app, /gradeSplit\.creditOnAttempted/);
  assert.match(app, /Score available after teacher release/);
  assert.match(app, /Recorded grade \$\{recordedGrade\}% · frozen/);
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
