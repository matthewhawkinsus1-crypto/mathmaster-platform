import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { region } from './helpers/sourceContract.mjs';

const modelPath = path.resolve('src/platform/liveChallenge/liveChallengeProjectorModel.js');
const loadModel = () => import(`${pathToFileURL(modelPath).href}?test=${Date.now()}`);

test('projector labels solver families and difficulty without guessing from prompt text', async () => {
  const {
    projectorFamilyLabel,
    projectorDifficultyLabel,
    projectorGameLabel,
  } = await loadModel();

  const room = {
    challengeMode: 'solverRace',
    solverRaceFocus: 'mixed',
    currentQuestion: {
      challengeFamily: 'absoluteValueInequality',
      difficultyBand: 'advanced',
      prompt: 'This prompt intentionally says nothing useful about its family.',
    },
  };
  assert.equal(projectorGameLabel(room), 'Solver Race');
  assert.equal(projectorFamilyLabel(room), 'Absolute Value Inequalities');
  assert.equal(projectorDifficultyLabel(room), 'Advanced');

  assert.equal(projectorFamilyLabel({
    challengeMode: 'solverRace',
    currentQuestion: { challengeFamily: 'linearEquation' },
  }), 'Linear Equations');

  assert.equal(projectorFamilyLabel({
    challengeMode: 'solverRace',
    currentQuestion: { tool: { challengeFamily: 'linearEquation', difficultyBand: 'challenge' } },
  }), 'Linear Equations');
  assert.equal(projectorDifficultyLabel({
    challengeMode: 'solverRace',
    currentQuestion: { tool: { challengeFamily: 'linearEquation', difficultyBand: 'challenge' } },
  }), 'Challenge');
});

test('projector round count honors scheduled/second-chance rounds and never falls behind current round', async () => {
  const { projectorRoundCount, projectorCurrentRound } = await loadModel();
  assert.equal(projectorRoundCount({ roundCount: 10, scheduledRoundCount: 12, currentRound: 7 }), 12);
  assert.equal(projectorRoundCount({ roundCount: 10, currentRound: 11 }), 12);
  assert.equal(projectorCurrentRound({ currentRound: 0 }), 1);
  assert.equal(projectorCurrentRound({ currentRound: 9 }), 10);
});

test('locked-in count comes from the authoritative answeredRound field already present in public leaderboard rows', async () => {
  const { projectorAnsweredCount } = await loadModel();
  const rows = [
    { alias: 'A', answeredRound: 4 },
    { alias: 'B', answeredRound: 3 },
    { alias: 'C', answeredRound: 4 },
    { alias: 'D', answeredRound: -1 },
  ];
  assert.equal(projectorAnsweredCount(rows, 4), 2);
  assert.equal(projectorAnsweredCount(rows, 3), 1);
});

test('final podium is rank-driven and keeps the top three distinct', async () => {
  const { podiumRows, finalStandingRows } = await loadModel();
  const rows = [
    { alias: 'Bronze', rank: 3, liveScore: 7000 },
    { alias: 'Champion', rank: 1, liveScore: 9000 },
    { alias: 'Fourth', rank: 4, liveScore: 6500 },
    { alias: 'Silver', rank: 2, liveScore: 8000 },
  ];
  const podium = podiumRows(rows);
  assert.equal(podium.first.alias, 'Champion');
  assert.equal(podium.second.alias, 'Silver');
  assert.equal(podium.third.alias, 'Bronze');
  assert.deepEqual(finalStandingRows(rows).map((row) => row.alias), ['Champion', 'Silver', 'Bronze', 'Fourth']);
});

test('teacher projector is wired to the arena component and the arena has a real final podium', () => {
  const teacher = readFileSync('src/components/liveChallenge/LiveChallengeTeacher.jsx', 'utf8');
  const arena = readFileSync('src/components/liveChallenge/LiveChallengeArenaProjector.jsx', 'utf8');

  assert.match(teacher, /import LiveChallengeArenaProjector from '\.\/LiveChallengeArenaProjector\.jsx'/);
  assert.match(teacher, /export function ChallengeProjector\(props\)[\s\S]{0,140}<LiveChallengeArenaProjector \{\.\.\.props\} \/>/);

  assert.match(arena, /MathMaster Arena/);
  assert.match(arena, /Final Podium/);
  assert.match(arena, /PodiumPlace row=\{podium\.first\} place=\{1\}/);
  assert.match(arena, /PodiumPlace row=\{podium\.second\} place=\{2\}/);
  assert.match(arena, /PodiumPlace row=\{podium\.third\} place=\{3\}/);
  assert.match(arena, /prefers-reduced-motion: reduce/);
  assert.match(arena, /Scores update as answers lock/);
});

test('arena remains presentation-only: no Firebase writes, callable submits, or scoring mutation', () => {
  const arena = readFileSync('src/components/liveChallenge/LiveChallengeArenaProjector.jsx', 'utf8');
  assert.doesNotMatch(arena, /firebase|httpsCallable|setDoc|updateDoc|runTransaction|submitLiveChallengeResponse|score\s*=/i);
});

test('projector controls delegate start and advancement to the teacher-owned callable paths', () => {
  const teacher = readFileSync('src/components/liveChallenge/LiveChallengeTeacher.jsx', 'utf8');
  const projectorReturn = region(teacher, "if (projector && ['lobby', 'running', 'finished'].includes(room.status))", '\n  return (', 'projector delegation');
  assert.match(projectorReturn, /onStart=\{startFromProjector\}/);
  assert.match(projectorReturn, /onAdvance=\{\(\) => control\('advance', advanceLiveChallenge\)\}/);
  const startHandler = region(teacher, 'const startFromProjector = async () => {', '\n  };', 'projector start handler');
  assert.match(startHandler, /await enableAudio\(\)/, 'the projector click primes browser audio');
  assert.match(startHandler, /control\('start', startLiveChallenge\)/, 'start retains the authorized teacher callable');
});

test('projector presents gated lobby and round controls without owning server logic', () => {
  const arena = readFileSync('src/components/liveChallenge/LiveChallengeArenaProjector.jsx', 'utf8');
  const lobby = region(arena, 'function LobbyView(', '\nfunction RunningView(', 'projector lobby');
  assert.match(lobby, /disabled=\{joinedCount < 1 \|\| busy === 'start'\}/);
  assert.match(lobby, /onClick=\{onStart\}/);
  assert.match(lobby, /Starting Challenge…/);

  const running = region(arena, 'function RunningView(', '\nexport const formatArenaClock', 'running projector');
  assert.match(running, /const roundComplete = Number\(remainingMs\) <= 0/);
  assert.match(running, /const advanceAvailable = roundComplete \|\| canAdvance/);
  assert.match(running, /\{advanceAvailable && typeof onAdvance === 'function' && \(/, 'Next is absent during active solving unless early advancement is authorized');
  assert.match(running, /onClick=\{onAdvance\}/);
  assert.match(running, /Finish & Show Final Standings/);
  assert.match(running, /Round Complete/);
});

test('projector retains exit, audio enablement, and readable action errors', () => {
  const arena = readFileSync('src/components/liveChallenge/LiveChallengeArenaProjector.jsx', 'utf8');
  const component = region(arena, 'export default function LiveChallengeArenaProjector(', null, 'arena component');
  assert.match(component, /onClick=\{onExit\}/);
  assert.match(component, /onClick=\{onEnableAudio\}/);
  assert.match(component, /error && <div role="alert"/);
});

test('normal teacher controls retain their existing authorized start and advance paths', () => {
  const teacher = readFileSync('src/components/liveChallenge/LiveChallengeTeacher.jsx', 'utf8');
  const normalScreen = region(teacher, '\n  return (\n    <div style=', null, 'normal teacher screen');
  assert.match(normalScreen, /control\('start', startLiveChallenge\)/);
  assert.match(normalScreen, /control\('advance', advanceLiveChallenge\)/);
});
