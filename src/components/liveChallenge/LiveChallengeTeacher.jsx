import { useEffect, useMemo, useState } from 'react';
import { fetchPathCoverage } from '../../platform/path/pathCoverageService.js';
import { summarizeCoverage } from '../../../functions/shared/pathCoverage.mjs';
import { challengeCanAdvance, publicLeaderboard } from '../../../functions/shared/liveChallenge.mjs';
import { buildChallengeExport, challengeExportFileName } from '../../../functions/shared/liveChallengeExport.mjs';
import {
  advanceLiveChallenge,
  cancelLiveChallenge,
  createLiveChallenge,
  finishLiveChallenge,
  startLiveChallenge,
  timestampMillis,
  watchLiveChallengePlayers,
  watchLiveChallengeRoom,
  readChallengeReport,
  watchTeacherActiveChallenge,
} from '../../platform/liveChallenge/liveChallengeService.js';


/**
 * What the game left behind.
 *
 * Ordered the way a teacher reads it: the one standard to reteach, then the
 * rounds that produced that answer, then the roster — including whoever never
 * joined, because that is a question the report exists to answer and the row
 * that connects to attendance.
 *
 * Every line is a count. A student who lost wifi and a student who gave up
 * produce the same record, so the report states what happened and leaves the
 * conclusion to the person who was in the room.
 */
function ChallengeReport({ report }) {
  // Hooks run before the early return, so the component keeps a stable hook
  // order whether or not a report has loaded yet.
  const roundSet = useMemo(() => buildChallengeExport(report), [report]);
  if (!report) return null;
  const pct = (value) => (value == null ? '—' : `${value}%`);

  return (
    <section style={panel}>
      <h3 style={{ marginTop: 0 }}>After the game</h3>

      {report.weakestStandard && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fff4ce', border: '1px solid #f9ab00', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase', color: '#7a4f00' }}>Hardest for this class</div>
          <strong style={{ display: 'block', marginTop: 4, fontSize: 17, color: '#3c2f00' }}>
            {report.weakestStandard.standard} — {pct(report.weakestStandard.accuracyPercent)} correct
          </strong>
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
              <span>{entry.standard}</span>
              <span style={{ color: '#5f6368' }}>{entry.correct}/{entry.answered} correct · {pct(entry.accuracyPercent)}</span>
            </div>
          ))}
        </div>
      )}

      {roundSet && (
        <div style={{ marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => {
              const blob = new Blob([JSON.stringify(roundSet, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = challengeExportFileName(roundSet);
              document.body.append(link);
              link.click();
              link.remove();
              URL.revokeObjectURL(url);
            }}
            style={{ minHeight: 44, padding: '10px 15px', border: '1px solid #9bb8e8', borderRadius: 9, background: '#fff', color: '#174ea6', fontWeight: 800, cursor: 'pointer' }}
          >
            Save this round set
          </button>
          <span style={{ display: 'block', marginTop: 5, fontSize: 12, color: '#5f6368' }}>
            {roundSet.roundCount} questions. Run the same set with another period — no student names or scores are in the file.
          </span>
        </div>
      )}

      {report.neverJoined?.length > 0 && (
        <div style={{ padding: '10px 13px', borderRadius: 9, background: '#f1f3f4', fontSize: 13.5, color: '#3c4043' }}>
          <strong>Did not join:</strong> {report.neverJoined.length} student{report.neverJoined.length === 1 ? '' : 's'}.
          {' '}A student can be absent, on paper, or have lost their connection — this is a roster fact, not a finding.
        </div>
      )}
    </section>
  );
}

const panel = { background: '#fff', border: '1px solid #d8dde6', borderRadius: 14, padding: 20, textAlign: 'left' };
const primary = { border: 0, borderRadius: 9, padding: '11px 16px', background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const secondary = { border: '1px solid #b7bec8', borderRadius: 9, padding: '10px 15px', background: '#fff', color: '#3c4043', fontWeight: 900, cursor: 'pointer' };

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

function Leaderboard({ rows = [], limit = 12, projector = false }) {
  if (!rows.length) return <p style={{ color: '#5f6368', margin: 0 }}>Students who join will appear here by anonymous game name.</p>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.slice(0, limit).map((row) => (
        <div key={row.playerKey || row.alias} style={{ display: 'grid', gridTemplateColumns: '42px minmax(0,1fr) auto auto', gap: 10, alignItems: 'center', padding: projector ? '13px 14px' : '9px 11px', borderRadius: 10, background: row.rank <= 3 ? '#fef7e0' : '#f8f9fa', border: '1px solid #e1e5ea', fontSize: projector ? 18 : 14 }}>
          <strong style={{ textAlign: 'center' }}>#{row.rank}</strong>
          <span style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.alias}</span>
          <span style={{ color: '#5f6368' }}>{row.correctCount} ✓</span>
          <strong>{row.score.toLocaleString()}</strong>
        </div>
      ))}
    </div>
  );
}

export default function LiveChallengeTeacher({
  allStudents = [],
  classes = [],
  courseProfiles = {},
  signedInEmail = '',
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
  const [roundCount, setRoundCount] = useState(10);
  const [roundSeconds, setRoundSeconds] = useState(45);
  const [title, setTitle] = useState('');
  const [roomId, setRoomId] = useState(null);
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [projector, setProjector] = useState(false);
  const now = useNow(room?.status === 'running');

  useEffect(() => {
    if (!classId && classOptions.length) setClassId(classOptions[0].classId);
    if (classId && !classOptions.some((entry) => entry.classId === classId)) setClassId(classOptions[0]?.classId || '');
  }, [classOptions, classId]);

  useEffect(() => {
    const resolved = selectedClass?.course || courseProfiles?.[classPeriod]?.course || 'algebra1';
    setCourseId(resolved);
    setStandardCode('mixed');
  }, [classId, classPeriod, selectedClass, courseProfiles]);

  useEffect(() => {
    let alive = true;
    setCoverage(null);
    fetchPathCoverage(courseId).then((value) => { if (alive) setCoverage(value); });
    return () => { alive = false; };
  }, [courseId]);

  // Recover an in-progress challenge after a browser refresh.
  useEffect(() => watchTeacherActiveChallenge(signedInEmail, (active) => {
    if (active?.roomId && !roomId) setRoomId(active.roomId);
  }), [signedInEmail, roomId]);

  useEffect(() => {
    if (!roomId) { setRoom(null); return undefined; }
    return watchLiveChallengeRoom(roomId, setRoom, (error) => setMessage(error?.message || 'Could not load the Live Challenge.'));
  }, [roomId]);

  useEffect(() => {
    if (!roomId) { setPlayers([]); return undefined; }
    return watchLiveChallengePlayers(roomId, setPlayers, (error) => setMessage(error?.message || 'Could not load Live Challenge players.'));
  }, [roomId]);

  const coverageRows = useMemo(() => summarizeCoverage(coverage || {}, { onlyGaps: false }).filter((row) => row.studentReady), [coverage]);
  const leaderboard = useMemo(() => publicLeaderboard(players), [players]);

  // The report is written once when the room closes, so this reads it once
  // rather than holding a listener on a document that will not move again.
  const [report, setReport] = useState(null);
  useEffect(() => {
    if (room?.status !== 'finished' || !room?.id) { setReport(null); return undefined; }
    let cancelled = false;
    readChallengeReport(room.id)
      .then((value) => { if (!cancelled) setReport(value); })
      .catch(() => { if (!cancelled) setReport(null); });
    return () => { cancelled = true; };
  }, [room?.status, room?.id]);
  const joinedCount = leaderboard.length;
  const answeredCount = leaderboard.filter((player) => Number(player.answeredRound) === Number(room?.currentRound)).length;
  const roundEndsAtMs = timestampMillis(room?.roundEndsAt);
  const remainingMs = Math.max(0, roundEndsAtMs - now);
  const canAdvance = challengeCanAdvance({
    joinedCount,
    answeredCount,
    roundEndsAtMs,
    nowMs: now,
  });

  const run = async (key, task) => {
    setBusy(key);
    setMessage('');
    try { return await task(); }
    catch (error) { setMessage(error?.message || 'Live Challenge action failed.'); return null; }
    finally { setBusy(''); }
  };

  const create = async () => {
    const result = await run('create', () => createLiveChallenge({
      classId,
      classPeriod,
      courseId,
      standardCode,
      roundCount,
      roundSeconds,
      title: title.trim() || `${selectedClass?.name || classPeriod || 'Class'} Live Challenge`,
    }));
    if (result?.roomId) {
      setRoomId(result.roomId);
      if (result.trimmed) setMessage(`The secure bank had ${result.roundCount} unique usable questions for this selection, so MathMaster shortened the game from ${result.requestedRoundCount} rounds.`);
    }
  };

  const control = async (key, action) => run(key, () => action({ roomId }));

  if (!roomId || !room) {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <div>
          <h2 style={{ margin: 0 }}>Live Challenge</h2>
          <p style={{ color: '#5f6368', maxWidth: 820, lineHeight: 1.55 }}>
            Launch a fast class competition using the same secure question bank and interactive graders as My Math Path. Students are identified to one another by game aliases; correctness is worth far more than speed.
          </p>
        </div>
        <section style={panel}>
          <h3 style={{ marginTop: 0 }}>Create a challenge</h3>
          {classOptions.length === 0 ? (
            <p style={{ color: '#a50e0e' }}>No students are currently assigned to an active Algebra I or Algebra II class, so there is nobody to invite yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
              <label style={{ fontWeight: 800 }}>Class
                <select value={classId} onChange={(event) => setClassId(event.target.value)} style={{ display: 'block', width: '100%', marginTop: 6, padding: 10, borderRadius: 8, border: '1px solid #b7bec8' }}>
                  {classOptions.map((entry) => <option key={entry.classId} value={entry.classId}>{entry.name || entry.period || entry.classId}{entry.period ? ` · ${entry.period}` : ''}</option>)}
                </select>
              </label>
              <label style={{ fontWeight: 800 }}>Course
                <input value={courseLabel(courseId)} readOnly style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: 10, borderRadius: 8, border: '1px solid #d8dde6', background: '#f8f9fa', color: '#3c4043' }} />
              </label>
              <label style={{ fontWeight: 800 }}>Skill set
                <select value={standardCode} onChange={(event) => setStandardCode(event.target.value)} style={{ display: 'block', width: '100%', marginTop: 6, padding: 10, borderRadius: 8, border: '1px solid #b7bec8' }}>
                  <option value="mixed">Mixed review — {courseLabel(courseId)}</option>
                  {coverageRows.map((row) => <option key={row.displayCode} value={row.displayCode}>{row.displayCode} · {row.issuableCount} usable families</option>)}
                </select>
              </label>
              <label style={{ fontWeight: 800 }}>Rounds
                <select value={roundCount} onChange={(event) => setRoundCount(Number(event.target.value))} style={{ display: 'block', width: '100%', marginTop: 6, padding: 10, borderRadius: 8, border: '1px solid #b7bec8' }}>
                  {[5, 8, 10, 12, 15, 20].map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </label>
              <label style={{ fontWeight: 800 }}>Time per round
                <select value={roundSeconds} onChange={(event) => setRoundSeconds(Number(event.target.value))} style={{ display: 'block', width: '100%', marginTop: 6, padding: 10, borderRadius: 8, border: '1px solid #b7bec8' }}>
                  {[20, 30, 45, 60, 90].map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
                </select>
              </label>
              <label style={{ fontWeight: 800, gridColumn: '1 / -1' }}>Challenge title
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`${selectedClass?.name || classPeriod || 'Class'} Live Challenge`} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: 10, borderRadius: 8, border: '1px solid #b7bec8' }} />
              </label>
            </div>
          )}
          <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: '#e8f0fe', color: '#174ea6', fontSize: 13, lineHeight: 1.5 }}>
            <strong>Scoring:</strong> up to 1,000 points for mathematical correctness, at most 100 for speed, and at most 100 for a streak. Partial-credit tools earn proportional base points. Game results do not change report-card grades or mastery in this first version.
          </div>
          <button type="button" disabled={!classId || busy === 'create'} onClick={create} style={{ ...primary, marginTop: 16, opacity: !classId || busy === 'create' ? 0.55 : 1 }}>{busy === 'create' ? 'Building secure rounds…' : 'Create Lobby'}</button>
        </section>
        {message && <div role="alert" style={{ padding: 12, borderRadius: 9, background: '#fff4ce', color: '#7a4f00' }}>{message}</div>}
      </div>
    );
  }

  if (projector && ['lobby', 'running', 'finished'].includes(room.status)) {
    return (
      <div style={{ minHeight: '70vh', background: '#202124', color: '#fff', borderRadius: 18, padding: 28, display: 'grid', gap: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <div><div style={{ opacity: .72, textTransform: 'uppercase', fontWeight: 900 }}>MathMaster Live Challenge</div><h1 style={{ margin: '4px 0 0', fontSize: 38 }}>{room.title}</h1></div>
          <button type="button" onClick={() => setProjector(false)} style={secondary}>Exit Projector View</button>
        </div>
        {room.status === 'lobby' && <div style={{ textAlign: 'center', padding: 30 }}><div style={{ fontSize: 80, fontWeight: 1000 }}>{joinedCount}</div><div style={{ fontSize: 24 }}>students joined · waiting for teacher</div></div>}
        {room.status === 'running' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px,.8fr)', gap: 24, alignItems: 'start' }}>
            <section><div style={{ fontSize: 20, fontWeight: 900, color: '#aecbfa' }}>Round {(room.currentRound || 0) + 1} of {room.roundCount} · {room.currentQuestion?.teksCode || 'Mixed review'}</div><div style={{ fontSize: 64, fontWeight: 1000, margin: '10px 0' }}>{formatClock(remainingMs)}</div><div style={{ whiteSpace: 'pre-wrap', fontSize: 28, lineHeight: 1.45 }}>{room.currentQuestion?.prompt}</div></section>
            <section><h2 style={{ marginTop: 0 }}>Leaderboard</h2><Leaderboard rows={leaderboard} limit={8} projector /></section>
          </div>
        )}
        {room.status === 'finished' && <section><h2 style={{ textAlign: 'center', fontSize: 34 }}>Final Standings</h2><div style={{ maxWidth: 700, margin: '0 auto' }}><Leaderboard rows={leaderboard} limit={12} projector /></div></section>}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div><h2 style={{ margin: 0 }}>{room.title}</h2><p style={{ margin: '6px 0 0', color: '#5f6368' }}>{room.classPeriod} · {courseLabel(room.courseId)} · {room.standardCode === 'mixed' ? 'Mixed review' : room.standardCode}</p></div>
        <button type="button" onClick={() => setProjector(true)} style={secondary}>Projector View</button>
      </div>
      {message && <div role="alert" style={{ padding: 12, borderRadius: 9, background: '#fff4ce', color: '#7a4f00' }}>{message}</div>}

      {room.status === 'lobby' && (
        <>
          <section style={{ ...panel, background: '#e8f0fe', borderColor: '#aecbfa' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <div><div style={{ color: '#5f6368', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Joined</div><div style={{ fontSize: 32, fontWeight: 1000 }}>{joinedCount} / {room.eligibleCount || 0}</div></div>
              <div><div style={{ color: '#5f6368', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Rounds</div><div style={{ fontSize: 32, fontWeight: 1000 }}>{room.roundCount}</div></div>
              <div><div style={{ color: '#5f6368', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Per round</div><div style={{ fontSize: 32, fontWeight: 1000 }}>{room.roundSeconds}s</div></div>
            </div>
            <p style={{ marginBottom: 0, color: '#174ea6' }}>Students already signed into this class receive a Live Challenge invitation on their MathMaster dashboard. They do not need a join code.</p>
          </section>
          <section style={panel}><h3 style={{ marginTop: 0 }}>Players in lobby</h3><Leaderboard rows={leaderboard} /></section>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" disabled={joinedCount < 1 || busy === 'start'} onClick={() => control('start', startLiveChallenge)} style={{ ...primary, opacity: joinedCount < 1 || busy === 'start' ? .55 : 1 }}>{busy === 'start' ? 'Starting…' : 'Start Challenge'}</button>
            <button type="button" disabled={busy === 'cancel'} onClick={async () => { await control('cancel', cancelLiveChallenge); }} style={{ ...secondary, color: '#a50e0e' }}>Cancel Lobby</button>
          </div>
        </>
      )}

      {room.status === 'running' && (
        <>
          <section style={{ ...panel, border: '2px solid #1a73e8' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
              <div><div style={{ color: '#174ea6', fontSize: 12, fontWeight: 1000, textTransform: 'uppercase' }}>Round {(room.currentRound || 0) + 1} of {room.roundCount} · {room.currentQuestion?.teksCode || 'Mixed review'}</div><div style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontSize: 20, lineHeight: 1.45, fontWeight: 700 }}>{room.currentQuestion?.prompt}</div></div>
              <div style={{ minWidth: 140, textAlign: 'center', padding: 12, borderRadius: 12, background: remainingMs <= 10000 ? '#fce8e6' : '#e8f0fe', color: remainingMs <= 10000 ? '#a50e0e' : '#174ea6' }}><div style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Time left</div><div style={{ fontSize: 38, fontWeight: 1000 }}>{formatClock(remainingMs)}</div></div>
            </div>
            <div style={{ marginTop: 14, fontWeight: 800, color: '#5f6368' }}>{answeredCount} of {joinedCount} joined students answered</div>
          </section>
          <section style={panel}><h3 style={{ marginTop: 0 }}>Leaderboard</h3><Leaderboard rows={leaderboard} /></section>
          <ChallengeReport report={report} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" disabled={!canAdvance || busy === 'advance'} onClick={() => control('advance', advanceLiveChallenge)} style={{ ...primary, opacity: !canAdvance || busy === 'advance' ? .55 : 1 }}>{busy === 'advance' ? 'Loading next round…' : (room.currentRound + 1 >= room.roundCount ? 'Finish & Show Final Standings' : 'Next Round')}</button>
            <button type="button" disabled={busy === 'finish'} onClick={() => control('finish', finishLiveChallenge)} style={{ ...secondary, color: '#a50e0e' }}>End Challenge Early</button>
          </div>
          {!canAdvance && <p style={{ margin: 0, color: '#5f6368', fontSize: 13 }}>Next Round unlocks when everyone who joined has answered or the timer reaches zero.</p>}
        </>
      )}

      {room.status === 'finished' && (
        <>
          <section style={{ ...panel, background: '#e6f4ea', borderColor: '#9bd2aa' }}><h2 style={{ marginTop: 0, color: '#137333' }}>Challenge complete</h2><p style={{ marginBottom: 0 }}>Final scores are practice-game results only. They do not change assignment grades or mastery records.</p></section>
          <section style={panel}><h3 style={{ marginTop: 0 }}>Final Standings</h3><Leaderboard rows={leaderboard} limit={20} /></section>
          <button type="button" onClick={() => { setRoomId(null); setRoom(null); setPlayers([]); setTitle(''); setMessage(''); }} style={{ ...primary, justifySelf: 'start' }}>Create Another Challenge</button>
        </>
      )}

      {room.status === 'cancelled' && (
        <section style={panel}><h3 style={{ marginTop: 0 }}>Challenge cancelled</h3><button type="button" onClick={() => { setRoomId(null); setRoom(null); setPlayers([]); }} style={primary}>Create Another Challenge</button></section>
      )}
    </div>
  );
}
