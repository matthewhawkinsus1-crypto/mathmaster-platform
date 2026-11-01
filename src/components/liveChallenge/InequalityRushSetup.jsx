import { useMemo } from 'react';
import {
  INEQUALITY_DIFFICULTY_OPTIONS,
  INEQUALITY_ITEMS,
  INEQUALITY_ROUND_LIMITS,
  INEQUALITY_RUSH_PRESETS,
  getInequalityPreset,
} from '../../../functions/shared/inequalityRush.mjs';
import { RUSH_SCORING_OPTIONS, grandPrixLadder } from '../../platform/liveChallenge/rushSetupModel.js';
import {
  changeInequalitySetup,
  inequalitySetupFromPreset,
  inequalitySetupProblem,
} from '../../platform/liveChallenge/inequalitySetupModel.js';

/*
 * INEQUALITY GRAPHING RUSH SETUP.
 *
 * Graph Feature Rush's setup for this game: a preset is a starting point —
 * kinds of inequality, difficulty, rounds, time and scoring — and every
 * choice stays editable. The kinds toggle one by one; the server's own rule
 * (inequalityConfigProblem) says what is wrong before a lobby is created.
 *
 * Loaded only when a teacher picks Inequality Graphing Rush.
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

export default function InequalityRushSetup({ setup, onChange, classSize = 0, onPractice = null }) {
  const problem = useMemo(() => inequalitySetupProblem(setup), [setup]);
  const update = (patch) => onChange(changeInequalitySetup(setup, patch));
  const ladder = grandPrixLadder(classSize || 24);

  return (
    <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 16 }}>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 900, marginBottom: 8 }}>Start from a preset</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {INEQUALITY_RUSH_PRESETS.map((preset) => (
            <button key={preset.id} type="button" aria-pressed={setup.presetId === preset.id} title={preset.description} onClick={() => onChange(inequalitySetupFromPreset(preset))} style={chip(setup.presetId === preset.id)}>
              {preset.label}
            </button>
          ))}
        </div>
        <span style={hint}>{getInequalityPreset(setup.presetId)?.description || 'Custom settings.'} Presets are starting points — change anything below.</span>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 900, marginBottom: 8 }}>Kinds of inequality</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {INEQUALITY_ITEMS.map((item) => (
            <label key={item.id} style={{ ...chip(setup.itemTypes.includes(item.id)), display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <input type="checkbox" checked={setup.itemTypes.includes(item.id)} onChange={() => update({ itemTypes: toggle(setup.itemTypes, item.id) })} />
              <span>{item.label} <span style={{ fontWeight: 600, color: 'var(--mm-text-muted)' }}>{item.example}</span></span>
            </label>
          ))}
        </div>
        <span style={hint}>Students tap the number line for dots (once closed, twice open), use the arrows for "keeps going", and press ✓ Check. Every item also offers No Solution — from Standard, some are.</span>
      </fieldset>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
        <label style={{ fontWeight: 800 }}>Difficulty
          <select value={setup.difficulty} onChange={(event) => update({ difficulty: event.target.value })} style={field}>
            {INEQUALITY_DIFFICULTY_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <span style={hint}>{INEQUALITY_DIFFICULTY_OPTIONS.find((option) => option.id === setup.difficulty)?.description}</span>
        </label>
        <label style={{ fontWeight: 800 }}>Rounds
          <select value={setup.roundCount} onChange={(event) => onChange({ ...setup, roundCount: Number(event.target.value) })} style={field}>
            {Array.from({ length: INEQUALITY_ROUND_LIMITS.maxRounds - INEQUALITY_ROUND_LIMITS.minRounds + 1 }, (_, index) => INEQUALITY_ROUND_LIMITS.minRounds + index)
              .map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <label style={{ fontWeight: 800 }}>Time per round
          <select value={setup.roundSeconds} onChange={(event) => onChange({ ...setup, roundSeconds: Number(event.target.value) })} style={field}>
            {INEQUALITY_ROUND_LIMITS.secondsOptions.map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
          </select>
          <span style={hint}>Each student gets their own inequalities and graphs as many as they can.</span>
        </label>
        <label style={{ fontWeight: 800 }}>Scoring
          <select value={setup.scoringStrategyId} onChange={(event) => onChange({ ...setup, scoringStrategyId: event.target.value })} style={field}>
            {RUSH_SCORING_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <span style={hint}>{RUSH_SCORING_OPTIONS.find((option) => option.id === setup.scoringStrategyId)?.description.replace('graph completed', 'inequality graphed')}</span>
        </label>
      </div>

      {problem && <div role="alert" style={{ padding: '10px 13px', borderRadius: 9, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', border: '1px solid var(--mm-warning-border)', fontWeight: 800 }}>{problem}</div>}

      <section style={{ padding: 15, borderRadius: 12, background: 'var(--mm-info-bg)', border: '1px solid var(--mm-info-border)', color: 'var(--mm-info-text)' }}>
        <h3 style={{ margin: '0 0 8px' }}>How scoring works</h3>
        {setup.scoringStrategyId === 'grandPrix' ? (
          <>
            <div style={{ fontWeight: 800 }}>
              Each round ranks students by inequalities graphed (a wrong answer costs 1/20 of one), then accuracy, then who finished first.
              {classSize ? ` With ${Math.max(2, classSize)} players:` : ' With 24 players:'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {ladder.map(({ place, points }) => (
                <span key={place} style={{ padding: '5px 9px', borderRadius: 999, background: 'var(--mm-surface)', color: 'var(--mm-text-strong)', fontWeight: 800 }}>
                  {place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`} +{points}
                </span>
              ))}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 'calc(13 * var(--mm-px))' }}>A student who graphs nothing in a round earns nothing for it; ties share a place.</p>
          </>
        ) : (
          <div style={{ fontWeight: 800 }}>One point per inequality graphed, added up over every round. Ties are broken by accuracy.</div>
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
