/*
 * A CLASSIC ROUND'S QUESTION HOLDS ITS PLACE WHILE WHAT IS ABOVE IT COMES AND GOES.
 *
 * In a classic Live Challenge round (a Standard Challenge, a Solver Race) the
 * question sits under the page's header and the round's banner, and things
 * came and went there during play. Measured in CI's fonts on a phone
 * (390 x 844 and 360 x 740, touch):
 *
 *   "Reconnecting…" in the header wrapped the score and Exit onto rows of
 *   their own: the header grew 50 px (66 px at 200% text; 93 px on a
 *   Chromebook at 200%), the question moved down under the student's finger,
 *   and back up as the connection returned;
 *   "Points banked this round", arriving in the banner with the first right
 *   step, pushed the question down 83 px, and leaving with the answer, back;
 *   "Your connection is slow right now…" (a clock that cannot be read, as
 *   when the device goes offline) came and went above the banner.
 *
 * Now "Reconnecting…" sits on the header's lower edge and takes no room
 * wherever the header could wrap (as the rush's does on its bar), the banked
 * line keeps its room from GO in a round that can bank points (its words over
 * the same words, unseen, with the most a round can bank), and the slow line
 * is said under the question. The question holds to the pixel. The browser
 * proof is liveChallengeShellQa.mjs's phone pass.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, region } from './helpers/sourceContract.mjs';
import { parseCss, rulesFor } from './helpers/cssRules.mjs';
import { SHELL_CSS } from '../../src/components/liveChallenge/challengeShellCss.js';
import { LIVE_PROVISIONAL_MAX_POINTS } from '../../functions/shared/liveChallenge.mjs';
import { provisionalWorth } from '../../functions/shared/liveChallengeScoring.mjs';

const student = componentSource('src/components/liveChallenge/LiveChallengeStudent.jsx');
const parts = componentSource('src/components/liveChallenge/ChallengeShellParts.jsx');
const engine = componentSource('src/QuestionEngine.jsx');
const sheet = parseCss(SHELL_CSS);
const at = (selector, property, media) => rulesFor(sheet, selector)
  .filter((rule) => property in rule.declarations && (rule.atRules.join(' ') || null) === media)
  .map((rule) => rule.declarations[property].value);
const NARROW = '@media (max-width: 60em)';

test('"Reconnecting…" sits on the header\'s edge and takes no room wherever the header could wrap', () => {
  const header = region(student, '<header data-mm-under-round=""', '</header>', 'the page header');
  // The header is what it is placed against; the status is one of its own children, not in the score's row.
  assert.match(header, /^<header data-mm-under-round="" style=\{\{ position: 'relative', /);
  assert.match(header, /<ConnectionPill state=\{connection\} look="student" className="mm-shell-pill-edge" \/>\s*<div style=\{\{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' \}\}>\s*\{headerRow && \(/);
  assert.match(parts, /export function ConnectionPill\(\{ state = 'online', look = 'student', className = '' \}\)/);
  assert.match(region(parts, 'export function ConnectionPill(', '\n}\n', 'the pill'), /className=\{className \? `mm-shell-pill \$\{className\}` : 'mm-shell-pill'\}/);
  // A wide screen: beside the score, as it was.
  assert.deepEqual(at('.mm-shell-pill-edge', 'margin-left', null), ['auto']);
  // Where the header can wrap: out of the flow, on the gap under the header, catching no pointer, every word shown.
  assert.deepEqual(at('.mm-shell-pill-edge', 'position', NARROW), ['absolute']);
  assert.deepEqual(at('.mm-shell-pill-edge', 'bottom', NARROW), ['-16px']);
  assert.match(header, /marginBottom: 16 \}\}>/, 'the gap it sits on is the header\'s 16 px margin');
  assert.deepEqual(at('.mm-shell-pill-edge', 'pointer-events', NARROW), ['none']);
  assert.deepEqual(at('.mm-shell-pill-edge', 'white-space', NARROW), ['normal']);
  assert.deepEqual(at('.mm-shell-pill-edge', 'max-width', NARROW), ['calc(100% - 16px)']);
});

test('"Points banked this round" keeps its room from GO in a round that can bank points', () => {
  // Which rounds: a tool that grades steps as they go, under a scoring that pays for work in progress.
  assert.match(student, /const STEP_GRADED_TOOLS = new Set\(\['stepAlgebra', 'algebra', 'literal'\]\);/);
  assert.match(student, /const canBankPoints = STEP_GRADED_TOOLS\.has\(secureQuestion\?\.type\)\s*&& provisionalWorth\(\{ strategyId: scoringStrategyId, credit: 1, secondChance: replayRound \}\) > 0;/);
  assert.ok(provisionalWorth({ strategyId: 'correctCount', credit: 1 }) === 0 && provisionalWorth({ strategyId: null, credit: 1 }) > 0, 'Correct Count banks nothing; the default pays for work');
  const line = region(student, '{canBankPoints && (', '\n        )}', 'the banked line');
  // The words, said as they arrive (a live region there from GO), over the same words unseen with the most a round can bank.
  assert.match(line, /<div aria-live="polite" style=\{\{ \.\.\.BANKED_LINE, gridArea: '1 \/ 1' \}\}>\s*\{banked && <BankedPoints points=\{`\+\$\{workingPoints\.toLocaleString\(\)\}`\} \/>\}/);
  assert.match(line, /<div aria-hidden="true" style=\{\{ \.\.\.BANKED_LINE, gridArea: '1 \/ 1', visibility: 'hidden' \}\}>\s*<BankedPoints points=\{`\+\$\{LIVE_PROVISIONAL_MAX_POINTS\.toLocaleString\(\)\}`\} \/>/);
  assert.match(student, /const banked = workingPoints > 0 && !result;/);
  assert.equal(LIVE_PROVISIONAL_MAX_POINTS, 1000, 'the most a round\'s work in progress shows');
  assert.match(region(student, 'function BankedPoints(', '\n}\n', 'the banked words'), /Points banked this round<\/span>[\s\S]*\{points\}[\s\S]*keep going — every correct step adds more/);
});

test('the step-graded tools are the ones the question engine takes step grades from', () => {
  // Each onStepGrade the engine passes a tool sits under one of these cases of its switch.
  const toolSwitch = engine.slice(engine.indexOf("case 'modelingLab':"), engine.indexOf("case 'table':"));
  const casesWithSteps = new Set();
  let group = [];
  let inBody = false;
  for (const line of toolSwitch.split('\n')) {
    const label = /^\s*case '([^']+)':/.exec(line);
    if (label) {
      if (inBody) { group = []; inBody = false; }
      group.push(label[1]);
    } else if (line.trim()) {
      inBody = true;
      if (/onStepGrade=\{/.test(line)) group.forEach((id) => casesWithSteps.add(id));
    }
  }
  const listed = new Set(JSON.parse(/STEP_GRADED_TOOLS = new Set\((\[[^\]]*\])\)/.exec(student)[1].replace(/'/g, '"')));
  assert.deepEqual([...casesWithSteps].sort(), ['algebra', 'literal', 'stepAlgebra'], 'the engine\'s step-graded tools');
  for (const id of casesWithSteps) assert.ok(listed.has(id), `${id} grades steps: its rounds can bank points, so their line needs its room`);
});

test('the slow-connection line is said under the question, where nothing it does can move it', () => {
  const round = region(student, 'export function ChallengeRound(', '\nfunction StudentRoundResults', 'the classic round');
  assert.match(round, /underQuestion = null,/);
  // After the question's own block, before the lock line and the result.
  const afterQuestion = round.slice(round.indexOf('data-mm-question-at-go'));
  assert.match(afterQuestion, /\n\s*<\/div>\n\s*\)\}\n\s*<\/div>\n\n\s*\{underQuestion\}\n\n\s*\{lockedLine && \(/);
  const call = region(student, '<ChallengeRound\n            key=', '\n          />', 'the round on the page');
  assert.match(call, /beforeQuestion=\{lateJoinNote\}/);
  assert.match(call, /underQuestion=\{clock\.quality === 'degraded' \? <div role="status">Your connection is slow right now\. You can still answer — your time is taken when your answer arrives\.<\/div> : null\}/);
  assert.doesNotMatch(region(call, 'beforeQuestion=', '\n', 'before'), /degraded/);
});
