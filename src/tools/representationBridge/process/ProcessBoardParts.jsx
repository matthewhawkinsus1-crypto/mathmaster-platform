import React from 'react';
import MathDisplay from '../../../MathDisplay.jsx';
import { Latex, muted, pointLatex, touchButton } from './processUi.jsx';
import { fractionLatex } from '../linearMultipleRepresentationsMath.js';
import {
  establishedPoints,
  factDisplay,
  lmrFactLabel,
  lmrFindLabel,
  lmrLockedCardWays,
  studentMethodLabel,
} from '../lmrProcessMath.js';

/*
 * PROCESS MODE ON THE BOARD ITSELF: what the student knows, what a locked card
 * is waiting for, and the facts they can reuse where they build.
 *
 * Every "Find …" here is a door into the process workspace for one fact. The
 * mathematics on the board is the navigation: a fact the student does not
 * know yet is a button to go and find it, and a locked card names every way it
 * could open, so no pathway is presented as the one to take.
 */

const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  minHeight: 44,
  boxSizing: 'border-box',
  padding: '6px 12px',
  borderRadius: 12,
  border: '1px solid var(--mm-success-border)',
  background: 'var(--mm-success-subtle)',
  color: 'var(--mm-text-strong)',
  fontSize: 15,
};

const savedChipStyle = { ...chipStyle, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface-sunken)' };

const findStyle = {
  ...touchButton,
  border: '1px dashed #6f8fc4',
  background: 'var(--mm-surface)',
  color: 'var(--mm-primary-text)',
};

const isScenario = (question) => question?.source?.kind === 'scenario';

// A tick a screen reader says as a word.
const Verified = () => (
  <>
    <span aria-hidden="true" style={{ color: 'var(--mm-success-text)', fontWeight: 900 }}>✓</span>
    <span className="mm-sr-only">verified</span>
  </>
);

/** The value a fact chip shows, in the classroom's notation. */
const factValueLatex = (question, fact, record) => {
  if (fact === 'slope') return isScenario(question) ? fractionLatex(record.value) : factDisplay(record);
  if (fact === 'yIntercept' && isScenario(question)) return fractionLatex(record.value);
  return factDisplay(record);
};

function FactChip({ question, fact, record, verified, onChange }) {
  const label = lmrFactLabel(question, fact);
  const showLabel = !(fact === 'slope' && !isScenario(question));
  return (
    <span data-process-fact={fact} style={verified ? chipStyle : savedChipStyle}>
      {showLabel ? <strong style={{ fontSize: 14 }}>{label} =</strong> : null}
      <Latex value={factValueLatex(question, fact, record)} />
      {verified ? <Verified /> : null}
      <span style={{ fontSize: 12, color: 'var(--mm-text-muted)' }}>{studentMethodLabel(record)}</span>
      {onChange ? (
        <button type="button" onClick={onChange} style={{ ...touchButton, minHeight: 36, padding: '4px 10px', fontSize: 13 }} aria-label={`Change ${label}`}>
          Change
        </button>
      ) : null}
    </span>
  );
}

/**
 * WHAT I KNOW: the facts this student has established, each with how, and a
 * "Find …" for each one the board needs that they have not.
 */
export function ProcessFactsStrip({ question, process, relevant, canCheck, disabled, onFind, notice }) {
  const facts = process?.facts || {};
  const points = (Array.isArray(facts.point) ? facts.point : []).filter((record) => record?.point);
  const interceptsKnown = Boolean(facts.yIntercept || facts.xIntercept);
  const find = (target, method = null) => (event) => onFind(target, method, event.currentTarget);
  return (
    <section
      aria-label="What I know"
      data-process-facts="true"
      tabIndex={-1}
      style={{ padding: '12px 14px', background: 'var(--mm-surface)', border: '1px solid var(--mm-tint-border)', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px 12px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16, color: 'var(--mm-text-strong)' }}>What I know</h3>
        <span style={muted}>
          {canCheck
            ? 'Find each fact with a method you choose. A checked fact is yours to reuse, and it opens more of the board.'
            : 'Find each fact with a method you choose and save it. What you save opens more of the board.'}
        </span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {relevant.filter((fact) => fact !== 'point').map((fact) => (
          <li key={fact}>
            {facts[fact] ? (
              <FactChip
                question={question}
                fact={fact}
                record={facts[fact]}
                verified={canCheck}
                onChange={!canCheck && !disabled && !facts[fact].base ? find(fact) : null}
              />
            ) : (
              <button type="button" data-process-find={fact} onClick={find(fact)} disabled={disabled} style={findStyle}>
                {lmrFindLabel(question, fact)}
              </button>
            )}
          </li>
        ))}
        {facts.siEquation ? (
          <li>
            <span data-process-fact="siEquation" style={canCheck ? chipStyle : savedChipStyle}>
              <strong style={{ fontSize: 14 }}>Your equation:</strong>
              <Latex value={factDisplay(facts.siEquation)} />
              {canCheck ? <Verified /> : null}
            </span>
          </li>
        ) : null}
        {relevant.includes('point') ? (
          <li style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {points.length ? (
              <span data-process-fact="point" style={canCheck || points.every((record) => record.base) ? chipStyle : savedChipStyle}>
                <strong style={{ fontSize: 14 }}>{points.length === 1 ? 'A point:' : 'Points:'}</strong>
                {points.map((record, index) => (
                  <React.Fragment key={record.key || index}>
                    {index > 0 ? <span aria-hidden="true">,</span> : null}
                    <Latex value={pointLatex(record.point)} />
                  </React.Fragment>
                ))}
                {canCheck ? <Verified /> : null}
              </span>
            ) : null}
            <button type="button" data-process-find="point" onClick={find('point')} disabled={disabled} style={findStyle}>
              {points.length ? 'Find another point' : lmrFindLabel(question, 'point')}
            </button>
            {interceptsKnown ? <span style={{ ...muted, fontSize: 12 }}>Your intercepts are points on the line too.</span> : null}
          </li>
        ) : null}
      </ul>
      {notice ? <p role="status" style={{ margin: 0, fontSize: 14, color: notice.tone === 'success' ? 'var(--mm-success-text)' : 'var(--mm-primary-text)', fontWeight: 700 }}>{notice.text}</p> : null}
    </section>
  );
}

/**
 * A card the student's facts have not opened yet: every way it could open,
 * with a "Find …" for each fact still missing.
 */
export function LockedCardBody({ question, process, cardId, onFind, disabled }) {
  const ways = lmrLockedCardWays(question, process, cardId);
  if (!ways.length) return <p style={muted}>This opens once you have established more facts about the line.</p>;
  const finds = [];
  const seen = new Set();
  ways.flat().forEach((need) => {
    const key = `${need.find.target}:${need.find.method || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    finds.push(need);
  });
  const phraseOf = (way) => way.map((need) => need.phrase).join(' and ');
  return (
    <div data-process-locked={cardId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ ...muted, color: 'var(--mm-text)' }}>
        <span aria-hidden="true">🔒 </span>
        Opens when you know {ways.map(phraseOf).join(' — or ')}.
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {finds.map((need) => (
          <button
            key={`${need.find.target}:${need.find.method || ''}`}
            type="button"
            data-process-find={need.find.target}
            disabled={disabled}
            onClick={(event) => onFind(need.find.target, need.find.method, event.currentTarget)}
            style={findStyle}
          >
            {need.find.method === 'solveForY' ? 'Solve the GIVEN for y' : lmrFindLabel(question, need.find.target)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The facts a card is built from, at hand where the student builds it. */
export function FactsAtHand({ question, process, facts: wanted = [], showPoints = false, verified }) {
  const facts = process?.facts || {};
  const items = wanted.filter((fact) => facts[fact]).map((fact) => (
    <span key={fact} style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline' }}>
      {fact === 'slope' && !isScenario(question) ? null : <span>{lmrFactLabel(question, fact)} =</span>}
      <MathDisplay value={factValueLatex(question, fact, facts[fact])} inline />
      {verified ? <span aria-hidden="true" style={{ color: 'var(--mm-success-text)' }}>✓</span> : null}
    </span>
  ));
  if (showPoints) {
    // 'all': every point the student knows, intercepts included (any of them
    // can be the point in point-slope form); otherwise only the points that
    // are not already listed as intercepts.
    const points = showPoints === 'all'
      ? establishedPoints(process)
      : (Array.isArray(facts.point) ? facts.point : []).filter((record) => record?.point);
    if (points.length) {
      items.push(
        <span key="points" style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span>{points.length === 1 ? 'a point' : 'points'}</span>
          {points.map((record, index) => (
            <React.Fragment key={record.key || index}>
              {index > 0 ? <span aria-hidden="true">,</span> : null}
              <MathDisplay value={pointLatex(record.point)} inline />
            </React.Fragment>
          ))}
        </span>,
      );
    }
  }
  if (!items.length) return null;
  return (
    <p data-process-at-hand="true" style={{ ...muted, color: 'var(--mm-text)', display: 'flex', gap: '4px 12px', flexWrap: 'wrap' }}>
      <span>You know:</span>
      {items}
    </p>
  );
}

/**
 * Points the student established, one tap to use: plotted on a graph or added
 * to the table. The tap places exactly the point they proved — the rest of
 * the construction (the slope's second point, the other rows) is still theirs.
 */
export function KnownPointChips({ process, verb, onUse, isUsed = () => false, disabled, filter = null }) {
  const points = establishedPoints(process).filter((record) => (filter ? filter(record) : true));
  if (!points.length) return null;
  return (
    <div data-process-reuse="true" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={muted}>{verb === 'Plot' ? 'Plot a point you know:' : 'Add a point you know:'}</span>
      {points.map((record) => {
        const used = isUsed(record.point);
        return (
          <button
            key={record.pointKey}
            type="button"
            disabled={disabled || used}
            onClick={() => onUse(record.point)}
            style={{ ...touchButton, padding: '6px 12px' }}
            aria-label={`${verb} ${pointLatex(record.point).replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, '$1/$2')}${used ? ' (already there)' : ''}`}
          >
            {verb} <Latex value={pointLatex(record.point)} />{used ? ' ✓' : ''}
          </button>
        );
      })}
    </div>
  );
}
