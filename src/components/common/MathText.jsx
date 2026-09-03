import React from 'react';
import MathDisplay from '../../MathDisplay.jsx';
import { isMathSegment, normalizePlainMathTypography, splitMathSegments, unwrapMathSegment } from './mathSegments.js';

// Prose with mathematics in it, rendered as mathematics.
//
// `QuestionPrompt` already does this for the main prompt, but it carries the
// whole "Your question" card with it. Choice labels, table cells, response-field
// labels, tool task cards, hints, feedback and solution-review lines need the
// same `$…$` handling with no chrome at all, and writing `x^2` on a student's
// screen — which is what happens without this — is the specific thing the bank
// quality audit flags as `ascii-exponent`.
//
// The splitting itself lives in ./mathSegments.js, shared with QuestionPrompt,
// so the two can never disagree about where the mathematics is.

export const MathText = ({ children, style = {}, as: Tag = 'span' }) => {
  const text = String(children ?? '');
  if (!text) return null;
  const segments = splitMathSegments(text);
  return (
    <Tag style={style}>
      {segments.map((segment, index) => {
        if (!isMathSegment(segment)) {
          return <React.Fragment key={`t-${index}`}>{normalizePlainMathTypography(segment)}</React.Fragment>;
        }
        const math = unwrapMathSegment(segment);
        return (
          <MathDisplay
            key={`m-${index}`}
            value={math.value}
            inline={math.inline}
            style={math.inline ? { margin: '0 0.15em' } : { margin: '10px 0' }}
          />
        );
      })}
    </Tag>
  );
};

export default MathText;
