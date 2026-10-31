import { useMemo } from 'react';
import {
  LINE_DIFFICULTY_OPTIONS,
  LINE_FORMAT_OPTIONS,
  LINE_FORM_OPTIONS,
  LINE_GRAPH_PRESETS,
  LINE_ITEM_TYPE_OPTIONS,
  LINE_NAME_STYLE_OPTIONS,
  LINE_ROUND_LIMITS,
  LINE_SPRINT_LENGTHS,
  getLineGraphPreset,
} from '../../../functions/shared/lineGraphConfig.mjs';
import { LINE_FORM_PATTERNS, LINE_GRAPH_FORMAT, LINE_ITEM_TYPE, LINE_TRIES_OPTIONS } from '../../../functions/shared/lineGraphRules.mjs';
import { grandPrixLadder } from '../../platform/liveChallenge/rushSetupModel.js';
import {
  LINE_SCORING_OPTIONS,
  applyLinePreset,
  changeLineFormat,
  changeLineSetup,
  lineExtraTimeRule,
  lineSetupProblem,
} from '../../platform/liveChallenge/lineGraphSetupModel.js';

/*
 * GRAPH THE LINE SETUP.
 *
 * The format first — Classic (one line a round, the class together), Sprint
 * (a set in a row) or Rush (as many as the clock allows) — then what the
 * lines are: a preset is a starting point, and every choice stays editable.
 * Whether the settings make a game is checked with the server's own rule
 * (lineGraphConfigProblem), so a teacher reads the problem before creating a
 * lobby.
 *
 * Loaded only when a teacher picks Graph the Line.
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

const formatCard = (active) => ({
  ...chip(active),
  borderRadius: 12,
  padding: '10px 12px',
  textAlign: 'left',
  display: 'grid',
  gap: 4,
  minWidth: 0,
});

const field = { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: 10, borderRadius: 8, border: '1px solid var(--mm-border)' };
const hint = { display: 'block', marginTop: 6, fontWeight: 500, fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)' };
const switchRow = { display: 'flex', gap: 10, alignItems: 'flex-start', fontWeight: 800, cursor: 'pointer' };

const triesLabel = (tries) => (tries === 0 ? 'Until right' : `${tries} ${tries === 1 ? 'try' : 'tries'}`);

const SAME_EQUATIONS_HINT = Object.freeze({
  [LINE_GRAPH_FORMAT.CLASSIC]: 'Recommended for Classic: between rounds the class sees the line everyone graphed, and the most common mistake.',
  [LINE_GRAPH_FORMAT.SPRINT]: 'Everyone gets the same equations, each student in their own order. Off: everyone gets their own.',
  [LINE_GRAPH_FORMAT.RUSH]: 'Everyone gets the same equations, each student in their own order. Off: everyone gets their own.',
});

export default function LineGraphSetup({ setup, onChange, classSize = 0, onPractice = null }) {
  const problem = useMemo(() => lineSetupProblem(setup), [setup]);
  const update = (patch) => onChange(changeLineSetup(setup, patch));
  const limits = LINE_ROUND_LIMITS[setup.format];
  const ladder = grandPrixLadder(classSize || 24);
  const naming = setup.itemTypes.includes(LINE_ITEM_TYPE.NAME);

  return (
    <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 16 }} data-mm-line-setup="1">
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 900, marginBottom: 8 }}>Format</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 8 }}>
          {LINE_FORMAT_OPTIONS.map((option) => (
            <button key={option.id} type="button" aria-pressed={setup.format === option.id} onClick={() => onChange(changeLineFormat(setup, option.id))} style={formatCard(setup.format === option.id)}>
              <span style={{ fontSize: 'calc(16 * var(--mm-px))' }}>{option.label}</span>
              <span style={{ fontWeight: 500, fontSize: 'calc(13 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>{option.description}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 900, marginBottom: 8 }}>Start from a preset</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {LINE_GRAPH_PRESETS.map((preset) => (
            <button key={preset.id} type="button" aria-pressed={setup.presetId === preset.id} title={preset.description} onClick={() => onChange(applyLinePreset(setup, preset.id))} style={chip(setup.presetId === preset.id)}>
              {preset.label}
            </button>
          ))}
        </div>
        <span style={hint}>{getLineGraphPreset(setup.presetId)?.description || 'Custom settings.'} Presets are starting points — change anything below.</span>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 900, marginBottom: 8 }}>What students do</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {LINE_ITEM_TYPE_OPTIONS.map((option) => (
            <label key={option.id} style={{ ...chip(setup.itemTypes.includes(option.id)), display: 'inline-flex', alignItems: 'center', gap: 7 }} title={option.description}>
              <input type="checkbox" checked={setup.itemTypes.includes(option.id)} onChange={() => update({ itemTypes: toggle(setup.itemTypes, option.id) })} />
              {option.label} <span style={{ fontWeight: 500, color: 'var(--mm-text-muted)' }}>— {option.description}</span>
            </label>
          ))}
        </div>
        {naming && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }} role="radiogroup" aria-label="How students name a line">
            {LINE_NAME_STYLE_OPTIONS.map((option) => (
              <label key={option.id} style={{ ...chip(setup.nameStyle === option.id), display: 'inline-flex', alignItems: 'center', gap: 7 }} title={option.description}>
                <input type="radio" name="line-name-style" checked={setup.nameStyle === option.id} onChange={() => update({ nameStyle: option.id })} />
                Name it: {option.label}
              </label>
            ))}
            <span style={hint}>{LINE_NAME_STYLE_OPTIONS.find((option) => option.id === setup.nameStyle)?.description} Horizontal and vertical lines are always chosen from four.</span>
          </div>
        )}
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 900, marginBottom: 8 }}>Forms of equation</legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {LINE_FORM_OPTIONS.map((option) => (
            <label key={option.id} style={{ ...chip(setup.forms.includes(option.id)), display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <input type="checkbox" checked={setup.forms.includes(option.id)} onChange={() => update({ forms: toggle(setup.forms, option.id) })} />
              {option.label} <span style={{ fontWeight: 600, color: 'var(--mm-text-muted)' }}>{LINE_FORM_PATTERNS[option.id]}</span>
            </label>
          ))}
          <label style={{ ...chip(setup.specialLines), display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <input type="checkbox" checked={setup.specialLines} onChange={() => update({ specialLines: !setup.specialLines })} />
            Horizontal and vertical lines <span style={{ fontWeight: 600, color: 'var(--mm-text-muted)' }}>x = h, y = k</span>
          </label>
        </div>
        <span style={hint}>Standard form is graphed by its intercepts: students find where the line crosses each axis and connect them.</span>
      </fieldset>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
        <label style={{ fontWeight: 800 }}>Difficulty
          <select value={setup.difficulty} onChange={(event) => update({ difficulty: event.target.value })} style={field}>
            {LINE_DIFFICULTY_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <span style={hint}>{LINE_DIFFICULTY_OPTIONS.find((option) => option.id === setup.difficulty)?.description}</span>
        </label>
        <label style={{ fontWeight: 800 }}>Tries for each line
          <select value={setup.triesPerItem} onChange={(event) => update({ triesPerItem: Number(event.target.value) })} style={field}>
            {LINE_TRIES_OPTIONS.map((tries) => <option key={tries} value={tries}>{triesLabel(tries)}</option>)}
          </select>
          <span style={hint}>A wrong line gets a hint and stays on the grid to fix. After the last try the line is shown and the next one appears.{setup.triesPerItem === 0 ? ' "Until right" still moves a student on after 8 misses.' : ''}</span>
        </label>
        {setup.format === LINE_GRAPH_FORMAT.SPRINT && (
          <label style={{ fontWeight: 800 }}>Lines in a Sprint
            <select value={setup.sprintLength} onChange={(event) => update({ sprintLength: Number(event.target.value) })} style={field}>
              {LINE_SPRINT_LENGTHS.map((length) => <option key={length} value={length}>{length} lines</option>)}
            </select>
            <span style={hint}>A round ends when everyone has finished the set, or at the clock.</span>
          </label>
        )}
        <label style={{ fontWeight: 800 }}>Rounds
          <select value={setup.roundCount} onChange={(event) => onChange({ ...setup, roundCount: Number(event.target.value) })} style={field}>
            {Array.from({ length: limits.maxRounds - limits.minRounds + 1 }, (_, index) => limits.minRounds + index)
              .map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <label style={{ fontWeight: 800 }}>Time per round
          <select value={setup.roundSeconds} onChange={(event) => onChange({ ...setup, roundSeconds: Number(event.target.value) })} style={field}>
            {limits.secondsOptions.map((seconds) => <option key={seconds} value={seconds}>{seconds >= 120 && seconds % 60 === 0 ? `${seconds / 60} minutes` : `${seconds} seconds`}</option>)}
          </select>
          <span style={hint}>{setup.format === LINE_GRAPH_FORMAT.RUSH ? 'Each student graphs as many lines as they can.' : 'The round ends early once everyone has finished.'}</span>
          <span style={hint} data-mm-line-extra-time-rule="1">{lineExtraTimeRule(setup.format)}</span>
        </label>
        <label style={{ fontWeight: 800 }}>Scoring
          <select value={setup.scoringStrategyId} onChange={(event) => onChange({ ...setup, scoringStrategyId: event.target.value })} style={field}>
            {LINE_SCORING_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <span style={hint}>{LINE_SCORING_OPTIONS.find((option) => option.id === setup.scoringStrategyId)?.description}</span>
        </label>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        <legend style={{ fontWeight: 900, marginBottom: 8 }}>Options</legend>
        <label style={switchRow}>
          <input type="checkbox" checked={setup.sameEquations} onChange={() => update({ sameEquations: !setup.sameEquations })} />
          <span>Everyone gets the same equations<span style={hint}>{SAME_EQUATIONS_HINT[setup.format]}</span></span>
        </label>
        <label style={switchRow}>
          <input type="checkbox" checked={setup.showMethod} onChange={() => update({ showMethod: !setup.showMethod })} />
          <span>Show your method<span style={hint}>A line counts only through its key points — the y-intercept, both intercepts, or the point in the equation. The right line through other points is neither right nor wrong: the student is asked to redraw it.</span></span>
        </label>
        <label style={switchRow}>
          <input type="checkbox" checked={setup.slopeHelper} onChange={() => update({ slopeHelper: !setup.slopeHelper })} />
          <span>Slope helper<span style={hint}>Shows the rise and run between a student&apos;s two points ("up 2, right 3") while they place them. A student whose support plan has graph paper or a graphic organizer always gets it; only they see that.</span></span>
        </label>
      </fieldset>

      {problem && <div role="alert" style={{ padding: '10px 13px', borderRadius: 9, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', border: '1px solid var(--mm-warning-border)', fontWeight: 800 }}>{problem}</div>}

      <section style={{ padding: 15, borderRadius: 12, background: 'var(--mm-info-bg)', border: '1px solid var(--mm-info-border)', color: 'var(--mm-info-text)' }}>
        <h3 style={{ margin: '0 0 8px' }}>How it works</h3>
        <p style={{ margin: '0 0 8px', fontWeight: 700 }}>
          There is no Submit button: a line is checked the moment a student lets go of its second point, so they see right away and keep moving.
          A wrong line gets a hint that names what to check — never the answer.
        </p>
        {setup.scoringStrategyId === 'grandPrix' ? (
          <>
            <div style={{ fontWeight: 800 }}>
              Each round ranks students by lines right (a wrong check costs 1/20 of a line), then accuracy, then who finished first.
              {classSize ? ` With ${Math.max(2, classSize)} players:` : ' With 24 players:'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {ladder.map(({ place, points }) => (
                <span key={place} style={{ padding: '5px 9px', borderRadius: 999, background: 'var(--mm-surface)', color: 'var(--mm-text-strong)', fontWeight: 800 }}>
                  {place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`} +{points}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontWeight: 800 }}>One point per line right, added up over every round. Ties are broken by accuracy.</div>
        )}
      </section>

      {typeof onPractice === 'function' && (
        <div>
          <button type="button" disabled={Boolean(problem)} onClick={onPractice} style={{ border: '1px solid var(--mm-border)', borderRadius: 9, padding: '10px 15px', background: 'var(--mm-surface)', color: 'var(--mm-text-strong)', fontWeight: 900, cursor: problem ? 'not-allowed' : 'pointer', opacity: problem ? 0.55 : 1 }}>
            Try it yourself first
          </button>
          <span style={hint}>Play these settings on the student screen. Nothing is recorded and no students are invited.</span>
        </div>
      )}
    </div>
  );
}
