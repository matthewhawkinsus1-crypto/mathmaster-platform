/*
 * THE FIELD-BY-FIELD VIEW OF ONE STORED RESPONSE, FOR EVERY QUESTION TYPE.
 *
 * Drawn from the model's `view` (functions/shared/responseInspectorView.mjs):
 * a row per thing the grader marked, the key facts of graph and tool work, and
 * the final state and steps of Step Algebra or relation work. Raw JSON is only
 * ever behind "Raw stored response".
 *
 * A value is drawn exactly as it was written, as text: the characters a
 * student typed are the evidence (an unusual dash, a comma, a percent sign),
 * and the platform's own math drawing rewrites some of them (49% is drawn as a
 * fraction). A value written in LaTeX is also drawn as mathematics, through
 * typedMathLatex.js, which never throws: what it cannot draw is shown as
 * written. A Graphing line keeps the readout's spelling (storedLineText.js).
 *
 * A server that predates the view sends none: the rows are then built here
 * from the parts, snapshot and trace it does send (`viewFromOlderModel`).
 */
import MathDisplay from '../../MathDisplay.jsx';
import { typedLatex } from '../../platform/math/typedMathLatex.js';
import { readableStoredResponse } from '../../tools/graphing2/storedLineText.js';
import { SR_ONLY_STYLE } from '../../ui/srOnly.js';
import { asText } from './ResponseInspectorReasons.jsx';

const LATEX_COMMAND = /\\[A-Za-z]/;
const valueStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  overflowWrap: 'anywhere',
  whiteSpace: 'pre-wrap',
};
const mutedStyle = { color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' };
const cellStyle = { padding: '8px 10px', verticalAlign: 'top', textAlign: 'left', borderTop: '1px solid var(--mm-border)', minWidth: 110, overflowWrap: 'anywhere' };
// The part stays in view while the table scrolls sideways on a narrow screen.
const partStyle = { ...cellStyle, position: 'sticky', left: 0, zIndex: 1, boxShadow: '1px 0 0 var(--mm-border)' };

// Looked up by own key only: a status of "__proto__" or "constructor" is text, not a property.
// A disclosure's summary is a control: room enough to be one (WCAG 2.5.8).
const summaryStyle = { padding: '6px 0', cursor: 'pointer' };
const RESULT_MARK = new Map([['correct', '✓'], ['incorrect', '✗'], ['partial', '◐'], ['blank', '–'], ['ungraded', '·']]);

/** A value exactly as written; as mathematics too when it is LaTeX. Never throws. */
export function WrittenValue({ text, question = null, readable = false }) {
  const written = asText(text);
  if (written === '') return <span style={mutedStyle}>Blank</span>;
  const shown = readable ? asText(readableStoredResponse(written, question)) : written;
  return (
    <>
      <bdi data-inspector-value="" style={valueStyle}>{shown}</bdi>
      {LATEX_COMMAND.test(shown) && (
        <span style={{ display: 'block', marginTop: 4 }} data-inspector-drawn="">
          <MathDisplay value={typedLatex(shown)} format="latex" inline />
        </span>
      )}
    </>
  );
}

function ValueCell({ value, question, readable = false, empty = 'Not recorded' }) {
  if (!value || typeof value !== 'object') return <span style={mutedStyle}>{empty}</span>;
  if (value.unavailable) return <span style={mutedStyle}>{asText(value.text)}</span>;
  return (
    <>
      {value.option ? <span style={{ display: 'block', fontWeight: 700 }}>{asText(value.option)}</span> : null}
      {value.text !== undefined && (value.text !== '' || !value.note) ? <WrittenValue text={value.text} question={question} readable={readable} /> : null}
      {value.note ? <span style={{ ...mutedStyle, display: 'block' }}>{asText(value.note)}</span> : null}
    </>
  );
}

// A number only from a number or numeric text: Number() on an object whose
// toString is not a function throws.
const numberFrom = (value) => (typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN);

function ResultCell({ result }) {
  if (!result || typeof result !== 'object') return <span style={mutedStyle}>Not recorded</span>;
  const credit = Number.isFinite(numberFrom(result.credit)) && result.status !== 'ungraded' ? ` · ${Math.round(numberFrom(result.credit))}%` : '';
  return (
    <span data-result={asText(result.status)}>
      <span aria-hidden="true">{RESULT_MARK.get(asText(result.status)) || '·'} </span>
      {asText(result.label)}{credit}
    </span>
  );
}

function FactList({ facts, label }) {
  const entries = Array.isArray(facts) ? facts.filter((fact) => fact && typeof fact === 'object') : [];
  if (!entries.length) return null;
  return (
    <dl aria-label={label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, max-content) minmax(0, 1fr)', gap: '4px 12px', margin: '6px 0 0' }}>
      {entries.map((fact, index) => (
        <div key={index} style={{ display: 'contents' }}>
          <dt style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{asText(fact.label)}</dt>
          <dd style={{ margin: 0, minWidth: 0 }}><WrittenValue text={fact.value} /></dd>
        </div>
      ))}
    </dl>
  );
}

// The rows the model sent before the view existed (an older server), built
// from its parts, snapshot, saved workspace, trace and key.
const show = (value) => (value === null || value === undefined ? null : typeof value === 'string' ? value : (() => { try { return JSON.stringify(value); } catch { return ''; } })());
const fieldMap = (state) => (state?.kind === 'fields' ? Object.fromEntries((state.fields || []).map((field) => [field?.id, field?.value])) : null);
const savedValue = (workspace, fieldId) => {
  if (!workspace?.available) return null;
  for (const entry of workspace.entries || []) {
    if (entry?.value && typeof entry.value === 'object' && !Array.isArray(entry.value) && Object.prototype.hasOwnProperty.call(entry.value, fieldId)) return entry.value[fieldId];
  }
  return workspace.entries?.length === 1 ? workspace.entries[0].value : null;
};
export const viewFromOlderModel = (model) => {
  const parts = Array.isArray(model?.automaticResult?.parts) ? model.automaticResult.parts : [];
  const states = model?.states || {};
  const submitted = fieldMap(states.submitted);
  const legacy = fieldMap(states.legacyRecorded);
  const traces = new Map((states.gradingTrace?.fields || []).map((field) => [String(field?.id), field]));
  return {
    kind: 'older-model',
    snapshotLabel: states.submitted ? 'Submitted Snapshot' : 'Recorded grader response (legacy)',
    rows: (parts.length ? parts : [{ id: 'response' }]).map((part) => {
      const id = String(part?.id ?? '');
      const trace = traces.get(id);
      const graded = submitted ? submitted[id] : legacy ? legacy[id] : (states.submitted?.value ?? part?.response);
      return {
        id,
        label: asText(part?.label || id),
        saved: (() => { const saved = savedValue(states.workspace, id); return saved === null || saved === undefined ? null : { text: show(saved) ?? '' }; })(),
        submitted: graded === undefined ? null : { text: show(graded) ?? '' },
        read: trace?.normalizedAvailable ? { text: show(trace.normalized) ?? '' } : null,
        expected: model?.expectedAvailable === false ? { unavailable: true, text: model?.expectedUnavailableReason } : { text: show(trace?.expected ?? model?.expected?.[id] ?? null) ?? '' },
        result: part?.isCorrect === undefined ? null : { status: part.isCorrect ? 'correct' : 'incorrect', label: part.isCorrect ? 'Correct' : 'Incorrect' },
      };
    }),
    facts: [],
    savedFacts: [],
    final: [],
    steps: [],
  };
};

export default function ResponseInspectorFieldView({ model }) {
  const view = model?.view && typeof model.view === 'object' ? model.view : viewFromOlderModel(model);
  const question = { type: model?.question?.type, toolId: model?.question?.type };
  const rows = Array.isArray(view.rows) ? view.rows.filter((row) => row && typeof row === 'object') : [];
  const steps = Array.isArray(view.steps) ? view.steps.filter((step) => step && typeof step === 'object') : [];
  const raw = model?.states?.submitted ?? model?.states?.legacyRecorded ?? null;
  // A column every row leaves empty (a tool's checks have no saved value, no
  // reading and no single key) is left out, so a phone keeps its width for
  // what there is.
  const shows = {
    saved: rows.some((row) => row.saved),
    read: rows.some((row) => row.read),
    expected: rows.some((row) => row.expected),
  };
  return (
    <div data-inspector-field-view={asText(view.kind)}>
      <p style={mutedStyle}>Keystrokes are not recorded. The submitted response is the closest record of what the student typed.</p>
      {rows.length > 0 ? (
        <div role="region" aria-label="Field comparison" tabIndex={0} style={{ overflowX: 'auto', border: '1px solid var(--mm-border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            {/* The table's name for a screen reader; the paragraph above the
                table says the same to the eye, and a visible caption would
                scroll sideways with the table on a phone. */}
            <caption style={SR_ONLY_STYLE}>Each part: what was saved, what was graded, how the grader read it, the expected answer and the result.</caption>
            <thead>
              <tr style={{ background: 'var(--mm-surface-sunken)' }}>
                <th scope="col" style={{ ...partStyle, background: 'var(--mm-surface-sunken)' }}>Part</th>
                {shows.saved && <th scope="col" style={cellStyle}>Saved Workspace{view.savedTiming ? <span style={{ ...mutedStyle, display: 'block', fontWeight: 400 }}>{asText(view.savedTiming)}</span> : null}</th>}
                <th scope="col" style={cellStyle}>{asText(view.snapshotLabel || 'Submitted Snapshot')}</th>
                {shows.read && <th scope="col" style={cellStyle}>Read by the grader as</th>}
                {shows.expected && <th scope="col" style={cellStyle}>Expected</th>}
                <th scope="col" style={cellStyle}>Automatic Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${asText(row.id)}-${index}`} data-inspector-row={asText(row.id)}>
                  <th scope="row" style={{ ...partStyle, fontWeight: 700, background: 'var(--mm-surface)' }}>{asText(row.label || row.id)}</th>
                  {shows.saved && <td style={cellStyle}><ValueCell value={row.saved} question={question} /></td>}
                  <td style={cellStyle}><ValueCell value={row.submitted} question={question} readable /></td>
                  {shows.read && <td style={cellStyle}><ValueCell value={row.read} question={question} empty="—" /></td>}
                  {shows.expected && <td style={cellStyle}><ValueCell value={row.expected} question={question} empty="—" /></td>}
                  <td style={cellStyle}><ResultCell result={row.result} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {view.unreadable ? <p style={mutedStyle}>The stored work could not be read ({asText(view.unreadable)}).</p> : null}
      {Array.isArray(view.facts) && view.facts.length > 0 && (
        <section aria-labelledby="inspector-work-facts">
          <h4 id="inspector-work-facts" style={{ margin: '14px 0 0' }}>The submitted work</h4>
          <FactList facts={view.facts} label="The submitted work" />
        </section>
      )}
      {Array.isArray(view.final) && view.final.length > 0 && (
        <section aria-labelledby="inspector-work-final">
          <h4 id="inspector-work-final" style={{ margin: '14px 0 0' }}>Where the work ended</h4>
          <FactList facts={view.final} label="Where the work ended" />
        </section>
      )}
      {steps.length > 0 && (
        <section aria-labelledby="inspector-work-steps">
          <h4 id="inspector-work-steps" style={{ margin: '14px 0 0' }}>Steps the student took</h4>
          {view.stepsTiming ? <p style={mutedStyle}>From the saved workspace, {asText(view.stepsTiming)}.</p> : null}
          <ol style={{ margin: '6px 0 0', paddingLeft: 22, display: 'grid', gap: 6 }}>
            {steps.map((step, index) => (
              <li key={index} style={{ overflowWrap: 'anywhere' }}>
                <span style={{ fontWeight: 700 }}>{asText(step.description)}</span>
                <span style={{ display: 'block' }}><WrittenValue text={step.before} /> <span aria-hidden="true">→</span><span style={SR_ONLY_STYLE}> becomes </span> <WrittenValue text={step.after} /></span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {Array.isArray(view.savedFacts) && view.savedFacts.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={summaryStyle}>Saved workspace{view.savedTiming ? ` (${asText(view.savedTiming)})` : ''}</summary>
          <FactList facts={view.savedFacts} label="Saved workspace" />
        </details>
      )}
      {raw !== null && (
        <details style={{ marginTop: 12 }}>
          <summary style={summaryStyle}>Raw stored response</summary>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', ...mutedStyle }}>{show(raw)}</pre>
        </details>
      )}
    </div>
  );
}
