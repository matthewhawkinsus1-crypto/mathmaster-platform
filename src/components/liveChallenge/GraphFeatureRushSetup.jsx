import { useMemo } from 'react';
import { graphFamilyLabel, GRAPH_FAMILY_CATALOG_IDS } from '../../../functions/shared/graphFeatureCatalog.mjs';
import { getGraphFeature, GRAPH_FEATURE_IDS } from '../../../functions/shared/graphFeatureRegistry.mjs';
import {
  getRushPreset,
  GRAPH_FEATURE_RUSH_PRESETS,
  RUSH_DIFFICULTY_OPTIONS,
  RUSH_ROUND_LIMITS,
  rushConfigProblem,
} from '../../../functions/shared/graphFeatureRushConfig.mjs';
import {
  RUSH_SCORING_OPTIONS,
  changeRushSetup,
  grandPrixLadder,
  rushSetupFromPreset,
} from '../../platform/liveChallenge/rushSetupModel.js';

/*
 * GRAPH FEATURE RUSH SETUP.
 *
 * A preset is a starting point — "Quick Algebra I" fills in families,
 * features, difficulty, rounds, time and scoring — and every choice stays
 * editable. Whether the families chosen can ask the features chosen at the
 * difficulty chosen is checked here with the server's own rule
 * (rushConfigProblem), so a teacher reads the problem before creating a lobby
 * rather than a class staring at an impossible game.
 *
 * Loaded only when a teacher picks Graph Feature Rush.
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
const hint = { display: 'block', marginTop: 6, fontWeight: 500, fontSize: 12, color: 'var(--mm-text-muted)' };

export default function GraphFeatureRushSetup({ setup, onChange, classSize = 0, onPractice = null }) {
  const problem = useMemo(() => rushConfigProblem({ families: setup.families, features: setup.features, difficulty: setup.difficulty }), [setup.families, setup.features, setup.difficulty]);
  const update = (patch) => onChange(changeRushSetup(setup, patch));
  const ladder = grandPrixLadder(classSize || 24);

  return (
    <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 16 }}>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 900, marginBottom: 8 }}>Start from a preset</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {GRAPH_FEATURE_RUSH_PRESETS.map((preset) => (
            <button key={preset.id} type="button" aria-pressed={setup.presetId === preset.id} title={preset.description} onClick={() => onChange(rushSetupFromPreset(preset))} style={chip(setup.presetId === preset.id)}>
              {preset.label}
            </button>
          ))}
        </div>
        <span style={hint}>{getRushPreset(setup.presetId)?.description || 'Custom settings.'} Presets are starting points — change anything below.</span>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 900, marginBottom: 8 }}>Kinds of graphs</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {GRAPH_FAMILY_CATALOG_IDS.map((id) => (
            <label key={id} style={{ ...chip(setup.families.includes(id)), display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <input type="checkbox" checked={setup.families.includes(id)} onChange={() => update({ families: toggle(setup.families, id) })} />
              {graphFamilyLabel(id) || id}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 900, marginBottom: 8 }}>Features to find</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {GRAPH_FEATURE_IDS.map((id) => (
            <label key={id} style={{ ...chip(setup.features.includes(id)), display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <input type="checkbox" checked={setup.features.includes(id)} onChange={() => update({ features: toggle(setup.features, id) })} />
              {getGraphFeature(id)?.label || id}
            </label>
          ))}
        </div>
        <span style={hint}>Prompts vary the wording — "zeros", "roots", "x-intercepts" — and never say how many there are. Some graphs have none: students answer with "Does Not Exist".</span>
      </fieldset>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
        <label style={{ fontWeight: 800 }}>Difficulty
          <select value={setup.difficulty} onChange={(event) => update({ difficulty: event.target.value })} style={field}>
            {RUSH_DIFFICULTY_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <span style={hint}>{RUSH_DIFFICULTY_OPTIONS.find((option) => option.id === setup.difficulty)?.description}</span>
        </label>
        <label style={{ fontWeight: 800 }}>Rounds
          <select value={setup.roundCount} onChange={(event) => onChange({ ...setup, roundCount: Number(event.target.value) })} style={field}>
            {Array.from({ length: RUSH_ROUND_LIMITS.maxRounds - RUSH_ROUND_LIMITS.minRounds + 1 }, (_, index) => RUSH_ROUND_LIMITS.minRounds + index)
              .map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <label style={{ fontWeight: 800 }}>Time per round
          <select value={setup.roundSeconds} onChange={(event) => onChange({ ...setup, roundSeconds: Number(event.target.value) })} style={field}>
            {RUSH_ROUND_LIMITS.secondsOptions.map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
          </select>
          <span style={hint}>Each student gets their own graphs and works through as many as they can.</span>
        </label>
        <label style={{ fontWeight: 800 }}>Scoring
          <select value={setup.scoringStrategyId} onChange={(event) => onChange({ ...setup, scoringStrategyId: event.target.value })} style={field}>
            {RUSH_SCORING_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <span style={hint}>{RUSH_SCORING_OPTIONS.find((option) => option.id === setup.scoringStrategyId)?.description}</span>
        </label>
      </div>

      {problem && <div role="alert" style={{ padding: '10px 13px', borderRadius: 9, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', border: '1px solid var(--mm-warning-border)', fontWeight: 800 }}>{problem}</div>}

      <section style={{ padding: 15, borderRadius: 12, background: 'var(--mm-info-bg)', border: '1px solid var(--mm-info-border)', color: 'var(--mm-info-text)' }}>
        <h3 style={{ margin: '0 0 8px' }}>How scoring works</h3>
        {setup.scoringStrategyId === 'grandPrix' ? (
          <>
            <div style={{ fontWeight: 800 }}>
              Each round ranks students by graphs completed (a wrong tap costs 1/20 of a graph), then accuracy, then who finished first.
              {classSize ? ` With ${Math.max(2, classSize)} players:` : ' With 24 players:'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {ladder.map(({ place, points }) => (
                <span key={place} style={{ padding: '5px 9px', borderRadius: 999, background: 'var(--mm-surface)', color: 'var(--mm-text-strong)', fontWeight: 800 }}>
                  {place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`} +{points}
                </span>
              ))}
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 13 }}>A student who completes nothing in a round earns nothing for it; ties share a place.</p>
          </>
        ) : (
          <div style={{ fontWeight: 800 }}>One point per completed graph, added up over every round. Ties are broken by accuracy.</div>
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
