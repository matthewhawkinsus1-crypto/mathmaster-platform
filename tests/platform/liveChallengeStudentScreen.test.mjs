// A student's Live Challenge screen, bound region by region to what it must
// (and must never) do. Node cannot render .jsx, so these read the source; each
// assertion is anchored to the component, branch or call that does the work
// (docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const student = read('../../src/components/liveChallenge/LiveChallengeStudent.jsx');
const shell = read('../../src/components/liveChallenge/ChallengeStudentShell.jsx');
const solutionParts = read('../../src/components/liveChallenge/ChallengeSolutionParts.jsx');
const warmupGate = read('../../src/components/liveChallenge/WarmupChallengeGate.jsx');

const round = region(student, 'export function ChallengeRound(', '\nfunction StudentRoundResults(', 'ChallengeRound');
const results = region(student, 'function StudentRoundResults(', '\n}\n', 'StudentRoundResults');
const main = region(student, 'export default function LiveChallengeStudent(', null, 'student screen');
const liveRound = region(main, '<ChallengeRound\n', '/>\n        )}', 'the live round mount');
const header = region(main, '<header', '</header>', 'header');
const finalCard = region(shell, 'export function StudentFinalCard(', '\n}\n', 'final card');
const finished = region(main, "{room.status === 'finished' && (", "{room.status === 'cancelled' && (", 'finished view');

/* ------------------------- nobody is publicly last ------------------------- */

test('no board and no rank under the question while the student is thinking', () => {
  // The round itself holds no standings at all: no board, no "Top 5", no
  // "You: #18", and its answer feedback carries points only — never a rank.
  const code = executableSource(round);
  assert.doesNotMatch(code, /StandingsBoard|MiniLeaderboard|Top 5|standings/, 'no board in the round');
  assert.doesNotMatch(code, /Rank #|result\.rank|\.rank\b/, 'no rank in the answer feedback');
  // The live game hands the round nothing to rank with.
  assert.doesNotMatch(executableSource(liveRound), /standings|playerKey/, 'the live round gets no standings');
  // Nor does the file keep a board component around to be wired back in.
  assert.doesNotMatch(executableSource(student), /function MiniLeaderboard|<StandingsBoard/);
});

test('the header shows the student\'s own score and never their place', () => {
  const code = executableSource(header);
  assert.match(code, /Your score/);
  assert.doesNotMatch(code, /headerPlace|standings|shortPlaceText|place/i);
});

test('the final card leads with the place only for a podium finish', () => {
  assert.match(finalCard, /const podium = Boolean\(selfRow\) && finalPlaceIsHeadline\(selfRow\.rank\);/);
  // The big place is drawn only inside the podium branch.
  const podiumBranch = region(finalCard, '{selfRow && podium && (', '\n        )}', 'podium headline');
  const effortBranch = region(finalCard, '{selfRow && !podium && (', '\n        )}', 'effort headline');
  assert.match(podiumBranch, /\{selfRow\.place\.ordinal\}/);
  assert.equal(finalCard.split('{selfRow.place.ordinal}').length - 1, 1, 'the big place appears once, on the podium');
  // Any other finish leads with what the student did, then a quiet line.
  assert.ok(effortBranch.indexOf('{didLine}') > -1 && effortBranch.indexOf('{didLine}') < effortBranch.indexOf('Your place:'), 'what they did comes first');
  // The place is "only you see" only when no class-wide board shows it: the
  // promise is conditional, and the room's full-standings choice reaches it.
  assert.match(effortBranch, /Your place: \{placeWords\}\{placeIsPrivate \? ' — only you see this' : ''\}/);
  assert.match(finalCard, /const placeIsPrivate = Boolean\(selfRow\) && finalPlaceIsPrivate\(\{ rank: selfRow\.rank, fullStandings \}\);/);
  assert.match(finished, /fullStandings=\{roomShowsFullStandings\(room\)\}/);
  assert.match(effortBranch, /highlights\.map\(/, 'what they earned and beat');
  assert.doesNotMatch(executableSource(effortBranch), /place\.ordinal|fontSize: 'clamp\(40px/, 'never the big place');
  // Confetti is podium-only, by the same rule.
  assert.match(finished, /\{finalSelf && finalPlaceIsHeadline\(finalSelf\.rank\) && <Confetti /);
  assert.match(finished, /highlights=\{recapHighlights\(recap\)\}/);
});

test('the final card says truthfully what the game counts for', () => {
  assert.match(finalCard, /\{gameGradeSentence\(\{ warmup \}\)\}/);
  assert.doesNotMatch(executableSource(shell), /does not change your assignment grade/i);
  assert.match(finished, /warmup=\{Boolean\(room\.assignmentId\)\}/, 'a Warm-Up game is a room with an assignment');
});

/* ------------------------- worked solutions ------------------------- */

test('a worked solution is read only for a closed round the server has revealed', () => {
  assert.match(results, /const roundClosed = stage === CHALLENGE_STAGE\.ROUND_RESULTS && room\.roundState === 'closed';/);
  assert.match(results, /useRoundSolution\(room\.roomId, roundIndex, roundClosed && solutionRevealed\(room, roundIndex\)\)/);
  assert.match(results, /const solutionState = roundClosed \? roundSolutionState\(\{ room, roundIndex, solution, roundClosed \}\) : SOLUTION_STATE\.NONE;/);
  assert.match(results, /solutionSlot=\{<RoundSolutionPanel state=\{solutionState\} solution=\{solution\} \/>\}/);
  assert.match(main, /\{stage === CHALLENGE_STAGE\.ROUND_RESULTS && \(\s*<StudentRoundResults room=\{room\} stage=\{stage\}/);
  // Nothing in the round that can still be answered touches a solution.
  assert.doesNotMatch(executableSource(round), /olution/, 'no solution in an open round');
  // The panel draws the card only when READY; held, loading and unavailable are words.
  const panel = region(solutionParts, 'export function RoundSolutionPanel(', '\n}\n', 'solution panel');
  assert.match(panel, /if \(state === SOLUTION_STATE\.READY\) \{\s*return <RoundSolutionCard /);
  assert.match(panel, /const message = solutionStateMessage\(state\);\s*if \(!message\) return null;/);
  // Every line of it goes through MathText, so $…$ is drawn as mathematics.
  const card = region(solutionParts, 'export function RoundSolutionCard(', '\n}\n', 'solution card');
  for (const field of ['solution.headline', 'step', 'solution.commonError', 'solution.answerSummary', 'prompt']) {
    const drawn = card.split(`{${field}}`).length - 1;
    const asMath = (card.match(new RegExp(`<MathText[^>]*>\\{${field.replace('.', '\\.')}\\}</MathText>`, 'g')) || []).length;
    assert.ok(drawn > 0 && asMath === drawn, `${field} is drawn, and only as mathematics (${asMath} of ${drawn})`);
  }
  // The results card puts it between the round and the standings.
  const resultsCard = region(shell, 'export function StudentRoundResultsCard(', '\n}\n', 'results card');
  assert.ok(resultsCard.indexOf('{solutionSlot}') > resultsCard.indexOf('data-mm-student-results=') && resultsCard.indexOf('{solutionSlot}') < resultsCard.indexOf('<StandingsBoard'));
});

/* ------------------------- accommodations ------------------------- */

test('extended time: the round counts down to, and buzzes at, the student\'s own deadline', () => {
  // From the round's full length too, so a closing threshold never takes the
  // student's extra time away (the server judges against the same rule).
  assert.match(round, /const personalClock = personalRoundClock\(\{\s*startsAtMs, endsAtMs: classEndsAtMs, timeMultiplier, fullDurationMs: roomFullRoundMs\(room\),\s*\}\);\s*const endsAtMs = personalClock\.endsAtMs;/);
  assert.match(round, /const remainingMs = Math\.max\(0, personalClock\.durationMs - elapsedMs\);/);
  // The lock and the buzzer both follow `expired`, which reads that clock.
  assert.match(round, /const expired = roundClosed \|\| \(endsAtMs > 0 && remainingMs <= 0\);/);
  assert.match(region(round, 'const transitionedToExpired', 'const retryPending', 'buzzer'), /void submit\(\{ raw: rawWork \}, \{ atRoundEnd: true \}\)/);
  // The live game passes the student's own multiplier — never the room's largest.
  assert.match(liveRound, /timeMultiplier=\{timeMultiplier\}/);
  assert.match(main, /const timeMultiplier = joinedTimeMultiplier \?\? \(invite\?\.roomId === roomId \? storedTimeMultiplier\(invite\?\.timeMultiplier\) : 1\);/);
  assert.doesNotMatch(executableSource(student), /maxTimeMultiplier|extendedTimeInPlay/, 'the room\'s flag says nothing about this student');
  // The round stays mounted after the class's deadline until the room closes it.
  assert.match(main, /\{!rushRoom && room\.status === 'running' && room\.currentQuestion && roundOpen && clockReady && \(\s*<ChallengeRound/);
});

test('Read aloud is offered only to a student whose plan grants it, and stops with the round', () => {
  assert.match(main, /resolveSupportEntitlements\(studentProfile\)\.granted\?\.textToSpeech === true && speechAvailable\(\)/);
  assert.match(liveRound, /readAloud=\{readAloud\}/);
  const button = region(round, '{readAloud && roundStarted && promptText && (', '\n            )}', 'read aloud button');
  assert.match(button, /onClick=\{\(\) => speakAloud\(promptText\)\}/);
  assert.match(round, /useEffect\(\(\) => \(\) => stopSpeaking\(\), \[roundIndex, question\?\.questionInstanceId\]\);/);
  assert.match(round, /readAloud = false,/, 'off unless granted');
});

test('the Warm-Up gate passes the rewards slot and the student\'s profile through', () => {
  const play = region(warmupGate, '<LiveChallengeStudent', '/>', 'warm-up game');
  assert.match(play, /renderMatchRewards=\{renderMatchRewards\}/);
  assert.match(play, /studentProfile=\{studentProfile\}/);
  assert.match(warmupGate, /renderMatchRewards = null,/);
});

/* ------------------------- coming back, and the recap ------------------------- */

test('a device that comes back is told which rounds closed without its answer', () => {
  const effect = region(main, '  useEffect(() => {\n    if (!roomId || !playerKey || !room', '}, [roomId, playerKey,', 'missed rounds effect');
  // Only the server's copy of the room counts; a cached one is not a return.
  assert.match(effect, /roomFromCache \|\| !everInSync\) return;/);
  assert.match(effect, /const lastSeen = readLastSeenRound\(storage, roomId\);\s*writeLastSeenRound\(storage, roomId, now\);/);
  assert.match(effect, /roundsClosedWhileAway\(\{ lastSeen, now, joinedAtRound, finished: room\.status === 'finished' \}\)/);
  // From the student's OWN summary: the class's copy of a round lists only
  // its top rows, so it cannot say whether this student answered.
  assert.match(effect, /readLiveChallengePlayerSummary\(roomId, studentId\)/);
  assert.match(effect, /summaryUnansweredRounds\(summary, rounds, \{ roomId \}\)/);
  assert.doesNotMatch(effect, /readLiveChallengeRound\(/);
  // Shown once, dismissible.
  const notice = region(main, '{missedNotice && (', '\n        )}', 'missed notice');
  assert.match(notice, /onClick=\{\(\) => setMissedNotice\(''\)\}/);
  assert.match(student, /try \{ return window\.sessionStorage; \} catch \{ return null; \}/);
});

test('a finished game asks once for the student\'s own recap, and a failure shows nothing', () => {
  const effect = region(main, 'const recapAskedRef = useRef(null);', '}, [roomId, room?.status]);', 'recap effect');
  assert.match(effect, /room\?\.status !== 'finished' \|\| recapAskedRef\.current === roomId\) return undefined;\s*recapAskedRef\.current = roomId;/);
  assert.match(effect, /getLiveChallengeMatchRecap\(\{ roomId \}\)/);
  assert.match(effect, /\.catch\(\(\) => \{ if \(!cancelled\) setRecap\(null\); \}\)/);
  assert.match(finished, /<StudentMatchRecap recap=\{recap\} \/>/);
  const recapCard = region(shell, 'export function StudentMatchRecap(', '\n}\n', 'recap card');
  assert.match(recapCard, /if \(!recapHasContent\(recap\)\) return null;/);
  assert.match(recapCard, /round\.solutionReview && <RoundSolutionCard /);
  assert.match(recapCard, /\{round\.result\.text\}/);
});

// Under StrictMode the effect's cleanup runs once on the development double
// mount; a ref only ever cleared would stay false and drop every missed-round
// notice. The effect must set it in its body before returning the cleanup.
test('the missed-round notice survives StrictMode\'s double mount', () => {
  const student = executableSource(readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeStudent.jsx', import.meta.url), 'utf8'));
  const effect = region(student, 'const mountedRef = useRef(true);', '}, []);', 'the mounted-ref effect');
  assert.ok(effect.indexOf('mountedRef.current = true;') >= 0 && effect.indexOf('mountedRef.current = true;') < effect.indexOf('return () =>'));
});
