import { useMemo } from 'react';
import ClassMemoryCard from './ClassMemoryCard.jsx';
import { ARENA_GRAPH, ARENA_MARKS } from './grandPrixTheme.js';
import {
  SYSTEMS_DIFFICULTY_OPTIONS,
  SYSTEMS_ROUND_LIMITS,
  SYSTEMS_RUSH_PRESETS,
  SYSTEM_KINDS,
  SYSTEM_QUESTIONS,
  getSystemsPreset,
  systemAnswerButtons,
} from '../../../functions/shared/systemsRush.mjs';
import { RUSH_SCORING_OPTIONS, grandPrixLadder } from '../../platform/liveChallenge/rushSetupModel.js';
import { changeSystemsSetup, systemsSetupFromPreset, systemsSetupProblem } from '../../platform/liveChallenge/systemsSetupModel.js';

/*
 * SYSTEMS OF EQUATIONS RUSH SETUP.
 *
 * Inequality Graphing Rush's setup for this game: a preset is a level — the
 * order a class meets systems in, from the intercepts of two lines to no
 * solution and infinitely many — and every choice stays editable. The
 * questions and the kinds of system toggle one by one; the server's own rule
 * (systemsConfigProblem) says what is wrong before a lobby is created.
 *
 * Loaded only when a teacher picks Systems of Equations Rush.
 */

const toggle = (list, id) => (list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]);

const chip = (active) => ({
  minHeight: 40,
  padding: '7px 12px',
  borderRadius: 999,
  border: `2px solid ${active ? '#1a73e8' : 'var(--mm-border)'}`,
  background: active ? 'var(--mm-primary-soft)' : 'var(--mm-surface)',
  color: active ? 'var(--mm-primary-text)' : 'var(--mm-text)',
  fontWeight: 800,
  cursor: 'pointer',
});

const field = { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: 10, borderRadius: 8, border: '1px solid var(--mm-border)' };
const hint = { display: 'block', marginTop: 6, fontWeight: 500, fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)' };

/*
 * How the two lines are drawn, as students see them: line 1 solid and wide,
 * line 2 dashed and narrow on top of it — so the same line twice shows as two
 * lines, one on the other. The same drawing as the round's (rushGraphModel
 * systemDrawing, GraphFeatureRushGraph), in miniature.
 */
function TwoLinesPreview() {
  const lines = [
    { label: 'Two lines', d: [[12, 52], [108, 12]], e: [[12, 16], [108, 56]] },
    { label: 'The same line twice', d: [[12, 52], [108, 12]], e: [[12, 52], [108, 12]] },
  ];
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {lines.map((entry) => (
        <figure key={entry.label} style={{ margin: 0, display: 'grid', gap: 4, justifyItems: 'center' }}>
          <svg width="120" height="68" viewBox="0 0 120 68" role="img" aria-label={`${entry.label}: line 1 solid, line 2 dashed`} data-mm-drawing="" style={{ borderRadius: 8, background: ARENA_GRAPH.bg }}>
            <line x1={entry.d[0][0]} y1={entry.d[0][1]} x2={entry.d[1][0]} y2={entry.d[1][1]} stroke={ARENA_MARKS.curve} strokeWidth={9} data-mm-plane-part="line" />
            <line x1={entry.e[0][0]} y1={entry.e[0][1]} x2={entry.e[1][0]} y2={entry.e[1][1]} stroke={ARENA_GRAPH.bg} strokeWidth={6} strokeDasharray="11 7" data-mm-plane-part="halo" />
            <line x1={entry.e[0][0]} y1={entry.e[0][1]} x2={entry.e[1][0]} y2={entry.e[1][1]} stroke={ARENA_MARKS.second} strokeWidth={3} strokeDasharray="11 7" data-mm-plane-part="line" />
          </svg>
          <figcaption style={{ fontSize: 'calc(12 * var(--mm-px))', fontWeight: 700, color: 'var(--mm-text-muted)' }}>{entry.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

// `memory`: what this class did the last time it played this game, if it has
// (liveChallengeClassMemory.mjs). `onAnnounce` is the console's live region,
// which says when the card fills in the setup.
export default function SystemsRushSetup({ setup, onChange, classSize = 0, onPractice = null, memory = null, onAnnounce = null }) {
  const problem = useMemo(() => systemsSetupProblem(setup), [setup]);
  const update = (patch) => onChange(changeSystemsSetup(setup, patch));
  const ladder = grandPrixLadder(classSize || 24);
  const buttons = systemAnswerButtons(setup);
  const solutionAsked = setup.questions.includes('solution');

  return (
    <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 16 }}>
      {memory && <ClassMemoryCard memory={memory} onUse={onChange} onAnnounce={onAnnounce} />}
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 900, marginBottom: 8 }}>Start from a level</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SYSTEMS_RUSH_PRESETS.map((preset) => (
            <button key={preset.id} type="button" aria-pressed={setup.presetId === preset.id} title={preset.description} onClick={() => onChange(systemsSetupFromPreset(preset))} style={chip(setup.presetId === preset.id)}>
              {preset.label}
            </button>
          ))}
        </div>
        <span style={hint}>{getSystemsPreset(setup.presetId)?.description || 'Custom settings.'} Levels are starting points — change anything below.</span>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 900, marginBottom: 8 }}>What students find</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SYSTEM_QUESTIONS.map((question) => (
            <label key={question.id} title={question.description} style={{ ...chip(setup.questions.includes(question.id)), display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <input type="checkbox" checked={setup.questions.includes(question.id)} onChange={() => update({ questions: toggle(setup.questions, question.id) })} />
              <span>{question.label}</span>
            </label>
          ))}
        </div>
        <span style={hint}>Every graph shows two lines. Students tap each intercept, or the point where the lines intersect; "Does Not Exist" when no line crosses an axis (from Standard).</span>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 900, marginBottom: 8 }}>Kinds of system</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SYSTEM_KINDS.map((kind) => (
            <label key={kind.id} title={kind.description} style={{ ...chip(setup.kinds.includes(kind.id)), display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <input type="checkbox" checked={setup.kinds.includes(kind.id)} onChange={() => update({ kinds: toggle(setup.kinds, kind.id) })} />
              <span>{kind.label} <span style={{ fontWeight: 600, color: 'var(--mm-text-muted)' }}>{kind.example}</span></span>
            </label>
          ))}
        </div>
        <span style={hint}>
          {solutionAsked && buttons.length
            ? `Every solution question offers ${buttons.map((button) => button.label).join(', ')} and Skip — on every graph, so a button never gives an answer away.`
            : 'No solution, infinitely many and can\'t-be-determined each add their own button to the solution questions.'}
        </span>
      </fieldset>

      <div style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontWeight: 900 }}>How the two lines look</span>
        <TwoLinesPreview />
        <span style={hint}>Line 1 is solid and wide, line 2 dashed and narrow on top, each labelled at its own end: when they are the same line, students see both, one lying on the other.</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
        <label style={{ fontWeight: 800 }}>Difficulty
          <select value={setup.difficulty} onChange={(event) => update({ difficulty: event.target.value })} style={field}>
            {SYSTEMS_DIFFICULTY_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <span style={hint}>{SYSTEMS_DIFFICULTY_OPTIONS.find((option) => option.id === setup.difficulty)?.description}</span>
        </label>
        <label style={{ fontWeight: 800 }}>Rounds
          <select value={setup.roundCount} onChange={(event) => onChange({ ...setup, roundCount: Number(event.target.value) })} style={field}>
            {Array.from({ length: SYSTEMS_ROUND_LIMITS.maxRounds - SYSTEMS_ROUND_LIMITS.minRounds + 1 }, (_, index) => SYSTEMS_ROUND_LIMITS.minRounds + index)
              .map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <label style={{ fontWeight: 800 }}>Time per round
          <select value={setup.roundSeconds} onChange={(event) => onChange({ ...setup, roundSeconds: Number(event.target.value) })} style={field}>
            {SYSTEMS_ROUND_LIMITS.secondsOptions.map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
          </select>
          <span style={hint}>Each student gets their own systems and works through as many as they can.</span>
        </label>
        <label style={{ fontWeight: 800 }}>Scoring
          <select value={setup.scoringStrategyId} onChange={(event) => onChange({ ...setup, scoringStrategyId: event.target.value })} style={field}>
            {RUSH_SCORING_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <span style={hint}>{RUSH_SCORING_OPTIONS.find((option) => option.id === setup.scoringStrategyId)?.description.replace('graph completed', 'system completed')}</span>
        </label>
      </div>

      {problem && <div role="alert" style={{ padding: '10px 13px', borderRadius: 9, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', border: '1px solid var(--mm-warning-border)', fontWeight: 800 }}>{problem}</div>}

      <section style={{ padding: 15, borderRadius: 12, background: 'var(--mm-info-bg)', border: '1px solid var(--mm-info-border)', color: 'var(--mm-info-text)' }}>
        <h3 style={{ margin: '0 0 8px' }}>How scoring works</h3>
        {setup.scoringStrategyId === 'grandPrix' ? (
          <>
            <div style={{ fontWeight: 800 }}>
              Each round ranks students by points — a point for every intercept or solution found, or answer pressed right (a wrong answer costs 1/20 of a system) — then accuracy, then who finished first.
              {classSize ? ` With ${Math.max(2, classSize)} players:` : ' With 24 players:'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {ladder.map(({ place, points }) => (
                <span key={place} style={{ padding: '5px 9px', borderRadius: 999, background: 'var(--mm-surface)', color: 'var(--mm-text-strong)', fontWeight: 800 }}>
                  {place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`} +{points}
                </span>
              ))}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 'calc(13 * var(--mm-px))' }}>A student who finds nothing in a round earns nothing for it; ties share a place.</p>
          </>
        ) : (
          <div style={{ fontWeight: 800 }}>One point per intercept or solution found, or answer pressed right, added up over every round. Ties are broken by accuracy.</div>
        )}
      </section>

      {typeof onPractice === 'function' && (
        <div>
          <button type="button" disabled={Boolean(problem)} onClick={onPractice} style={{ border: '1px solid var(--mm-border)', borderRadius: 9, padding: '10px 15px', background: 'var(--mm-surface)', color: 'var(--mm-text-strong)', fontWeight: 900, cursor: problem ? 'not-allowed' : 'pointer', opacity: problem ? 0.55 : 1 }}>
            Try it yourself first
          </button>
          <span style={hint}>Play a practice round with these settings. Nothing is recorded and no students are invited.</span>
        </div>
      )}
    </div>
  );
}
