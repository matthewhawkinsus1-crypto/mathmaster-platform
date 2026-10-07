import React, { useEffect, useMemo, useState } from 'react';
import {
  describeGrowthForStudent,
  describeWeeklyHistoryForStudent,
} from '../../platform/mastery/progressPresentation.js';

// MY PROGRESS: how far a student has come, and the weeks they have hit.
//
// Two sources, both read only when this tab opens:
//   - the weekly mastery snapshots (studentMasteryHistory), compared this week
//     against four weeks ago by the shared reader;
//   - the server's weekly Path history: each past week's frozen goal with the
//     grade its gradebook received, and the "weeks hit" streak.
//
// The loaders are injected. The live student, a teacher inspecting read-only
// and the Teacher Path Simulator each hand over what they can actually read;
// a loader that is null means "not available on this surface", which this
// screen says plainly rather than showing an empty chart. Loaders must be
// stable (memoized) — a new function is a new read.

const CARD = { minWidth: 0, padding: 18, border: '1px solid var(--mm-border-soft)', borderRadius: 16, background: 'var(--mm-surface)', textAlign: 'left' };
const MUTED = { margin: 0, color: 'var(--mm-text-muted)', fontSize: 13, lineHeight: 1.6 };
const H2 = { margin: '0 0 12px', fontSize: 18, color: 'var(--mm-text-strong)' };
const H3 = { margin: '18px 0 8px', fontSize: 14, color: 'var(--mm-text)' };
const BUTTON = {
  minHeight: 44, padding: '10px 16px', border: '1px solid var(--mm-tint-border)', borderRadius: 10,
  background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 850, cursor: 'pointer',
};

const TONE = {
  up: { color: 'var(--mm-success-text)', background: 'var(--mm-success-subtle)', borderColor: 'var(--mm-success-border)' },
  down: { color: 'var(--mm-warning-text)', background: 'var(--mm-warning-subtle)', borderColor: 'var(--mm-warning-border-soft)' },
  flat: { color: 'var(--mm-text-muted)', background: 'var(--mm-surface-sunken)', borderColor: 'var(--mm-border-soft)' },
  hit: { color: 'var(--mm-success-text)', background: 'var(--mm-success-subtle)', borderColor: 'var(--mm-success-border)' },
  open: { color: 'var(--mm-primary-text)', background: 'var(--mm-surface-tint)', borderColor: 'var(--mm-tint-border)' },
  missed: { color: 'var(--mm-warning-text)', background: 'var(--mm-warning-subtle)', borderColor: 'var(--mm-warning-border-soft)' },
  noGoal: { color: 'var(--mm-text-muted)', background: 'var(--mm-surface-sunken)', borderColor: 'var(--mm-border-soft)' },
};

function Chip({ tone = 'flat', children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', border: '1px solid', borderRadius: 999, fontSize: 12, fontWeight: 850, whiteSpace: 'nowrap', ...(TONE[tone] || TONE.flat) }}>
      {children}
    </span>
  );
}

// One loader's result: 'unavailable' | 'loading' | 'ready' | 'error'.
function useLoaded(load) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(() => ({ status: load ? 'loading' : 'unavailable', data: null }));
  useEffect(() => {
    if (!load) {
      setState({ status: 'unavailable', data: null });
      return undefined;
    }
    let cancelled = false;
    setState((current) => ({ status: 'loading', data: current.data }));
    Promise.resolve()
      .then(load)
      .then(
        (data) => { if (!cancelled) setState({ status: 'ready', data: data ?? null }); },
        (error) => {
          // A warning, not an error: the screen already tells the student.
          console.warn('My Progress could not load:', error);
          if (!cancelled) setState({ status: 'error', data: null });
        },
      );
    return () => { cancelled = true; };
  }, [load, attempt]);
  return [state, () => setAttempt((value) => value + 1)];
}

function LoadState({ status, unavailable, onRetry, what }) {
  if (status === 'loading') return <p style={MUTED}>Loading {what}…</p>;
  if (status === 'unavailable') return <p style={MUTED}>{unavailable}</p>;
  if (status === 'error') {
    return (
      <div role="alert" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)' }}>
        <span>Your {what} could not be loaded right now.</span>
        <button type="button" onClick={onRetry} style={BUTTON}>Try again</button>
      </div>
    );
  }
  return null;
}

function GrowthTile({ tile, baselineLabel }) {
  return (
    <div style={{ minWidth: 0, padding: '12px 14px', border: '1px solid var(--mm-border-soft)', borderRadius: 12, background: 'var(--mm-surface-tint)' }}>
      <div style={{ color: 'var(--mm-text-muted)', fontSize: 11, fontWeight: 900, letterSpacing: '.05em', textTransform: 'uppercase' }}>{tile.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        <strong style={{ fontSize: 26, lineHeight: 1.15, color: 'var(--mm-text-strong)' }}>{tile.now}</strong>
        {tile.changeLabel && <Chip tone={tile.direction}>{tile.changeLabel}</Chip>}
      </div>
      {baselineLabel && <div style={{ ...MUTED, marginTop: 2 }}>{baselineLabel}: {tile.previous}</div>}
      {tile.note && <div style={{ ...MUTED, marginTop: 2, fontSize: 12 }}>{tile.note}</div>}
    </div>
  );
}

function GrowthCard({ state, now, onRetry, unavailable }) {
  const growth = useMemo(
    () => (state.status === 'ready' ? describeGrowthForStudent({ history: state.data, now }) : null),
    [state, now],
  );
  return (
    <article style={CARD} aria-labelledby="mm-progress-growth">
      <h2 id="mm-progress-growth" style={H2}>{growth?.title || 'This week vs 4 weeks ago'}</h2>
      <LoadState status={state.status} unavailable={unavailable} onRetry={onRetry} what="progress" />
      {growth?.state === 'empty' && <p style={MUTED}>{growth.message}</p>}
      {growth?.tiles && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 10 }}>
          {growth.tiles.map((tile) => <GrowthTile key={tile.key} tile={tile} baselineLabel={growth.baselineLabel || null} />)}
        </div>
      )}
      {growth?.tiles && growth.message && <p style={{ ...MUTED, marginTop: 12 }}>{growth.message}</p>}
      {growth?.movers?.length > 0 && (
        <>
          <h3 style={H3}>Skills that moved most</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {growth.movers.map((mover) => (
              <li key={mover.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px 12px', flexWrap: 'wrap', padding: '10px 12px', border: '1px solid var(--mm-border-soft)', borderRadius: 10 }}>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere', fontWeight: 800, color: 'var(--mm-text-strong)' }}>{mover.label}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--mm-text)', fontSize: 13 }}>
                  {mover.before}% → {mover.after}%
                  <Chip tone={mover.direction}>{mover.changeLabel}</Chip>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {growth?.newlyMastered?.length > 0 && (
        <p style={{ ...MUTED, marginTop: 12, color: 'var(--mm-text)' }}>
          <strong>Newly mastered:</strong> {growth.newlyMastered.map((entry) => entry.label).join(', ')}
        </p>
      )}
    </article>
  );
}

function WeeklyCard({ state, onRetry, unavailable, onOpenPath }) {
  const weekly = useMemo(
    () => (state.status === 'ready' ? describeWeeklyHistoryForStudent(state.data) : null),
    [state],
  );
  const streak = weekly?.streak;
  // This week still has work in it: offer the way back to it.
  const openWeek = weekly?.rows.find((row) => row.current && row.status.key !== 'hit');
  return (
    <article style={CARD} aria-labelledby="mm-progress-weekly">
      <h2 id="mm-progress-weekly" style={H2}>Weekly Path</h2>
      <LoadState status={state.status} unavailable={unavailable} onRetry={onRetry} what="weekly Path history" />
      {weekly && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px 14px', flexWrap: 'wrap', padding: 14, border: '1px solid', borderRadius: 12, ...(streak.count ? TONE.hit : TONE.open) }}>
            <span aria-hidden="true" style={{ fontSize: 28 }}>{streak.count ? '🔥' : '🎯'}</span>
            <div style={{ minWidth: 0, flex: '1 1 200px' }}>
              <div><strong style={{ fontSize: 28, lineHeight: 1.1 }}>{streak.value}</strong> <span style={{ fontWeight: 850 }}>{streak.label}</span></div>
              <div style={{ ...MUTED, color: 'var(--mm-text)' }}>{streak.detail}</div>
            </div>
            {weekly.weeksWithGoal > 0 && (
              <div style={{ ...MUTED, color: 'var(--mm-text)', fontWeight: 700 }}>
                {weekly.weeksHit} of {weekly.weeksWithGoal} recent {weekly.weeksWithGoal === 1 ? 'week' : 'weeks'} hit
              </div>
            )}
          </div>

          <ol style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gap: 8 }}>
            {weekly.rows.map((row) => (
              <li key={row.weekKey} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: '4px 12px', padding: '11px 13px', border: '1px solid var(--mm-border-soft)', borderRadius: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--mm-text-strong)' }}>{row.label}</strong>
                    <Chip tone={row.status.key}>{row.status.label}</Chip>
                  </div>
                  <div style={{ ...MUTED, marginTop: 2, overflowWrap: 'anywhere' }}>{row.progress}</div>
                </div>
                {row.grade !== null && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--mm-text-muted)', fontSize: 11, fontWeight: 900, letterSpacing: '.05em', textTransform: 'uppercase' }}>Grade</div>
                    <strong style={{ fontSize: 20, color: row.passing ? 'var(--mm-success-text)' : 'var(--mm-text-strong)' }}>{row.grade}</strong>
                    {row.gradeNote && <div data-grade-source style={{ color: 'var(--mm-text-muted)', fontSize: 11.5, lineHeight: 1.35 }}>{row.gradeNote}</div>}
                  </div>
                )}
              </li>
            ))}
          </ol>

          {weekly.truncated && (
            <p role="status" style={{ ...MUTED, marginTop: 10, color: 'var(--mm-warning-text)' }}>
              Some of your sessions could not be counted here, so a past grade may read low. Your teacher&apos;s gradebook has the official number.
            </p>
          )}
          {weekly.rows.some((row) => row.grade !== null) && (
            <p style={{ ...MUTED, marginTop: 10, fontSize: 12 }}>
              &ldquo;Sent to Google Classroom&rdquo; is the exact grade your teacher&apos;s gradebook received for that week. &ldquo;Not sent&rdquo; is your MathMaster weekly grade for a week that was not sent to Classroom.
            </p>
          )}
          {openWeek && onOpenPath && (
            <button type="button" onClick={onOpenPath} style={{ ...BUTTON, marginTop: 12 }}>
              Go to this week&apos;s Path
            </button>
          )}
        </>
      )}
    </article>
  );
}

export default function MyMathPathProgress({
  loadMasteryHistory = null,
  loadWeeklyHistory = null,
  // Fixed per visit so the comparison does not shift while the tab is open.
  now = null,
  masteryUnavailableMessage = 'Growth over time is not available here.',
  weeklyUnavailableMessage = 'Past weekly goals are not available here.',
  onOpenPath = null,
}) {
  const [openedAt] = useState(() => (Number.isFinite(Number(now)) && now !== null ? Number(now) : Date.now()));
  const [masteryState, retryMastery] = useLoaded(loadMasteryHistory);
  const [weeklyState, retryWeekly] = useLoaded(loadWeeklyHistory);

  return (
    <section style={{ boxSizing: 'border-box', maxWidth: 980, margin: '0 auto', padding: '24px 16px 42px', textAlign: 'left' }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, color: 'var(--mm-text-strong)', fontSize: 26 }}>My Progress</h1>
        <p style={{ ...MUTED, marginTop: 5, fontSize: 14 }}>How your skills have grown, and the weeks you&apos;ve hit.</p>
      </header>
      <div style={{ display: 'grid', gap: 16 }}>
        <GrowthCard state={masteryState} now={openedAt} onRetry={retryMastery} unavailable={masteryUnavailableMessage} />
        <WeeklyCard state={weeklyState} onRetry={retryWeekly} unavailable={weeklyUnavailableMessage} onOpenPath={onOpenPath} />
      </div>
    </section>
  );
}
