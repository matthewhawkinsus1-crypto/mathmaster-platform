import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import ChallengeDryRun from './ChallengeDryRun.jsx';
import ChallengeQuestionLibrary from './ChallengeQuestionLibrary.jsx';
import { RushHostStatus, RushRaceBoard, RushReport, rushSettingsLine } from './GraphFeatureRushHost.jsx';
import LiveChallengeArenaProjector from './LiveChallengeArenaProjector.jsx';
import { ChallengeClockText, ChallengeCountdown, ChallengeShellStyles, ConfirmDialog, StandingsBoard, useLowTime } from './ChallengeShellParts.jsx';
import { HostControlBar, HostRosterPanel, HostRoundResultsPanel, NotJoinedLine, StagePill } from './ChallengeHostConsole.jsx';
import MathText from '../common/MathText.jsx';
import { fetchPathCoverage } from '../../platform/path/pathCoverageService.js';
import { summarizeCoverage } from '../../../functions/shared/pathCoverage.mjs';
import { publicLeaderboard } from '../../../functions/shared/liveChallenge.mjs';
import { buildChallengeExport, challengeExportFileName } from '../../../functions/shared/liveChallengeExport.mjs';
import { buildChallengeScoringPreview } from '../../../functions/shared/liveChallengeExperience.mjs';
import { acceptChallengeSnapshot, calibrateChallengeClock } from '../../../functions/shared/liveChallengeParity.mjs';
import { leaderboardOptionsFor } from '../../../functions/shared/liveChallengeScoring.mjs';
import { rushConfigProblem } from '../../../functions/shared/graphFeatureRushConfig.mjs';
import { RUSH_MODE_ID } from '../../../functions/shared/graphFeatureRushRules.mjs';
import { LiveChallengeAudioDirector } from '../../platform/liveChallenge/liveChallengeAudio.js';
import { projectorGameLabel } from '../../platform/liveChallenge/liveChallengeProjectorModel.js';
import { defaultRushSetup, rushCreateRequest } from '../../platform/liveChallenge/rushSetupModel.js';
import {
  CHALLENGE_STAGE,
  HOST_COMMAND,
  cueRemainingMs,
  hostPrimaryAction,
  roundCloseDue,
  roomRunsQuestionSets,
  stageHasOpenRound,
} from '../../platform/liveChallenge/challengeShellModel.js';
import {
  placementRewardsFor,
  rewardSummaryLines,
  roundResultsView,
  scorePresentation,
  standingsRows,
} from '../../platform/liveChallenge/challengeStandingsModel.js';
import { hostRoster } from '../../platform/liveChallenge/challengePresenceModel.js';
import { replayExperienceFromRoom, replayRequestFromRoom, replaySummary } from '../../platform/liveChallenge/challengeReplayModel.js';
import { useChallengeClock, useLatest, usePreviousRoundSummary, useRoundSummary } from '../../platform/liveChallenge/challengeHooks.js';
import ChallengeRewardSettings from './ChallengeRewardSettings.jsx';
import { DEFAULT_CHALLENGE_REWARD_CHOICE, buildChallengeRewardPolicy, normalizeChallengeRewardChoice } from '../../platform/rewards/challengeRewardPolicy.js';
import {
  advanceLiveChallenge,
  cancelLiveChallenge,
  calibrateLiveChallengeClock,
  closeLiveChallengeRound,
  configureLiveChallengeExperience,
  createLiveChallenge,
  finishLiveChallenge,
  getLiveChallengeHostRoster,
  readChallengeReport,
  setWarmupChallengeDelivery,
  startLiveChallenge,
  updateLiveChallengePacing,
  watchLiveChallengePlayers,
  watchLiveChallengeDiagnostics,
  watchLiveChallengeRoom,
  watchTeacherActiveChallenge,
} from '../../platform/liveChallenge/liveChallengeService.js';

const panel = { background: 'var(--mm-surface)', border: '1px solid #d8dde6', borderRadius: 14, padding: 20, textAlign: 'left' };
const primary = { border: 0, borderRadius: 9, padding: '11px 16px', background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const secondary = { border: '1px solid #b7bec8', borderRadius: 9, padding: '10px 15px', background: 'var(--mm-surface)', color: '#3c4043', fontWeight: 900, cursor: 'pointer' };
const field = { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: 10, borderRadius: 8, border: '1px solid #b7bec8' };

const courseLabel = (courseId) => courseId === 'algebra2' ? 'Algebra II' : 'Algebra I';

// Graph Feature Rush's setup panel and practice round load only when a
// teacher chooses the rush; a classic game's console carries neither.
const GraphFeatureRushSetup = lazy(() => import('./GraphFeatureRushSetup.jsx'));
const GraphFeatureRushPractice = lazy(() => import('./GraphFeatureRushPractice.jsx'));

const speedPreset = (value) => [0, 10, 20, 35].includes(Number(value)) ? String(Number(value)) : 'custom';

// The room this tab last hosted, so a refresh on the final podium returns to
// it instead of to an empty setup panel. Per tab, and only for a few hours.
const LAST_ROOM_KEY = 'mathmaster.liveChallenge.host.lastRoom';
const LAST_ROOM_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const rememberHostedRoom = (roomId) => {
  try { window.sessionStorage.setItem(LAST_ROOM_KEY, JSON.stringify({ roomId, savedAt: Date.now() })); } catch { /* not remembered */ }
};
const forgetHostedRoom = () => {
  try { window.sessionStorage.removeItem(LAST_ROOM_KEY); } catch { /* nothing to forget */ }
};
const rememberedHostedRoom = () => {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(LAST_ROOM_KEY) || 'null');
    return saved?.roomId && Date.now() - Number(saved.savedAt) < LAST_ROOM_MAX_AGE_MS ? String(saved.roomId) : null;
  } catch { return null; }
};

// A close the host sends on its own is refused while the round is genuinely
// still running (a student joined at the buzzer, say). That is an expected
// answer, not an error to put in front of the teacher; the deadline closes it.
const closeRoundOnTime = (payload) => closeLiveChallengeRound(payload).catch((error) => {
  if (error?.details?.lifecycle === 'round_in_progress') return null;
  throw error;
});

function ChallengeReport({ report }) {
  const roundSet = useMemo(() => buildChallengeExport(report), [report]);
  if (!report) return null;
  const pct = (value) => (value == null ? '—' : `${value}%`);
  return (
    <section style={panel}>
      <h3 style={{ marginTop: 0 }}>After the game</h3>
      {report.weakestStandard && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fff4ce', border: '1px solid #f9ab00', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase', color: '#7a4f00' }}>Hardest for this class</div>
          <strong style={{ display: 'block', marginTop: 4, fontSize: 17, color: '#3c2f00' }}>{report.weakestStandard.standard} — {pct(report.weakestStandard.accuracyPercent)} correct</strong>
        </div>
      )}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 14, color: '#3c4043', marginBottom: 14 }}>
        <span><strong>{report.playedCount}</strong> of {report.eligibleCount} played</span>
        <span>Class accuracy <strong>{pct(report.classAccuracyPercent)}</strong></span>
        <span><strong>{report.scheduledRoundCount}</strong> rounds{report.secondChanceRoundCount ? ` + ${report.secondChanceRoundCount} second chance` : ''}</span>
      </div>
      {report.standards?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#5f6368', marginBottom: 6 }}>By standard, hardest first</div>
          {report.standards.map((entry) => (
            <div key={entry.standard} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid #eef0f2', fontSize: 14 }}>
              <span>{entry.standard}</span><span style={{ color: '#5f6368' }}>{entry.correct}/{entry.answered} correct · {pct(entry.accuracyPercent)}</span>
            </div>
          ))}
        </div>
      )}
      {roundSet && (
        <div style={{ marginBottom: 14 }}>
          <button type="button" onClick={() => {
            const blob = new Blob([JSON.stringify(roundSet, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = challengeExportFileName(roundSet);
            document.body.append(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
          }} style={{ ...secondary, color: '#174ea6', borderColor: '#9bb8e8' }}>Save this round set</button>
          <span style={{ display: 'block', marginTop: 5, fontSize: 12, color: '#5f6368' }}>{roundSet.roundCount} questions. Run the same set with another period — no student names or scores are in the file.</span>
        </div>
      )}
      {report.graphFeatureRush && <RushReport report={report} />}
      {report.neverJoined?.length > 0 && (
        <div style={{ padding: '10px 13px', borderRadius: 9, background: '#f1f3f4', fontSize: 13.5, color: '#3c4043' }}>
          <strong>Did not join:</strong> {report.neverJoined.length} student{report.neverJoined.length === 1 ? '' : 's'}. A student can be absent, on paper, or have lost their connection — this is a roster fact, not a finding.
        </div>
      )}
    </section>
  );
}

// The lifecycle commands share one lock: a second command while one is in
// flight (End Session during a Next Round, a double click) is never sent.
const LIFECYCLE_CONTROLS = Object.freeze(['start', 'advance', 'close', 'finish', 'cancel']);
// Commands about one round carry the round the teacher was looking at, so a
// late or repeated click is answered "already done" instead of skipping the
// round after it.
const ROUND_SCOPED_CONTROLS = Object.freeze(['advance', 'close']);

/**
 * A board of game aliases, labelled with the ENGINE's rank — a tie reads "T-2"
 * for everyone sharing it — and the score in the room's own unit. (The lobby
 * has no order to show: it lists the class by name, HostRosterPanel.) The dry
 * run renders this same component with its sample players.
 */
export function Leaderboard({ rows = [], limit = 12, projector = false, presentation = null, showMovement = false }) {
  if (!rows.length) return <p style={{ color: 'var(--mm-text-muted)', margin: 0 }}>Students who join will appear here.</p>;
  return (
    <StandingsBoard
      rows={standingsRows(rows)}
      presentation={presentation || scorePresentation({})}
      look={projector ? 'projector' : 'console'}
      limit={limit}
      showMovement={showMovement}
      showCorrect
      label="Leaderboard"
    />
  );
}

/**
 * The round, the question and the clock, for the teacher. Stage-aware: the
 * countdown before the round, the time left in it, "Time!" at the deadline.
 * Read from the room's own clock (and the screen's calibrated offset), so it
 * matches the projector and every student. The dry run renders it too.
 */
export function ChallengeLiveStatus({ room, clockOffsetMs = 0, answeredCount = 0, joinedCount = 0 }) {
  const clock = useChallengeClock(room, clockOffsetMs);
  const low = useLowTime(room, clockOffsetMs);
  const paceOpen = clock.openEnded;
  const counting = clock.stage === CHALLENGE_STAGE.COUNTDOWN;
  const locked = clock.stage === CHALLENGE_STAGE.ROUND_LOCKED;
  const timerLabel = counting ? 'Starts in' : locked ? 'Time!' : paceOpen ? 'Elapsed' : 'Time left';
  return (
    <section data-mm-live-status={clock.stage} style={{ ...panel, border: '2px solid #1a73e8' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ color: '#174ea6', fontSize: 12, fontWeight: 1000, textTransform: 'uppercase' }}>{clock.isReplay ? `Second Chance round ${clock.replayNumber}` : `Round ${(room.currentRound || 0) + 1} of ${room.roundCount}`} · {room.currentQuestion?.teksCode || 'Mixed review'}</div>
          <MathText as="div" style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 20, lineHeight: 1.45, fontWeight: 700 }}>{room.currentQuestion?.prompt}</MathText>
        </div>
        <div style={{ minWidth: 150, textAlign: 'center', padding: 12, borderRadius: 12, background: low || locked ? '#fce8e6' : '#e8f0fe', color: low || locked ? '#a50e0e' : '#174ea6' }}>
          <div style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{timerLabel}</div>
          <div style={{ fontSize: 38, fontWeight: 1000 }}>
            {counting ? clock.countdownStep : <ChallengeClockText room={room} clockOffsetMs={clockOffsetMs} />}
          </div>
          {room?.timingMode === 'pace' && !paceOpen && !counting && <div style={{ marginTop: 4, fontSize: 12, fontWeight: 900 }}>Closing countdown</div>}
        </div>
      </div>
      <div style={{ marginTop: 14, fontWeight: 800, color: '#5f6368' }}>{answeredCount} of {joinedCount} joined students answered</div>
    </section>
  );
}

export function ChallengeProjector(props) {
  return <LiveChallengeArenaProjector {...props} />;
}

function ScoringCompetitionCard({ roundSeconds, speedInfluencePercent }) {
  const preview = useMemo(() => buildChallengeScoringPreview({ roundSeconds, speedInfluencePercent }), [roundSeconds, speedInfluencePercent]);
  return (
    <section style={{ marginTop: 16, padding: 15, borderRadius: 12, background: '#e8f0fe', border: '1px solid #aecbfa', color: '#174ea6' }}>
      <h3 style={{ margin: '0 0 8px' }}>Scoring &amp; Competition</h3>
      <div style={{ fontWeight: 800 }}>Correctness: up to 1,000 · Speed: up to {preview.maxSpeedBonus} ({preview.speedInfluencePercent}%) · Streak: up to 100 · Comeback after a miss: +150</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
        {preview.examples.map((example) => <span key={example.secondsUsed} style={{ padding: '6px 9px', borderRadius: 999, background: 'var(--mm-surface)' }}>Correct at {example.secondsUsed}s → {example.pointsBeforeStreakComeback.toLocaleString()}</span>)}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5 }}>{preview.academicCreditNote} Interactive tools may earn partial correctness points as students work.</p>
    </section>
  );
}

function AudioMixer({ mix, onMixChange, onEnable, audioReady }) {
  const slider = (key, label) => (
    <label style={{ minWidth: 150, fontSize: 12, fontWeight: 800 }}>{label} {Math.round((mix?.[key] ?? 0) * 100)}%
      <input type="range" min="0" max="1" step="0.01" value={mix?.[key] ?? 0} onChange={(event) => onMixChange({ [key]: Number(event.target.value) })} style={{ display: 'block', width: '100%' }} />
    </label>
  );
  return (
    <section style={{ ...panel, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <strong>Game Audio</strong>
        {slider('music', 'Music')}{slider('announcer', 'Announcer')}{slider('effects', 'Effects')}
        <button type="button" onClick={() => onMixChange({ muted: !mix?.muted })} style={secondary}>{mix?.muted ? 'Unmute All' : 'Mute All'}</button>
        <button type="button" onClick={onEnable} style={{ ...secondary, color: '#174ea6' }}>{audioReady ? 'Audio Ready' : 'Enable Audio'}</button>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: '#5f6368' }}>Sound plays only from this screen, never from students&apos; devices, and nothing depends on it.</p>
    </section>
  );
}

export default function LiveChallengeTeacher({
  allStudents = [],
  classes = [],
  courseProfiles = {},
  signedInEmail = '',
  assignments = [],
  onLinkWarmupChallenge = null,
}) {
  const classOptions = useMemo(() => (Array.isArray(classes) ? classes : [])
    .filter((entry) => entry?.status !== 'archived' && ['algebra1', 'algebra2'].includes(entry?.course))
    .filter((entry) => allStudents.some((student) => student?.classId === entry.classId))
    .sort((a, b) => String(a.name || a.period || '').localeCompare(String(b.name || b.period || ''), undefined, { numeric: true })), [classes, allStudents]);
  const [classId, setClassId] = useState(classOptions[0]?.classId || '');
  const selectedClass = classOptions.find((entry) => entry.classId === classId) || null;
  const classPeriod = selectedClass?.period || '';
  const [courseId, setCourseId] = useState(selectedClass?.course || courseProfiles?.[classPeriod]?.course || 'algebra1');
  const [coverage, setCoverage] = useState(null);
  const [standardCode, setStandardCode] = useState('mixed');
  const [questionStyle, setQuestionStyle] = useState('any');
  const [challengeMode, setChallengeMode] = useState('standard');
  const [solverRaceFocus, setSolverRaceFocus] = useState('mixed');
  const [solverRaceDifficulty, setSolverRaceDifficulty] = useState('ramp');
  const [roundCount, setRoundCount] = useState(10);
  const [roundSeconds, setRoundSeconds] = useState(45);
  const [timingMode, setTimingMode] = useState('timed');
  const [roundClosingThreshold, setRoundClosingThreshold] = useState(70);
  const [secondChanceMode, setSecondChanceMode] = useState('off');
  const [rushSetup, setRushSetup] = useState(() => defaultRushSetup(courseId));
  const [title, setTitle] = useState('');
  const [speedInfluencePercent, setSpeedInfluencePercent] = useState(20);
  const [playerDisplayMode, setPlayerDisplayMode] = useState('codeName');
  // The teacher's reward choice, remembered in this browser: a teacher who
  // gives the top three a Practice Pass usually does so every period.
  const [rewardChoice, setRewardChoiceState] = useState(() => {
    try { return normalizeChallengeRewardChoice(JSON.parse(window.localStorage.getItem('mathmaster.liveChallenge.rewardChoice') || 'null') || DEFAULT_CHALLENGE_REWARD_CHOICE); } catch { return DEFAULT_CHALLENGE_REWARD_CHOICE; }
  });
  const setRewardChoice = (next) => {
    const normalized = normalizeChallengeRewardChoice(next);
    setRewardChoiceState(normalized);
    try { window.localStorage.setItem('mathmaster.liveChallenge.rewardChoice', JSON.stringify(normalized)); } catch { /* private mode: not remembered */ }
  };
  const [warmupAssignmentId, setWarmupAssignmentId] = useState('');
  const [warmupDeliveryMode, setWarmupDeliveryMode] = useState('liveChallenge');
  const [roomId, setRoomId] = useState(null);
  const [room, setRoom] = useState(null);
  // The room listener answered and the room does not exist (a stale pointer).
  const [roomMissing, setRoomMissing] = useState(false);
  const [players, setPlayers] = useState([]);
  const [diagnostics, setDiagnostics] = useState([]);
  // Player key -> student name, for this console only (never the projector).
  const [rosterNames, setRosterNames] = useState(null);
  const [showAliases, setShowAliases] = useState(false);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [busy, setBusy] = useState('');
  const controlLockRef = useRef(false);
  const [message, setMessage] = useState('');
  // "Reconnected to your game" after a refresh or a dropped connection.
  const [recoveredNotice, setRecoveredNotice] = useState('');
  // Which destructive action is waiting for the teacher to confirm it.
  const [confirming, setConfirming] = useState(null);
  const [projector, setProjector] = useState(false);
  const [dryRunOpen, setDryRunOpen] = useState(false);
  const audioDirectorRef = useRef(null);
  if (!audioDirectorRef.current) audioDirectorRef.current = new LiveChallengeAudioDirector();
  const [audioMix, setAudioMix] = useState(() => audioDirectorRef.current.getMix());
  const [audioReady, setAudioReady] = useState(false);
  // The stage re-derives at its own boundaries (countdown steps, start, GO,
  // deadline); clocks tick in their own components. Nothing here re-renders
  // the whole console four times a second any more.
  const clock = useChallengeClock(room, clockOffsetMs);
  const stage = room ? clock.stage : null;
  const roomIdRef = useLatest(roomId);

  useEffect(() => () => audioDirectorRef.current?.dispose(), []);
  useEffect(() => {
    if (!classId && classOptions.length) setClassId(classOptions[0].classId);
    if (classId && !classOptions.some((entry) => entry.classId === classId)) setClassId(classOptions[0]?.classId || '');
  }, [classOptions, classId]);
  useEffect(() => {
    const resolved = selectedClass?.course || courseProfiles?.[classPeriod]?.course || 'algebra1';
    setCourseId(resolved);
    setStandardCode('mixed');
  }, [classId, classPeriod, selectedClass, courseProfiles]);
  useEffect(() => { setDryRunOpen(false); }, [classId, courseId, standardCode, questionStyle, challengeMode, solverRaceFocus, solverRaceDifficulty, roundCount, roundSeconds, timingMode, speedInfluencePercent, playerDisplayMode]);
  // A different course starts from that course's rush preset.
  useEffect(() => { setRushSetup(defaultRushSetup(courseId)); }, [courseId]);
  useEffect(() => {
    const selected = assignments.find((assignment) => String(assignment.id) === String(warmupAssignmentId));
    const configured = selected?.warmup?.liveChallenge?.deliveryMode;
    setWarmupDeliveryMode(['liveChallenge', 'teacherChoice', 'standard'].includes(configured) ? configured : 'liveChallenge');
  }, [warmupAssignmentId, assignments]);
  useEffect(() => {
    let alive = true;
    setCoverage(null);
    fetchPathCoverage(courseId).then((value) => { if (alive) setCoverage(value); });
    return () => { alive = false; };
  }, [courseId]);

  // HOST RECOVERY. The server keeps one active-room pointer per teacher while
  // a game is in its lobby or running: a refresh, a second device or a dropped
  // connection reopens that game — the match is never restarted, the clock
  // never reset. A finished game has no pointer, so this tab remembers the
  // room it last hosted and reopens its results after a refresh.
  const sessionRestoreTriedRef = useRef(false);
  // A create in flight sets the active pointer before it returns; that new
  // room is not a "reconnect", and create opens it itself.
  const creatingRef = useRef(false);
  // Room ids the server no longer has: never reopened from a stale pointer.
  const missingRoomsRef = useRef(new Set());
  useEffect(() => watchTeacherActiveChallenge(signedInEmail, (active) => {
    if (roomIdRef.current || creatingRef.current) return;
    if (active?.roomId && !missingRoomsRef.current.has(active.roomId)) {
      setRoomId(active.roomId);
      setRecoveredNotice('Reconnected to your live game. It kept running while you were away — nothing was restarted.');
      return;
    }
    if (sessionRestoreTriedRef.current) return;
    sessionRestoreTriedRef.current = true;
    const remembered = rememberedHostedRoom();
    if (remembered) setRoomId(remembered);
  }), [signedInEmail, roomIdRef]);
  useEffect(() => {
    // Each room starts from nothing; the previous game's state never shows in it.
    setRoom(null);
    setRoomMissing(false);
    setPlayers([]);
    setDiagnostics([]);
    setRosterNames(null);
    setShowAliases(false);
    if (!roomId) return undefined;
    rememberHostedRoom(roomId);
    return watchLiveChallengeRoom(roomId, (next) => {
      setRoomMissing(!next);
      setRoom((current) => acceptChallengeSnapshot(current, next));
    }, (error) => setMessage(error?.message || 'Could not load the Live Challenge.'));
  }, [roomId]);
  // CLOCK CALIBRATION, only while the game can still need a clock: the lobby
  // (its first countdown) and the rounds. A finished game stops calling.
  const roomLive = room?.status === 'lobby' || room?.status === 'running';
  useEffect(() => {
    if (!roomId || !roomLive) return undefined;
    let stopped = false;
    const sample = async () => {
      const samples = [];
      for (let index = 0; index < 5; index += 1) {
        const clientSentAt = Date.now();
        // eslint-disable-next-line no-await-in-loop
        const reply = await calibrateLiveChallengeClock({ roomId });
        samples.push({ clientSentAt, clientReceivedAt: Date.now(), serverAt: reply.serverAt });
      }
      if (!stopped) setClockOffsetMs(calibrateChallengeClock(samples).offsetMs);
    };
    sample().catch(() => {});
    const timer = window.setInterval(() => { sample().catch(() => {}); }, 30000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [roomId, roomLive]);
  useEffect(() => {
    if (!roomId) { setDiagnostics([]); return undefined; }
    return watchLiveChallengeDiagnostics(roomId, setDiagnostics, () => setDiagnostics([]));
  }, [roomId]);
  useEffect(() => {
    if (!roomId) { setPlayers([]); return undefined; }
    return watchLiveChallengePlayers(roomId, setPlayers, (error) => setMessage(error?.message || 'Could not load Live Challenge players.'));
  }, [roomId]);
  // The names behind the game aliases, once per room, for this console.
  useEffect(() => {
    if (!roomId || !roomLive) return undefined;
    let cancelled = false;
    getLiveChallengeHostRoster({ roomId })
      .then((reply) => { if (!cancelled) setRosterNames(Array.isArray(reply?.players) ? reply.players : []); })
      .catch(() => { if (!cancelled) setRosterNames([]); });
    return () => { cancelled = true; };
  }, [roomId, roomLive]);
  // A recovery notice is news for a moment, not a fixture.
  useEffect(() => {
    if (!recoveredNotice) return undefined;
    const timer = window.setTimeout(() => setRecoveredNotice(''), 8000);
    return () => window.clearTimeout(timer);
  }, [recoveredNotice]);

  const coverageRows = useMemo(() => summarizeCoverage(coverage || {}, { onlyGaps: false }).filter((row) => row.studentReady), [coverage]);
  // In-progress points are shown only while the round is taking answers: past
  // the deadline the board is banked scores only (no phantom "working" points).
  const activeRound = stage === CHALLENGE_STAGE.ROUND_ACTIVE ? Number(room.currentRound) : null;
  const scoringStrategyId = room?.scoringStrategyId || null;
  // Ranked the way this room's scoring strategy ranks a match.
  const leaderboard = useMemo(
    () => publicLeaderboard(players, { activeRound, ...leaderboardOptionsFor(scoringStrategyId) }),
    [players, activeRound, scoringStrategyId],
  );
  const joinedCount = leaderboard.length;
  const rushMode = challengeMode === RUSH_MODE_ID;
  const rushProblem = rushMode ? rushConfigProblem(rushSetup) : null;
  const rushRoom = room?.challengeMode === RUSH_MODE_ID;
  const questionSetRoom = roomRunsQuestionSets(room);
  const currentRound = Number(room?.currentRound);
  const roundOpen = stageHasOpenRound(stage);
  // Who has finished the current round. A classic round: they answered it. A
  // question-set round is every player's own work against the clock, so it
  // finishes on the deadline.
  const finishedKeys = useMemo(() => new Set(roundOpen && !questionSetRoom
    ? players.filter((player) => player?.joined !== false && Number(player.answeredRound) === currentRound).map((player) => String(player.playerKey))
    : []), [players, roundOpen, questionSetRoom, currentRound]);
  const answeredCount = finishedKeys.size;
  const controlBusy = LIFECYCLE_CONTROLS.includes(busy);
  const presentation = useMemo(() => scorePresentation({ scoringStrategyId, questionSet: questionSetRoom }), [scoringStrategyId, questionSetRoom]);
  const roster = useMemo(() => hostRoster({
    roster: rosterNames,
    players,
    diagnostics,
    roundIndex: roundOpen ? currentRound : null,
    finishedKeys,
    nowMs: Date.now() + clockOffsetMs,
  }), [rosterNames, players, diagnostics, roundOpen, currentRound, finishedKeys, clockOffsetMs]);

  // THE RESULTS MOMENT reads the round's own result document: the round's
  // table and the standings it left, written in the commit that closed it.
  const showingResults = stage === CHALLENGE_STAGE.ROUND_RESULTS;
  const roundSummary = useRoundSummary(roomId, Number.isInteger(currentRound) ? currentRound : null, showingResults);
  const previousSummary = usePreviousRoundSummary(roomId, Number.isInteger(currentRound) ? currentRound : null, showingResults);
  const roundView = useMemo(() => (showingResults ? roundResultsView({ summary: roundSummary, previousSummary }) : null), [showingResults, roundSummary, previousSummary]);
  const finalRewards = useMemo(() => (stage === CHALLENGE_STAGE.COMPLETED ? placementRewardsFor(standingsRows(leaderboard), room?.rewardSummary) : null), [stage, leaderboard, room?.rewardSummary]);

  // HOST AUDIO follows the room on its own timer: the countdown ticks and the
  // buzzer need the clock four times a second, the console does not.
  const audioInputs = useLatest({ room, leaderboard, clockOffsetMs });
  useEffect(() => {
    if (!room) return undefined;
    const syncAudio = () => {
      const { room: current, leaderboard: board, clockOffsetMs: offset } = audioInputs.current;
      if (!current) return;
      const serverNow = Date.now() + offset;
      audioDirectorRef.current?.sync({ room: current, leaderboard: board, remainingMs: cueRemainingMs(current, serverNow), nowMs: serverNow });
    };
    syncAudio();
    if (room.status !== 'running') return undefined;
    const timer = window.setInterval(syncAudio, 250);
    return () => window.clearInterval(timer);
  }, [room, leaderboard, audioInputs]);

  const [report, setReport] = useState(null);
  useEffect(() => {
    const finishedRoomId = room?.roomId || room?.id;
    if (room?.status !== 'finished' || !finishedRoomId) { setReport(null); return undefined; }
    let cancelled = false;
    readChallengeReport(finishedRoomId)
      .then((value) => { if (!cancelled) setReport(value); })
      .catch(() => { if (!cancelled) setReport(null); });
    return () => { cancelled = true; };
  }, [room?.status, room?.roomId, room?.id]);

  const warmupAssignmentOptions = useMemo(() => (Array.isArray(assignments) ? assignments : [])
    .filter((assignment) => assignment?.warmup?.enabled !== false)
    .filter((assignment) => {
      const ids = Array.isArray(assignment?.assignedClassIds) ? assignment.assignedClassIds : [];
      return !classId || ids.length === 0 || ids.includes(classId);
    })
    .slice(0, 60), [assignments, classId]);

  const run = async (key, task) => {
    setBusy(key);
    setMessage('');
    try { return await task(); }
    catch (error) { setMessage(error?.message || 'Live Challenge action failed.'); return null; }
    finally { setBusy(''); }
  };

  const updateAudioMix = (patch) => setAudioMix(audioDirectorRef.current.setMix(patch));
  const enableAudio = async () => {
    await audioDirectorRef.current.prime();
    setAudioReady(true);
    if (room) {
      const serverNow = Date.now() + clockOffsetMs;
      audioDirectorRef.current.sync({ room, leaderboard, remainingMs: cueRemainingMs(room, serverNow), nowMs: serverNow });
    }
  };

  const changeWarmupDeliveryMode = async (nextMode) => {
    setWarmupDeliveryMode(nextMode);
    if (!warmupAssignmentId) return;
    await run('saveWarmupDelivery', async () => {
      await setWarmupChallengeDelivery(warmupAssignmentId, { deliveryMode: nextMode, teacherDecision: null });
      if (nextMode === 'teacherChoice') setMessage('Teacher Choice is active. Students in the Warm-Up window will wait until you create the challenge or release the standard Warm-Up.');
      if (nextMode === 'liveChallenge') setMessage('This assignment will use Live Challenge as its Warm-Up when you open the lobby.');
      if (nextMode === 'standard') setMessage('The standard assignment Warm-Up is active.');
      return true;
    });
  };

  const useStandardWarmup = async () => run('standardWarmup', async () => {
    if (!warmupAssignmentId) throw new Error('Choose the assignment whose Warm-Up should be released.');
    await setWarmupChallengeDelivery(warmupAssignmentId, {
      deliveryMode: warmupDeliveryMode === 'teacherChoice' ? 'teacherChoice' : 'standard',
      teacherDecision: warmupDeliveryMode === 'teacherChoice' ? 'standard' : null,
    });
    setMessage('Students will use the standard Warm-Up for this assignment. No Live Challenge lobby was created.');
    return true;
  });
  const create = async () => {
    audioDirectorRef.current.prime().then(() => setAudioReady(true)).catch(() => {});
    creatingRef.current = true;
    const result = await run('create', async () => {
      if (rushMode) {
        // Graph Feature Rush: no Warm-Up link, no bank question style, no
        // speed setting — the mode's own settings, validated again by the server.
        if (rushProblem) throw new Error(rushProblem);
        let created;
        try {
          created = await createLiveChallenge({
            classId,
            classPeriod,
            courseId,
            // The same Rewards choice as every Live Challenge.
            ...rushCreateRequest(rushSetup, { rewardPolicy: buildChallengeRewardPolicy(rewardChoice) }),
            title: title.trim() || `${selectedClass?.name || classPeriod || 'Class'} Graph Feature Rush`,
          });
        } catch (error) {
          const activeRoomId = error?.details?.roomId;
          if (String(error?.code || '').endsWith('failed-precondition') && activeRoomId) {
            setRoomId(activeRoomId);
            setMessage('You already have an active Live Challenge. It has been reopened.');
            return { roomId: activeRoomId, resumed: true };
          }
          throw error;
        }
        if (!created?.roomId || created.resumed) return created;
        try {
          await configureLiveChallengeExperience({ roomId: created.roomId, speedInfluencePercent: 0, playerDisplayMode });
        } catch (configurationError) {
          await cancelLiveChallenge({ roomId: created.roomId }).catch(() => {});
          throw new Error(`The lobby was cancelled because its name settings could not be secured. ${configurationError?.message || ''}`.trim());
        }
        return created;
      }
      if (warmupAssignmentId && warmupDeliveryMode === 'standard') {
        throw new Error('This assignment is set to Standard Warm-Up. Use “Use Standard Warm-Up” below, or change the delivery mode before creating a lobby.');
      }
      if (warmupAssignmentId && onLinkWarmupChallenge) {
        await onLinkWarmupChallenge(warmupAssignmentId, { roundCount, roundSeconds, standardCode });
        await setWarmupChallengeDelivery(warmupAssignmentId, { deliveryMode: warmupDeliveryMode, teacherDecision: 'challenge' });
      }
      let created;
      try {
        created = await createLiveChallenge({
          classId,
          classPeriod,
          courseId,
          standardCode,
          questionStyle,
          challengeMode,
          solverRaceFocus,
          solverRaceDifficulty,
          roundCount,
          roundSeconds,
          timingMode,
          roundClosingThreshold,
          secondChanceMode,
          assignmentId: warmupAssignmentId || null,
          title: title.trim() || `${selectedClass?.name || classPeriod || 'Class'} Live Challenge`,
          // Null keeps the server's default (Class Points achievements only).
          rewardPolicy: buildChallengeRewardPolicy(rewardChoice),
        });
      } catch (error) {
        const activeRoomId = error?.details?.roomId;
        if (String(error?.code || '').endsWith('failed-precondition') && activeRoomId) {
          setRoomId(activeRoomId);
          setMessage('You already have an active Live Challenge. It has been reopened.');
          return { roomId: activeRoomId, resumed: true };
        }
        throw error;
      }
      if (!created?.roomId) return created;
      if (created.resumed) return created;
      try {
        await configureLiveChallengeExperience({ roomId: created.roomId, speedInfluencePercent, playerDisplayMode });
      } catch (configurationError) {
        await cancelLiveChallenge({ roomId: created.roomId }).catch(() => {});
        throw new Error(`The lobby was cancelled because its scoring/name settings could not be secured. ${configurationError?.message || ''}`.trim());
      }
      return created;
    });
    creatingRef.current = false;
    if (result?.roomId && !result.resumed) {
      setRoomId(result.roomId);
      if (result.trimmed) setMessage(`The secure bank had ${result.roundCount} unique usable questions for this selection, so MathMaster shortened the game from ${result.requestedRoundCount} rounds.`);
    }
  };

  const control = async (key, action) => {
    if (controlLockRef.current) return null;
    controlLockRef.current = true;
    const expectation = ROUND_SCOPED_CONTROLS.includes(key) && room?.status === 'running'
      ? { expectedRoundIndex: Number(room.currentRound), expectedRoundVersion: Number(room.roundVersion) || 0 }
      : {};
    try { return await run(key, () => action({ roomId, ...expectation })); }
    finally { controlLockRef.current = false; }
  };
  const changeClosingThreshold = async (value) => {
    const threshold = value === 'off' ? null : Number(value);
    setRoundClosingThreshold(threshold);
    if (roomId) await run('threshold', () => updateLiveChallengePacing({ roomId, roundClosingThreshold: threshold }));
  };
  const startFromProjector = async () => {
    // The click is also the browser gesture that unlocks host audio. Starting
    // still uses the same authorized callable as the normal teacher control.
    try { await enableAudio(); } catch { /* the game can start without audio */ }
    return control('start', startLiveChallenge);
  };

  // ROUND PACING. A round ends on the server's terms — every player has
  // finished, or the deadline has passed — and this console then closes it
  // with the same idempotent, round-scoped close the teacher can press. After
  // the deadline it first waits out the arrival grace (an answer sent at 0:00
  // still counts); when everyone finished early it waits a moment so the last
  // answer's feedback is seen. Every mode then shows the round's results, and
  // the next round starts only when the teacher presses Next Round. Several
  // open host screens all send the close: the first closes it, the rest are
  // told it is already closed.
  const roundKey = room && roundOpen ? `${room.roomId || roomId}-${room.currentRound}-${room.roundVersion || 0}` : '';
  const everyoneFinished = roundOpen && !questionSetRoom && joinedCount > 0 && answeredCount >= joinedCount;
  const [allFinishedSince, setAllFinishedSince] = useState({ key: '', at: null });
  useEffect(() => {
    if (!everyoneFinished || !roundKey) return;
    setAllFinishedSince((current) => (current.key === roundKey && current.at !== null ? current : { key: roundKey, at: Date.now() + clockOffsetMs }));
  }, [everyoneFinished, roundKey, clockOffsetMs]);
  const closeDue = room ? roundCloseDue({
    room,
    joinedCount,
    finishedCount: answeredCount,
    allFinishedSinceMs: everyoneFinished && allFinishedSince.key === roundKey ? allFinishedSince.at : null,
  }) : null;
  const autoClosedRef = useRef('');
  const [closeRetry, setCloseRetry] = useState(0);
  useEffect(() => {
    if (!closeDue || !roundKey) return undefined;
    const key = `${roundKey}:${closeDue.reason}`;
    if (autoClosedRef.current === key) return undefined;
    const timer = window.setTimeout(() => {
      autoClosedRef.current = key;
      control('close', closeRoundOnTime).then((result) => {
        if (result) return;
        // Not closed: another command held the console's lock, or the server
        // says the round is still running. Look again in a moment.
        window.setTimeout(() => {
          if (autoClosedRef.current === key) autoClosedRef.current = '';
          setCloseRetry((value) => value + 1);
        }, 3_000);
      });
    }, Math.max(0, closeDue.dueAtMs - (Date.now() + clockOffsetMs)));
    return () => window.clearTimeout(timer);
    // `control` reads the round it closes from the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeDue?.dueAtMs, closeDue?.reason, roundKey, closeRetry]);

  // A room id the server no longer has (a stale pointer or remembered room) is
  // dropped, once, and never reopened by the pointer listener.
  useEffect(() => {
    if (!roomMissing || !roomId) return;
    missingRoomsRef.current.add(roomId);
    forgetHostedRoom();
    setRoomId(null);
    setMessage('That Live Challenge is no longer available. Set up a new one below.');
  }, [roomMissing, roomId]);

  // PLAY AGAIN: a fresh match with this room's settings (challengeReplayModel)
  // and the Rewards choice on this device. A new room id is a new match — new
  // receipts, rounds, clock and reward identities — and the class's invites
  // move to it, so every student's screen follows into the new lobby.
  const playAgain = async () => {
    if (!room || busy) return null;
    const request = replayRequestFromRoom(room, { rewardPolicy: buildChallengeRewardPolicy(rewardChoice) });
    if (!request) {
      setMessage('This game cannot be replayed automatically. Choose New Challenge to set one up.');
      return null;
    }
    creatingRef.current = true;
    const result = await run('replay', async () => {
      let created;
      try {
        created = await createLiveChallenge(request);
      } catch (error) {
        const activeRoomId = error?.details?.roomId;
        if (String(error?.code || '').endsWith('failed-precondition') && activeRoomId) return { roomId: activeRoomId, resumed: true };
        throw error;
      }
      if (!created?.roomId) return created;
      try {
        await configureLiveChallengeExperience({ roomId: created.roomId, ...replayExperienceFromRoom(room) });
      } catch (configurationError) {
        await cancelLiveChallenge({ roomId: created.roomId }).catch(() => {});
        throw new Error(`The new lobby was cancelled because its name settings could not be secured. ${configurationError?.message || ''}`.trim());
      }
      return created;
    });
    creatingRef.current = false;
    if (!result?.roomId) return null;
    setReport(null);
    setRoomId(result.roomId);
    if (result.resumed) setMessage('You already have an active Live Challenge. It has been reopened.');
    else if (result.trimmed) setMessage(`The secure bank had ${result.roundCount} unique usable questions for this selection, so MathMaster shortened the game from ${result.requestedRoundCount} rounds.`);
    return result;
  };

  // Back to the setup panel with this browser's settings still filled in.
  const newChallenge = () => {
    forgetHostedRoom();
    setProjector(false);
    setRoomId(null);
    setRoom(null);
    setPlayers([]);
    setTitle('');
    setMessage('');
  };

  const forceCloseRound = (payload) => closeLiveChallengeRound({ ...payload, force: true });
  const stillWorking = Math.max(0, joinedCount - answeredCount);
  // Destructive actions, confirmed once. Harmless ones (Next Round, Start)
  // never ask; the command lock and the round they name stop doubles.
  const CONFIRMATIONS = {
    finish: {
      title: 'End the game now?',
      body: 'Answers already given in this round still count. The final standings use the rounds played so far, and rewards are given from them.',
      confirmLabel: 'End Game',
      run: () => control('finish', finishLiveChallenge),
    },
    cancel: {
      title: 'Cancel this lobby?',
      body: 'Students in the lobby will see that the challenge was cancelled. Nothing is recorded and nobody is rewarded.',
      confirmLabel: 'Cancel Session',
      cancelLabel: 'Keep the lobby',
      run: () => control('cancel', cancelLiveChallenge),
    },
    close: {
      title: 'End this round now?',
      body: questionSetRoom
        ? 'Every student stops where they are; what they have finished counts.'
        : `${stillWorking} ${stillWorking === 1 ? 'student is' : 'students are'} still working. An answer they have not locked in will not count for this round.`,
      confirmLabel: 'End Round Now',
      run: () => control('close', forceCloseRound),
    },
  };
  const confirmation = confirming ? CONFIRMATIONS[confirming] : null;
  const confirmDialog = (
    <ConfirmDialog
      open={Boolean(confirmation)}
      title={confirmation?.title}
      body={confirmation?.body}
      confirmLabel={confirmation?.confirmLabel}
      cancelLabel={confirmation?.cancelLabel || 'Keep playing'}
      busy={controlBusy}
      onCancel={() => setConfirming(null)}
      onConfirm={async () => {
        const action = confirmation;
        setConfirming(null);
        await action?.run();
      }}
    />
  );

  const primaryAction = room ? hostPrimaryAction({ room, stage, joinedCount, finishedCount: answeredCount }) : null;
  // The console's one primary control, by stage. Start and Next Round go
  // through the same command lock and authorized callables as the projector.
  const runPrimaryAction = () => {
    switch (primaryAction?.command) {
      case HOST_COMMAND.START:
        audioDirectorRef.current.prime().then(() => setAudioReady(true)).catch(() => {});
        return control('start', startLiveChallenge);
      case HOST_COMMAND.ADVANCE:
        return control('advance', advanceLiveChallenge);
      case HOST_COMMAND.PLAY_AGAIN:
        return playAgain();
      case HOST_COMMAND.NEW_CHALLENGE:
        return newChallenge();
      default:
        return null;
    }
  };

  // Play Again from the projector keeps the projector — and full screen — up
  // while the new lobby loads.
  if (projector && roomId && !room && !roomMissing) {
    return <ChallengeProjector room={null} loading dialog={confirmDialog} onExit={() => setProjector(false)} />;
  }

  if (!roomId || !room) {
    if (roomId && !roomMissing) {
      return <section aria-busy="true" style={panel}><h2 style={{ margin: 0, fontSize: 22, color: 'var(--mm-text-strong)' }}>Opening your Live Challenge…</h2></section>;
    }
    if (dryRunOpen && rushMode) {
      return (
        <Suspense fallback={<p style={{ padding: 20 }}>Loading practice…</p>}>
          <GraphFeatureRushPractice
            config={rushCreateRequest(rushSetup).graphFeatureRush}
            roundSeconds={rushSetup.roundSeconds}
            onClose={() => setDryRunOpen(false)}
          />
        </Suspense>
      );
    }
    if (dryRunOpen) {
      return (
        <div style={{ display: 'grid', gap: 18 }}>
          <div>
            <h2 style={{ margin: 0 }}>Live Challenge dry run</h2>
            <p style={{ color: '#5f6368', maxWidth: 820, lineHeight: 1.55 }}>{courseLabel(courseId)} · {standardCode === 'mixed' ? 'Mixed review' : standardCode} · {questionStyle === 'tools' ? 'Interactive tools only' : questionStyle === 'noTools' ? 'Typed and chosen answers only' : 'Any question'} · {roundCount} rounds · {timingMode === 'pace' ? 'Pace Race · unlimited solving time' : `${roundSeconds}s each`}.</p>
          </div>
          <ScoringCompetitionCard roundSeconds={roundSeconds} speedInfluencePercent={speedInfluencePercent} />
          <ChallengeDryRun
            courseId={courseId}
            standardCode={standardCode}
            questionStyle={questionStyle}
            challengeMode={challengeMode}
            solverRaceFocus={solverRaceFocus}
            solverRaceDifficulty={solverRaceDifficulty}
            roundCount={roundCount}
            roundSeconds={roundSeconds}
            timingMode={timingMode}
            speedInfluencePercent={speedInfluencePercent}
            title={title.trim() || `${selectedClass?.name || classPeriod || 'Class'} Live Challenge`}
            onClose={() => setDryRunOpen(false)}
          />
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <div>
          <h2 style={{ margin: 0 }}>Live Challenge</h2>
          <p style={{ color: '#5f6368', maxWidth: 850, lineHeight: 1.55 }}>Launch a fast class competition using the same secure question bank and interactive graders as My Math Path. Correctness remains the main source of points; you choose how much speed matters and what names students see.</p>
        </div>
        <section style={panel}>
          <h3 style={{ marginTop: 0 }}>Create a challenge</h3>
          {classOptions.length === 0 ? (
            <p style={{ color: '#a50e0e' }}>No students are currently assigned to an active Algebra I or Algebra II class, so there is nobody to invite yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
              <label style={{ fontWeight: 800 }}>Class
                <select value={classId} onChange={(event) => setClassId(event.target.value)} style={field}>
                  {classOptions.map((entry) => <option key={entry.classId} value={entry.classId}>{entry.name || entry.period || entry.classId}{entry.period ? ` · ${entry.period}` : ''}</option>)}
                </select>
              </label>
              {!rushMode && <label style={{ fontWeight: 800 }}>Run as a Warm-Up
                <select value={warmupAssignmentId} onChange={(event) => setWarmupAssignmentId(event.target.value)} style={field}>
                  <option value="">No — students join from their dashboard</option>
                  {warmupAssignmentOptions.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title || assignment.id}</option>)}
                </select>
                {/* WHAT REACHES THE GRADEBOOK. A teacher choosing to run the
                    game as a Warm-Up is choosing what gets recorded, and the
                    answer is not obvious: the academic credit is participation
                    and accuracy, while the competition score stays a game
                    result. Without this sentence the setting looks like it
                    might put a leaderboard position into the gradebook. */}
                <span style={{ display: 'block', marginTop: 6, fontWeight: 500, fontSize: 13, color: '#5f6368' }}>
                  Students who open that assignment during its Warm-Up window are put straight into the
                  game — no invite to spot and no code to type. Their participation and accuracy are
                  recorded on the assignment; the challenge score is not.
                </span>
              </label>}
              {!rushMode && warmupAssignmentId && (
                <label style={{ fontWeight: 800 }}>Warm-Up delivery
                  <select value={warmupDeliveryMode} disabled={busy === 'saveWarmupDelivery'} onChange={(event) => changeWarmupDeliveryMode(event.target.value)} style={field}>
                    <option value="liveChallenge">Live Challenge — use game as Warm-Up</option>
                    <option value="teacherChoice">Teacher Choice — decide that day</option>
                    <option value="standard">Standard — use assignment questions</option>
                  </select>
                  <span style={{ display: 'block', marginTop: 6, fontWeight: 500, fontSize: 12, color: '#5f6368' }}>Teacher Choice is saved immediately and holds students on a waiting screen until you create the challenge or release the standard Warm-Up.</span>
                </label>
              )}
              <label style={{ fontWeight: 800 }}>Course<input value={courseLabel(courseId)} readOnly style={{ ...field, background: '#f8f9fa', color: '#3c4043' }} /></label>
              <label style={{ fontWeight: 800 }}>Game type
                <select value={challengeMode} onChange={(event) => setChallengeMode(event.target.value)} style={field}>
                  <option value="standard">Standard Challenge</option>
                  <option value="solverRace">Solver Race</option>
                  <option value={RUSH_MODE_ID}>Graph Feature Rush</option>
                </select>
                {rushMode && <span style={{ display: 'block', marginTop: 6, fontWeight: 500, fontSize: 12, color: '#5f6368' }}>Every student gets their own graphs and races the clock to tap intercepts, vertices, maximums and minimums.</span>}
              </label>
              {challengeMode === 'solverRace' && <label style={{ fontWeight: 800 }}>Race focus
                <select value={solverRaceFocus} onChange={(event) => setSolverRaceFocus(event.target.value)} style={field}>
                  <option value="mixed">Mixed Solver Race</option>
                  <option value="linearEquation">Linear Equations</option>
                  <option value="literalEquation">Literal Equations</option>
                  <option value="linearInequality">Linear Inequalities</option>
                  <option value="absoluteValueEquation">Absolute Value Equations</option>
                  <option value="absoluteValueInequality">Absolute Value Inequalities</option>
                </select>
                <span style={{ display: 'block', marginTop: 6, fontWeight: 500, fontSize: 12, color: '#5f6368' }}>Linear Equations → Literal Equations → Linear Inequalities → Absolute Value Equations → Absolute Value Inequalities.</span>
              </label>}
              {challengeMode === 'solverRace' && <label style={{ fontWeight: 800 }}>Difficulty
                <select value={solverRaceDifficulty} onChange={(event) => setSolverRaceDifficulty(event.target.value)} style={field}>
                  <option value="ramp">Ramp Up</option>
                  <option value="foundation">Foundation</option>
                  <option value="developing">Developing</option>
                  <option value="advanced">Advanced</option>
                  <option value="challenge">Challenge</option>
                </select>
              </label>}
              {challengeMode === 'standard' && <>
              <label style={{ fontWeight: 800 }}>Skill set
                <select value={standardCode} onChange={(event) => setStandardCode(event.target.value)} style={field}>
                  <option value="mixed">Mixed review — {courseLabel(courseId)}</option>
                  {coverageRows.map((row) => <option key={row.displayCode} value={row.displayCode}>{row.displayCode} · {row.issuableCount} usable families</option>)}
                </select>
              </label>
              </>}
              {challengeMode === 'standard' && <label style={{ fontWeight: 800 }}>Question style
                <select value={questionStyle} onChange={(event) => setQuestionStyle(event.target.value)} style={field}>
                  <option value="any">Any question</option>
                  <option value="tools">Interactive tools only</option>
                  <option value="noTools">Typed and chosen answers only</option>
                </select>
              </label>}
              {rushMode && (
                <Suspense fallback={<p style={{ gridColumn: '1 / -1', color: '#5f6368' }}>Loading Graph Feature Rush settings…</p>}>
                  <GraphFeatureRushSetup setup={rushSetup} onChange={setRushSetup} classSize={allStudents.filter((student) => student?.classId === classId).length} onPractice={() => { setMessage(''); setDryRunOpen(true); }} />
                </Suspense>
              )}
              {!rushMode && <>
              <label style={{ fontWeight: 800 }}>Rounds<select value={roundCount} onChange={(event) => setRoundCount(Number(event.target.value))} style={field}>{[5, 8, 10, 12, 15, 20].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
              <label style={{ fontWeight: 800, opacity: timingMode === 'pace' ? 0.55 : 1 }}>Time per round
                <select
                  value={roundSeconds}
                  disabled={timingMode === 'pace'}
                  aria-disabled={timingMode === 'pace'}
                  onChange={(event) => setRoundSeconds(Number(event.target.value))}
                  style={{ ...field, cursor: timingMode === 'pace' ? 'not-allowed' : 'pointer' }}
                >
                  {[20, 30, 45, 60, 90].map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
                </select>
                {timingMode === 'pace' && <span style={{ display: 'block', marginTop: 6, fontWeight: 500, fontSize: 12, color: '#5f6368' }}>Disabled in Pace Race. Students have unlimited solving time until the closing threshold starts the separate closing countdown.</span>}
              </label>
              <label style={{ fontWeight: 800 }}>Race clock
                <select value={timingMode} onChange={(event) => setTimingMode(event.target.value)} style={field}>
                  <option value="timed">Timed Race</option><option value="pace">Pace Race · unlimited solving time</option>
                </select>
              </label>
              <label style={{ fontWeight: 800 }}>Round closing threshold
                <select value={roundClosingThreshold ?? 'off'} onChange={(event) => changeClosingThreshold(event.target.value)} style={field}>
                  <option value="off">Off</option>{[60, 70, 80, 90, 100].map((value) => <option key={value} value={value}>{value}%</option>)}
                </select>
                <span style={{ display: 'block', marginTop: 6, fontWeight: 500, fontSize: 12, color: '#5f6368' }}>When this percentage of joined students has submitted, the round enters its closing phase.</span>
              </label>
              <label style={{ fontWeight: 800 }}>Second Chance
                <select value={secondChanceMode} onChange={(event) => setSecondChanceMode(event.target.value)} style={field}>
                  <option value="off">Off</option><option value="automatic">Automatic</option>
                </select>
                <span style={{ display: 'block', marginTop: 6, fontWeight: 500, fontSize: 12, color: '#5f6368' }}>Automatic may add up to 3 replay Final Rounds based on the questions the class misses most.</span>
              </label>
              </>}
              <label style={{ fontWeight: 800 }}>Player display
                <select value={playerDisplayMode} onChange={(event) => setPlayerDisplayMode(event.target.value)} style={field}>
                  <option value="codeName">Code Names (default)</option>
                  <option value="firstLastInitial">First Name + Last Initial</option>
                  <option value="firstName">First Name</option>
                  <option value="fullName">Full Name</option>
                </select>
                <span style={{ display: 'block', marginTop: 6, fontWeight: 500, fontSize: 12, color: '#5f6368' }}>Only the selected display name is sent to the public leaderboard.</span>
              </label>
              {!rushMode && <label style={{ fontWeight: 800 }}>Speed influence
                <select value={speedPreset(speedInfluencePercent)} onChange={(event) => {
                  const value = event.target.value;
                  if (value !== 'custom') setSpeedInfluencePercent(Number(value));
                  else if ([0, 10, 20, 35].includes(speedInfluencePercent)) setSpeedInfluencePercent(25);
                }} style={field}>
                  <option value="0">Off · 0%</option>
                  <option value="10">Low · 10%</option>
                  <option value="20">Standard · 20%</option>
                  <option value="35">High · 35%</option>
                  <option value="custom">Custom</option>
                </select>
                {speedPreset(speedInfluencePercent) === 'custom' && <input type="number" min="0" max="50" value={speedInfluencePercent} onChange={(event) => setSpeedInfluencePercent(Math.max(0, Math.min(50, Number(event.target.value) || 0)))} style={field} />}
              </label>}
              <label style={{ fontWeight: 800, gridColumn: '1 / -1' }}>Challenge title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`${selectedClass?.name || classPeriod || 'Class'} ${rushMode ? 'Graph Feature Rush' : 'Live Challenge'}`} style={field} /></label>
            </div>
          )}
          {!rushMode && <ScoringCompetitionCard roundSeconds={roundSeconds} speedInfluencePercent={speedInfluencePercent} />}
          <ChallengeRewardSettings choice={rewardChoice} onChange={setRewardChoice} />
          {!rushMode && <ChallengeQuestionLibrary assignments={assignments} onImported={() => fetchPathCoverage(courseId).then(setCoverage)} />}
          {rushMode ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
              <button type="button" disabled={!classId || busy === 'create' || Boolean(rushProblem)} onClick={create} style={{ ...primary, opacity: !classId || busy === 'create' || rushProblem ? .55 : 1 }}>{busy === 'create' ? 'Creating lobby…' : 'Create Lobby'}</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                <button type="button" disabled={!classId || busy === 'create' || (warmupAssignmentId && warmupDeliveryMode === 'standard')} onClick={create} style={{ ...primary, opacity: !classId || busy === 'create' || (warmupAssignmentId && warmupDeliveryMode === 'standard') ? .55 : 1 }}>{busy === 'create' ? 'Building secure rounds…' : 'Create Lobby'}</button>
                <button type="button" onClick={() => { setMessage(''); setDryRunOpen(true); }} style={secondary}>Try it yourself first</button>
                {warmupAssignmentId && (warmupDeliveryMode === 'teacherChoice' || warmupDeliveryMode === 'standard') && <button type="button" disabled={busy === 'standardWarmup'} onClick={useStandardWarmup} style={{ ...secondary, color: '#137333' }}>{busy === 'standardWarmup' ? 'Releasing Warm-Up…' : 'Use Standard Warm-Up'}</button>}
              </div>
              <p style={{ margin: '8px 0 0', color: '#5f6368', fontSize: 13, lineHeight: 1.5 }}>A dry run uses the real bank, timer and grader without inviting students or writing game results. Creating a Teacher Choice lobby is the class decision to use the challenge.</p>
            </>
          )}
        </section>
        <AudioMixer director={audioDirectorRef.current} mix={audioMix} onMixChange={updateAudioMix} onEnable={enableAudio} audioReady={audioReady} />
        {message && <div role="alert" style={{ padding: 12, borderRadius: 9, background: '#fff4ce', color: '#7a4f00' }}>{message}</div>}
      </div>
    );
  }

  if (projector && ['lobby', 'running', 'finished'].includes(room.status)) {
    return <ChallengeProjector
      room={room}
      leaderboard={leaderboard}
      players={players}
      joinedCount={joinedCount}
      answeredCount={answeredCount}
      clockOffsetMs={clockOffsetMs}
      roundView={roundView}
      presentation={presentation}
      rewardsByKey={finalRewards}
      primaryAction={primaryAction}
      busy={busy}
      controlBusy={controlBusy}
      error={message}
      audioReady={audioReady}
      audioMuted={audioMix.muted}
      onToggleMute={() => updateAudioMix({ muted: !audioMix.muted })}
      onEnableAudio={enableAudio}
      onStart={startFromProjector}
      onAdvance={() => control('advance', advanceLiveChallenge)}
      onPlayAgain={playAgain}
      onNewChallenge={newChallenge}
      onRequestEndGame={() => setConfirming('finish')}
      onRequestEndRound={() => setConfirming('close')}
      onThresholdChange={changeClosingThreshold}
      onExit={() => setProjector(false)}
      dialog={confirmDialog}
    />;
  }

  const lobby = stage === CHALLENGE_STAGE.LOBBY;
  const finished = stage === CHALLENGE_STAGE.COMPLETED;
  const cancelled = stage === CHALLENGE_STAGE.CANCELLED;
  const rewardLines = rewardSummaryLines(room.rewardSummary);
  const gameLabel = projectorGameLabel(room);
  const standingTitle = presentation.placementPoints ? 'Championship' : 'Standings';
  // Ending a round early is for a round in play: not one still counting down,
  // and not one past its buzzer, which closes itself in a moment.
  const secondaryControls = [
    stage === CHALLENGE_STAGE.ROUND_ACTIVE || stage === CHALLENGE_STAGE.ROUND_PAUSED
      ? { key: 'close', label: 'End Round Now', busyLabel: 'Closing…', onClick: () => setConfirming('close') }
      : null,
  ];

  return (
    <div style={{ display: 'grid', gap: 16 }} data-mm-host-console={stage || 'loading'}>
      <ChallengeShellStyles />
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <StagePill stage={stage} />
            <span style={{ color: 'var(--mm-text-muted)', fontWeight: 800 }}>{gameLabel} · {room.classPeriod} · {courseLabel(room.courseId)}{!rushRoom && room.standardCode && room.standardCode !== 'mixed' ? ` · ${room.standardCode}` : ''}</span>
          </div>
          <h2 style={{ margin: '6px 0 0', fontSize: 26, lineHeight: 1.15, color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>{room.title}</h2>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {!cancelled && <button type="button" onClick={() => setProjector(true)} style={primary}>Projector View</button>}
          {lobby && <button type="button" disabled={controlBusy} onClick={() => (joinedCount > 0 ? setConfirming('cancel') : control('cancel', cancelLiveChallenge))} style={{ ...secondary, color: '#a50e0e', opacity: controlBusy ? 0.55 : 1 }}>Cancel Session</button>}
          {(roundOpen || stage === CHALLENGE_STAGE.ROUND_RESULTS) && <button type="button" disabled={controlBusy} onClick={() => setConfirming('finish')} style={{ ...secondary, color: '#a50e0e', opacity: controlBusy ? 0.55 : 1 }}>{busy === 'finish' ? 'Ending…' : 'End Game'}</button>}
        </div>
      </header>
      {recoveredNotice && <div role="status" style={{ padding: 12, borderRadius: 9, background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)', border: '1px solid var(--mm-info-border)', fontWeight: 800 }}>{recoveredNotice}</div>}
      {message && <div role="alert" style={{ padding: 12, borderRadius: 9, background: '#fff4ce', color: '#7a4f00' }}>{message}</div>}

      {lobby && (
        <>
          <section style={{ ...panel, background: '#e8f0fe', borderColor: '#aecbfa', display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, color: '#174ea6' }}>
              <div><div style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Joined</div><div style={{ fontSize: 34, fontWeight: 1000 }}>{joinedCount} / {room.eligibleCount || 0}</div></div>
              <div><div style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Rounds</div><div style={{ fontSize: 34, fontWeight: 1000 }}>{room.roundCount}</div></div>
              {/* A classic round's time is fitted to its question (a one-step
                  question gets less, a multi-step one more); a rush round is
                  exactly this long. */}
              <div><div style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{room.timingMode === 'pace' ? 'Timing' : 'Per round'}</div><div style={{ fontSize: 34, fontWeight: 1000 }}>{room.timingMode === 'pace' ? 'Pace' : `${questionSetRoom ? '' : '~'}${room.roundSeconds}s`}</div>{room.timingMode !== 'pace' && !questionSetRoom && <div style={{ fontSize: 12, fontWeight: 700 }}>fitted to each question</div>}</div>
              <div><div style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Scoring</div><div style={{ fontSize: 22, fontWeight: 1000, marginTop: 6 }}>{presentation.placementPoints ? 'Grand Prix' : presentation.strategyId === 'correctCount' ? 'Correct Count' : 'Points'}</div></div>
            </div>
            <div style={{ color: '#174ea6', lineHeight: 1.5 }}>
              <strong>How students join:</strong> students in {room.className || room.classPeriod || 'this class'} see a Live Challenge card on their MathMaster dashboard — no code to type.{room.assignmentId ? ' Students who open the linked assignment during its Warm-Up are taken straight in.' : ''}
            </div>
            {rushRoom
              ? <div style={{ color: '#3c4043', fontWeight: 800 }}>Graph Feature Rush · {rushSettingsLine(room)}</div>
              : <div style={{ color: '#3c4043', fontWeight: 800 }}>{room.timingMode === 'pace' ? 'Pace Race' : 'Timed Race'} · Closing {room.roundClosingThreshold == null ? 'Off' : `at ${room.roundClosingThreshold}%`} · Second Chance {room.secondChanceMode === 'off' ? 'Off' : 'Automatic'}{room.solverRaceDifficulty === 'ramp' ? ' · Ramp difficulty' : ''}</div>}
            {rewardLines.length > 0 && <div style={{ color: '#3c4043' }}><strong>Rewards:</strong> {rewardLines.join(' · ')}</div>}
            <HostControlBar action={primaryAction} busy={busy} controlBusy={controlBusy} onPrimary={runPrimaryAction} />
          </section>
          <NotJoinedLine roster={roster} />
          <HostRosterPanel roster={roster} stage={stage} title="Players in lobby" showAliases={showAliases} onToggleAliases={setShowAliases} />
        </>
      )}

      {(roundOpen || stage === CHALLENGE_STAGE.ROUND_RESULTS) && (
        <>
          {!rushRoom && stage !== CHALLENGE_STAGE.ROUND_RESULTS && (
            <section style={{ ...panel, padding: 12, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800 }}>{room.roundCount} scheduled rounds · {room.timingMode === 'pace' ? 'Pace Race' : 'Timed Race'} · Second Chance {room.secondChanceMode === 'off' ? 'Off' : 'Automatic'}</span>
              <label style={{ marginLeft: 'auto', fontWeight: 800 }}>Round closing threshold
                <select value={room.roundClosingThreshold ?? 'off'} disabled={busy === 'threshold'} onChange={(event) => changeClosingThreshold(event.target.value)} style={{ ...field, width: 'auto', display: 'inline-block', margin: '0 0 0 8px' }}>
                  <option value="off">Off</option>{[60, 70, 80, 90, 100].map((value) => <option key={value} value={value}>{value}%</option>)}
                </select>
              </label>
            </section>
          )}
          {stage === CHALLENGE_STAGE.COUNTDOWN && (
            <section style={{ ...panel, padding: 8 }}>
              <ChallengeCountdown clock={clock} look="console" title={clock.isReplay ? `Second Chance round ${clock.replayNumber}` : `Round ${clock.roundNumber} of ${clock.roundCount}`} />
            </section>
          )}
          {stage !== CHALLENGE_STAGE.ROUND_RESULTS && (rushRoom
            ? <RushHostStatus room={room} players={players} clockOffsetMs={clockOffsetMs} joinedCount={joinedCount} closing={busy === 'close'} />
            : <ChallengeLiveStatus room={room} clockOffsetMs={clockOffsetMs} answeredCount={answeredCount} joinedCount={joinedCount} />)}
          {stage === CHALLENGE_STAGE.ROUND_RESULTS && (
            <HostRoundResultsPanel view={roundView} presentation={presentation} roundNumber={clock.roundNumber} fallbackRows={standingsRows(leaderboard)} />
          )}
          <section style={{ ...panel, padding: 14 }}>
            <HostControlBar action={primaryAction} busy={busy} controlBusy={controlBusy} onPrimary={runPrimaryAction} secondary={secondaryControls} />
          </section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16, alignItems: 'start' }}>
            {stage !== CHALLENGE_STAGE.ROUND_RESULTS && (
              <section style={panel}>
                <h3 style={{ marginTop: 0 }}>{rushRoom ? 'Live race · graphs this round' : `Live ${standingTitle.toLowerCase()}`}</h3>
                {rushRoom
                  ? <RushRaceBoard players={players} roundIndex={currentRound || 0} />
                  : <Leaderboard rows={leaderboard} presentation={presentation} limit={12} />}
              </section>
            )}
            <HostRosterPanel roster={roster} stage={stage} showAliases={showAliases} onToggleAliases={setShowAliases} />
          </div>
        </>
      )}

      {finished && (
        <>
          <section style={{ ...panel, background: '#e6f4ea', borderColor: '#9bd2aa', display: 'grid', gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 26, color: '#137333' }}>Challenge complete</h2>
              <p style={{ margin: '6px 0 0', color: '#1e4620' }}>Competition points are game results only. Warm-Up academic credit uses participation and mathematical accuracy.</p>
            </div>
            {rewardLines.length > 0 && <div style={{ color: '#1e4620' }}><strong>Rewards from this game:</strong> {rewardLines.join(' · ')}. Each student&apos;s screen shows what reached their wallet.</div>}
            <HostControlBar
              action={primaryAction}
              busy={busy}
              controlBusy={controlBusy}
              onPrimary={runPrimaryAction}
              secondary={[{ key: 'newChallenge', label: 'New Challenge', onClick: newChallenge }]}
            />
            <div style={{ color: '#3c4043', fontSize: 13 }}>Play Again runs {replaySummary(room)}{room.assignmentId ? ' as a standalone game (the Warm-Up keeps this game’s result)' : ''}, with this device&apos;s Rewards choice.</div>
          </section>
          <section style={panel}>
            <h3 style={{ marginTop: 0 }}>Final {standingTitle.toLowerCase()}</h3>
            <StandingsBoard rows={standingsRows(leaderboard)} presentation={presentation} look="console" limit={40} showCorrect={!presentation.placementPoints} rewardsByKey={finalRewards} label="Final standings" />
          </section>
          <ChallengeReport report={report} />
        </>
      )}

      {cancelled && (
        <section style={{ ...panel, display: 'grid', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Challenge cancelled</h3>
          <p style={{ margin: 0, color: '#5f6368' }}>Nothing from this game is recorded, and nobody is rewarded.</p>
          <HostControlBar action={primaryAction} busy={busy} controlBusy={controlBusy} onPrimary={runPrimaryAction} secondary={[{ key: 'sameAgain', label: 'Same Settings Again', onClick: playAgain }]} />
        </section>
      )}

      <details style={{ ...panel, padding: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 900 }}>Game audio{audioMix.muted ? ' · muted' : audioReady ? ' · on' : ' · off'}</summary>
        <div style={{ marginTop: 10 }}>
          <AudioMixer mix={audioMix} onMixChange={updateAudioMix} onEnable={enableAudio} audioReady={audioReady} />
        </div>
      </details>
      {confirmDialog}
    </div>
  );
}
