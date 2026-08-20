import React from 'react';
import MathText from '../common/MathText.jsx';

// The material a Path question gives the student to work FROM.
//
// A table to read, a set of ordered pairs to classify, another student's work
// to find the error in, a list of expressions to compare. Before this existed
// the only way to put a table in a non-tool Path question was to draw it in the
// prompt with pipes and dashes, which is why every starter item ended up being
// a paragraph with "A) … B) … C) …" typed at the bottom.
//
// Rendered ABOVE the response controls and inside the same card, so on a
// Chromebook the student can see what they are reading and what they are
// answering at the same time without scrolling between them.

const shell = {
  margin: '0 0 16px',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid #dfe3e8',
  background: '#fbfcfe',
};

const titleStyle = {
  margin: '0 0 8px',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  color: '#5f6368',
};

const cellStyle = {
  padding: '7px 12px',
  border: '1px solid #dfe3e8',
  fontSize: 15,
  color: '#202124',
  textAlign: 'center',
  whiteSpace: 'nowrap',
};

function StimulusTable({ table }) {
  if (!table?.rows?.length && !table?.headers?.length) return null;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', margin: '0 auto', minWidth: 'min(100%, 220px)' }}>
        {table.headers?.length > 0 && (
          <thead>
            <tr>
              {table.headers.map((header, index) => (
                <th key={`h-${index}`} scope="col" style={{ ...cellStyle, background: '#eef3fb', fontWeight: 900 }}>
                  <MathText>{header}</MathText>
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {(table.rows || []).map((row, rowIndex) => (
            <tr key={`r-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`c-${rowIndex}-${cellIndex}`} style={cellStyle}>
                  <MathText>{cell}</MathText>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderedPairList({ pairs }) {
  if (!pairs?.length) return null;
  return (
    <p style={{ margin: 0, fontSize: 17, color: '#202124', lineHeight: 1.7, textAlign: 'center' }}>
      {'{ '}
      {pairs.map((pair, index) => (
        <span key={`p-${index}`} style={{ whiteSpace: 'nowrap' }}>
          ({pair.x}, {pair.y}){index < pairs.length - 1 ? ', ' : ''}
        </span>
      ))}
      {' }'}
    </p>
  );
}

function WorkedSteps({ steps }) {
  if (!steps?.length) return null;
  return (
    <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 6 }}>
      {steps.map((step) => (
        <li key={step.id} style={{ fontSize: 15, color: '#202124', lineHeight: 1.6 }}>
          <span style={{ color: '#5f6368', fontWeight: 700, marginRight: 8 }}>{step.label}</span>
          <MathText>{step.work}</MathText>
        </li>
      ))}
    </ol>
  );
}

function ExpressionList({ expressions }) {
  if (!expressions?.length) return null;
  return (
    <div style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
      {expressions.map((expression, index) => (
        <MathText key={`e-${index}`} style={{ fontSize: 18, color: '#202124' }}>{expression}</MathText>
      ))}
    </div>
  );
}

function LabelledItems({ items }) {
  if (!items?.length) return null;
  return (
    <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 5 }}>
      {items.map((item) => (
        <li key={item.id} style={{ fontSize: 15, color: '#202124', lineHeight: 1.6 }}>
          <MathText>{item.label}</MathText>
        </li>
      ))}
    </ul>
  );
}

export const PathQuestionStimulus = ({ stimulus }) => {
  if (!stimulus) return null;
  const hasContent = Boolean(
    stimulus.table?.rows?.length
    || stimulus.orderedPairs?.length
    || stimulus.steps?.length
    || stimulus.expressions?.length
    || stimulus.items?.length,
  );
  if (!hasContent) return null;

  return (
    <section style={shell} aria-label={stimulus.title || 'Question information'}>
      {stimulus.title && <h2 style={titleStyle}>{stimulus.title}</h2>}
      <StimulusTable table={stimulus.table} />
      <OrderedPairList pairs={stimulus.orderedPairs} />
      <WorkedSteps steps={stimulus.steps} />
      <ExpressionList expressions={stimulus.expressions} />
      <LabelledItems items={stimulus.items} />
      {stimulus.note && (
        <p style={{ margin: '10px 0 0', fontSize: 13, color: '#5f6368', lineHeight: 1.55 }}>
          <MathText>{stimulus.note}</MathText>
        </p>
      )}
    </section>
  );
};

export default PathQuestionStimulus;
