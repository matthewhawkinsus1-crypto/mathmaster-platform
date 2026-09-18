import { useEffect, useMemo, useRef, useState } from 'react';
import ChallengeDryRun from './ChallengeDryRun.jsx';
import ChallengeQuestionLibrary from './ChallengeQuestionLibrary.jsx';
import LiveChallengeArenaProjector from './LiveChallengeArenaProjector.jsx';
import MathText from '../common/MathText.jsx';
import { fetchPathCoverage } from '../../platform/path/pathCoverageService.js';
import { summarizeCoverage } from '../../../functions/shared/pathCoverage.mjs';
import { challengeCanAdvance, publicLeaderboard } from '../../../functions/shared/liveChallenge.mjs';
import { buildChallengeExport, challengeExportFileName } from '../../../functions/shared/liveChallengeExport.mjs';
import { buildChallengeScoringPreview } from '../../../functions/shared/liveChallengeExperience.mjs';
import { acceptChallengeSnapshot, calibrateChallengeClock } from '../../../functions/shared/liveChallengeParity.mjs';
import { LiveChallengeAudioDirector } from '../../platform/liveChallenge/liveChallengeAudio.js';
import {
  advanceLiveChallenge,
  cancelLiveChallenge,
  calibrateLiveChallengeClock,
  configureLiveChallengeExperience,
  createLiveChallenge,
  finishLiveChallenge,
  readChallengeReport,
  setWarmupChallengeDelivery,
  startLiveChallenge,
  updateLiveChallengePacing,
  timestampMillis,
  watchLiveChallengePlayers,
  watchLiveChallengeDiagnostics,
  watchLiveChallengeRoom,
  watchTeacherActiveChallenge,
} from '../../platform/liveChallenge/liveChallengeService.js';

const panel = { background: '#fff', border: '1px solid #d8dde6', borderRadius: 14, padding: 20, textAlign: 'left' };
const primary = { border: 0, borderRadius: 9, padding: '11px 16px', background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const secondary = { border: '1px solid #b7bec8', borderRadius: 9, padding: '10px 15px', background: '#fff', color: '#3c4043', fontWeight: 900, cursor: 'pointer' };
const field = { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: 10, borderRadius: 8, border: '1px solid #b7bec8' };

function useNow(active = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

const formatClock = (milliseconds) => {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const courseLabel = (courseId) => courseId === 'algebra2' ? 'Algebra II' : 'Algebra I';
const speedPreset = (value) => [0, 10, 20, 35].includes(Number(value)) ? String(Number(value)) : 'custom';

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
      {report.neverJoined?.length > 0 && (
        <div style={{ padding: '10px 13px', borderRadius: 9, background: '#f1f3f4', fontSize: 13.5, color: '#3c4043' }}>
          <strong>Did not join:</strong> {report.neverJoined.length} student{report.neverJoined.length === 1 ? '' : 's'}. A student can be absent, on paper, or have lost their connection — this is a roster fact, not a finding.
        </div>
      )}
    </section>
  );
}

export function Leaderboard({ rows = [], limit = 12, projector = false }) {
  if (!rows.length) return <p style={{ color: '#5f6368', margin: 0 }}>Students who join will appear here.</p>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.slice(0, limit).map((row) => (
        <div key={row.playerKey || row.alias} style={{ display: 'grid', gridTemplateColumns: '42px minmax(0,1fr) auto auto', gap: 10, alignItems: 'center', padding: projector ? '13px 14px' : '9px 11px', borderRadius: 10, background: row.rank <= 3 ? '#fef7e0' : '#f8f9fa', border: '1px solid #e1e5ea', fontSize: projector ? 18 : 14 }}>
          <strong style={{ textAlign: 'center' }}>#{row.rank}</strong>
          <span style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.alias}</span>
          <span style={{ color: '#5f6368' }}>{row.correctCount} ✓</span>
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{(row.liveScore ?? row.score).toLocaleString()}</strong>
        </div>
      ))}
    </div>
  );
}

export function ChallengeLiveStatus({ room, remainingMs, elapsedMs = 0, answeredCount = 0, joinedCount = 0 }) {
  const paceOpen = room?.timingMode === 'pace' && !timestampMillis(room?.roundEndsAt || room?.endsAt);
  const low = !paceOpen && remainingMs <= 10000;
  return (
    <section style={{ ...panel, border: '2px solid #1a73e8' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#174ea6', fontSize: 12, fontWeight: 1000, textTransform: 'uppercase' }}>Round {(room.currentRound || 0) + 1} of {room.roundCount} · {room.currentQuestion?.teksCode || 'Mixed review'}</div>
          <MathText as="div" style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 20, lineHeight: 1.45, fontWeight: 700 }}>{room.currentQuestion?.prompt}</MathText>
        </div>
        <div style={{ minWidth: 140, textAlign: 'center', padding: 12, borderRadius: 12, background: low ? '#fce8e6' : '#e8f0fe', color: low ? '#a50e0e' : '#174ea6' }}>
          <div style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{paceOpen ? 'Elapsed' : 'Time left'}</div>
          <div style={{ fontSize: 38, fontWeight: 1000 }}>{formatClock(paceOpen ? elapsedMs : remainingMs)}</div>
          {room?.timingMode === 'pace' && !paceOpen && <div style={{ marginTop: 4, fontSize: 12, fontWeight: 900 }}>Round closes in {formatClock(remainingMs)}</div>}
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
        {preview.examples.map((example) => <span key={example.secondsUsed} style={{ padding: '6px 9px', borderRadius: 999, background: '#fff' }}>Correct at {example.secondsUsed}s → {example.pointsBeforeStreakComeback.toLocaleString()}</span>)}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.5 }}>{preview.academicCreditNote} Interactive tools may earn partial correctness points as students work.</p>
    </section>
  );
}

function AudioMixer({ director, mix, onMixChange, onEnable, audioReady }) {
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
  const [title, setTitle] = useState('');
  const [speedInfluencePercent, setSpeedInfluencePercent] = useState(20);
  const [playerDisplayMode, setPlayerDisplayMode] = useState('codeName');
  const [warmupAssignmentId, setWarmupAssignmentId] = useState('');
  const [warmupDeliveryMode, setWarmupDeliveryMode] = useState('liveChallenge');
  const [roomId, setRoomId] = useState(null);
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [diagnostics, setDiagnostics] = useState([]);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [projector, setProjector] = useState(false);
  const [dryRunOpen, setDryRunOpen] = useState(false);
  const audioDirectorRef = useRef(null);
  if (!audioDirectorRef.current) audioDirectorRef.current = new LiveChallengeAudioDirector();
  const [audioMix, setAudioMix] = useState(() => audioDirectorRef.current.getMix());
  const [audioReady, setAudioReady] = useState(false);
  const now = useNow(room?.status === 'running');

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
  useEffect(() => watchTeacherActiveChallenge(signedInEmail, (active) => {
    if (active?.roomId && !roomId) setRoomId(active.roomId);
  }), [signedInEmail, roomId]);
  useEffect(() => {
    if (!roomId) { setRoom(null); return undefined; }
    return watchLiveChallengeRoom(roomId, (next) => setRoom((current) => acceptChallengeSnapshot(current, next)), (error) => setMessage(error?.message || 'Could not load the Live Challenge.'));
  }, [roomId]);
  useEffect(() => {
    if (!roomId) return undefined;
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
    const timer = window.setInterval(sample, 30000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [roomId]);
  useEffect(() => {
    if (!roomId) { setDiagnostics([]); return undefined; }
    return watchLiveChallengeDiagnostics(roomId, setDiagnostics, () => setDiagnostics([]));
  }, [roomId]);
  useEffect(() => {
    if (!roomId) { setPlayers([]); return undefined; }
    return watchLiveChallengePlayers(roomId, setPlayers, (error) => setMessage(error?.message || 'Could not load Live Challenge players.'));
  }, [roomId]);

  const coverageRows = useMemo(() => summarizeCoverage(coverage || {}, { onlyGaps: false }).filter((row) => row.studentReady), [coverage]);
  const activeRound = room?.status === 'running' ? Number(room.currentRound) : null;
  const leaderboard = useMemo(() => publicLeaderboard(players, { activeRound }), [players, activeRound]);
  const joinedCount = leaderboard.length;
  const answeredCount = leaderboard.filter((player) => Number(player.answeredRound) === Number(room?.currentRound)).length;
  const roundStartsAtMs = timestampMillis(room?.roundStartedAt || room?.startsAt);
  const roundEndsAtMs = timestampMillis(room?.roundEndsAt || room?.endsAt);
  const serverNow = now + clockOffsetMs;
  const hasRoundDeadline = roundEndsAtMs > 0;
  const elapsedMs = Math.max(0, serverNow - roundStartsAtMs);
  const remainingMs = hasRoundDeadline ? Math.max(0, roundEndsAtMs - serverNow) : 0;
  const canAdvance = challengeCanAdvance({ joinedCount, answeredCount, roundEndsAtMs, nowMs: serverNow });
  const connectionSummary = ['synchronized', 'delayed', 'reconnecting', 'degraded'].map((status) => ({
    status,
    count: diagnostics.filter((entry) => entry.connectionStatus === status).length,
  }));

  useEffect(() => {
    if (!room) return;
    audioDirectorRef.current?.sync({ room, leaderboard, remainingMs, nowMs: serverNow });
  }, [room, leaderboard, remainingMs, serverNow]);

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
    audioDirectorRef.current.sync({ room, leaderboard, remainingMs, nowMs: Date.now() });
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
    const result = await run('create', async () => {
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
    if (result?.roomId && !result.resumed) {
      setRoomId(result.roomId);
      if (result.trimmed) setMessage(`The secure bank had ${result.roundCount} unique usable questions for this selection, so MathMaster shortened the game from ${result.requestedRoundCount} rounds.`);
    }
  };

  const control = async (key, action) => run(key, () => action({ roomId }));
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

  if (!roomId || !room) {
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
              <label style={{ fontWeight: 800 }}>Run as a Warm-Up
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
              </label>
              {warmupAssignmentId && (
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
                </select>
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
              <label style={{ fontWeight: 800 }}>Player display
                <select value={playerDisplayMode} onChange={(event) => setPlayerDisplayMode(event.target.value)} style={field}>
                  <option value="codeName">Code Names (default)</option>
                  <option value="firstLastInitial">First Name + Last Initial</option>
                  <option value="firstName">First Name</option>
                  <option value="fullName">Full Name</option>
                </select>
                <span style={{ display: 'block', marginTop: 6, fontWeight: 500, fontSize: 12, color: '#5f6368' }}>Only the selected display name is sent to the public leaderboard.</span>
              </label>
              <label style={{ fontWeight: 800 }}>Speed influence
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
              </label>
              <label style={{ fontWeight: 800, gridColumn: '1 / -1' }}>Challenge title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`${selectedClass?.name || classPeriod || 'Class'} Live Challenge`} style={field} /></label>
            </div>
          )}
          <ScoringCompetitionCard roundSeconds={roundSeconds} speedInfluencePercent={speedInfluencePercent} />
          <ChallengeQuestionLibrary assignments={assignments} onImported={() => fetchPathCoverage(courseId).then(setCoverage)} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <button type="button" disabled={!classId || busy === 'create' || (warmupAssignmentId && warmupDeliveryMode === 'standard')} onClick={create} style={{ ...primary, opacity: !classId || busy === 'create' || (warmupAssignmentId && warmupDeliveryMode === 'standard') ? .55 : 1 }}>{busy === 'create' ? 'Building secure rounds…' : 'Create Lobby'}</button>
            <button type="button" onClick={() => { setMessage(''); setDryRunOpen(true); }} style={secondary}>Try it yourself first</button>
            {warmupAssignmentId && (warmupDeliveryMode === 'teacherChoice' || warmupDeliveryMode === 'standard') && <button type="button" disabled={busy === 'standardWarmup'} onClick={useStandardWarmup} style={{ ...secondary, color: '#137333' }}>{busy === 'standardWarmup' ? 'Releasing Warm-Up…' : 'Use Standard Warm-Up'}</button>}
          </div>
          <p style={{ margin: '8px 0 0', color: '#5f6368', fontSize: 13, lineHeight: 1.5 }}>A dry run uses the real bank, timer and grader without inviting students or writing game results. Creating a Teacher Choice lobby is the class decision to use the challenge.</p>
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
      joinedCount={joinedCount}
      remainingMs={remainingMs}
      canAdvance={canAdvance}
      busy={busy}
      error={message}
      audioReady={audioReady}
      onEnableAudio={enableAudio}
      onStart={startFromProjector}
      elapsedMs={elapsedMs}
      onAdvance={() => control('advance', advanceLiveChallenge)}
      onThresholdChange={changeClosingThreshold}
      onExit={() => setProjector(false)}
    />;
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div><h2 style={{ margin: 0 }}>{room.title}</h2><p style={{ margin: '6px 0 0', color: '#5f6368' }}>{room.classPeriod} · {courseLabel(room.courseId)} · {room.standardCode === 'mixed' ? 'Mixed review' : room.standardCode}</p></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setProjector(true)} style={primary}>Resume Session</button>
          <button type="button" onClick={() => setProjector(true)} style={secondary}>Projector View</button>
        </div>
      </div>
      <AudioMixer director={audioDirectorRef.current} mix={audioMix} onMixChange={updateAudioMix} onEnable={enableAudio} audioReady={audioReady} />
      {message && <div role="alert" style={{ padding: 12, borderRadius: 9, background: '#fff4ce', color: '#7a4f00' }}>{message}</div>}
      {['lobby', 'running'].includes(room.status) && <section style={{ ...panel, padding: 12, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>{room.roundCount} scheduled rounds · {room.timingMode === 'pace' ? 'Pace Race' : 'Timed Race'} · Closing {room.roundClosingThreshold == null ? 'Off' : `at ${room.roundClosingThreshold}%`} · Second Chance {room.secondChanceMode === 'off' ? 'Off' : 'Automatic'}{room.solverRaceDifficulty === 'ramp' ? ' · Ramp difficulty' : ''}</strong>
        <label style={{ marginLeft: 'auto', fontWeight: 800 }}>Round closing threshold
          <select value={room.roundClosingThreshold ?? 'off'} disabled={busy === 'threshold'} onChange={(event) => changeClosingThreshold(event.target.value)} style={{ ...field, width: 'auto', display: 'inline-block', margin: '0 0 0 8px' }}>
            <option value="off">Off</option>{[60, 70, 80, 90, 100].map((value) => <option key={value} value={value}>{value}%</option>)}
          </select>
        </label>
      </section>}

      {room.status === 'lobby' && (
        <>
          <section style={{ ...panel, background: '#e8f0fe', borderColor: '#aecbfa' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <div><div style={{ color: '#5f6368', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Joined</div><div style={{ fontSize: 32, fontWeight: 1000 }}>{joinedCount} / {room.eligibleCount || 0}</div></div>
              <div><div style={{ color: '#5f6368', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Rounds</div><div style={{ fontSize: 32, fontWeight: 1000 }}>{room.roundCount}</div></div>
              <div><div style={{ color: '#5f6368', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Per round</div><div style={{ fontSize: 32, fontWeight: 1000 }}>{room.roundSeconds}s</div></div>
            </div>
            <p style={{ marginBottom: 0, color: '#174ea6' }}>Students already signed into this class receive the challenge automatically. No join code is required.</p>
          </section>
          <section style={panel}><h3 style={{ marginTop: 0 }}>Players in lobby</h3><Leaderboard rows={leaderboard} /></section>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" disabled={joinedCount < 1 || busy === 'start'} onClick={() => { audioDirectorRef.current.prime().then(() => setAudioReady(true)).catch(() => {}); control('start', startLiveChallenge); }} style={{ ...primary, opacity: joinedCount < 1 || busy === 'start' ? .55 : 1 }}>{busy === 'start' ? 'Starting…' : 'Start Challenge'}</button>
            <button type="button" disabled={busy === 'cancel'} onClick={() => control('cancel', cancelLiveChallenge)} style={{ ...secondary, color: '#a50e0e' }}>Cancel Session</button>
          </div>
        </>
      )}

      {room.status === 'running' && (
        <>
          <section aria-label="Connection status" style={{ ...panel, padding: 12 }}>
            <strong>Class connection: </strong>
            {connectionSummary.map(({ status, count }) => <span key={status} style={{ marginRight: 14 }}>{count} {status === 'delayed' ? 'connection delay / unstable' : status}</span>)}
          </section>
          <ChallengeLiveStatus room={room} remainingMs={remainingMs} elapsedMs={elapsedMs} answeredCount={answeredCount} joinedCount={joinedCount} />
          <section style={panel}><h3 style={{ marginTop: 0 }}>Leaderboard</h3><Leaderboard rows={leaderboard} /></section>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" disabled={!canAdvance || busy === 'advance'} onClick={() => control('advance', advanceLiveChallenge)} style={{ ...primary, opacity: !canAdvance || busy === 'advance' ? .55 : 1 }}>{busy === 'advance' ? 'Loading next round…' : room.secondChanceOf != null ? (room.hasAdditionalReplay ? 'Next Final Round' : 'Finish & Show Final Standings') : (room.currentRound + 1 >= room.roundCount ? 'Finish & Show Final Standings' : 'Next Round')}</button>
            <button type="button" disabled={busy === 'finish'} onClick={() => control('finish', finishLiveChallenge)} style={{ ...secondary, color: '#a50e0e' }}>End Session</button>
          </div>
          {!canAdvance && <p style={{ margin: 0, color: '#5f6368', fontSize: 13 }}>{room.timingMode === 'pace' && !hasRoundDeadline ? 'Next Round unlocks when everyone submits or the closing threshold starts and its countdown finishes.' : 'Next Round unlocks when everyone who joined has answered or the timer reaches zero.'}</p>}
        </>
      )}

      {room.status === 'finished' && (
        <>
          <section style={{ ...panel, background: '#e6f4ea', borderColor: '#9bd2aa' }}><h2 style={{ marginTop: 0, color: '#137333' }}>Challenge complete</h2><p style={{ marginBottom: 0 }}>Competition points are game results only. Warm-Up academic credit uses participation and mathematical accuracy.</p></section>
          <section style={panel}><h3 style={{ marginTop: 0 }}>Final Standings</h3><Leaderboard rows={leaderboard} limit={20} /></section>
          <ChallengeReport report={report} />
          <button type="button" onClick={() => { setRoomId(null); setRoom(null); setPlayers([]); setTitle(''); setMessage(''); }} style={{ ...primary, justifySelf: 'start' }}>Create Another Challenge</button>
        </>
      )}

      {room.status === 'cancelled' && (
        <section style={panel}><h3 style={{ marginTop: 0 }}>Challenge cancelled</h3><button type="button" onClick={() => { setRoomId(null); setRoom(null); setPlayers([]); }} style={primary}>Create Another Challenge</button></section>
      )}
    </div>
  );
}
