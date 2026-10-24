import React from 'react';
import MathDisplay from '../../MathDisplay.jsx';
import {
  isMathSegment, mathTextFromChildren, normalizePlainMathTypography, splitMathSegments, splitProseFractionRuns, unwrapMathSegment,
} from './mathSegments.js';

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
//
// `language` is the language the prose around the mathematics is shown in. A
// translation passes its own ("es"), so the formulas inside it are spoken in
// that language and not as English in the middle of a Spanish sentence (AX06).

export const MathText = ({ children, style = {}, as: Tag = 'span', language }) => {
  const text = mathTextFromChildren(children);
  if (!text) return null;
  const segments = splitMathSegments(text);
  return (
    <Tag style={style}>
      {segments.map((segment, index) => {
        if (!isMathSegment(segment)) {
          // A raw mathematical fraction can appear in plain prose the author
          // never wrapped in $…$ ("Simplify 2/3."). Stack it the same as
          // delimited math instead of leaving a slash on the screen.
          const fractionRuns = splitProseFractionRuns(segment);
          return (
            <React.Fragment key={`t-${index}`}>
              {fractionRuns.map((run, runIndex) => (run.isFraction
                ? <MathDisplay key={`t-${index}-f-${runIndex}`} value={run.text} inline language={language} style={{ margin: '0 0.15em' }} />
                : <React.Fragment key={`t-${index}-p-${runIndex}`}>{normalizePlainMathTypography(run.text)}</React.Fragment>))}
            </React.Fragment>
          );
        }
        const math = unwrapMathSegment(segment);
        return (
          <MathDisplay
            key={`m-${index}`}
            value={math.value}
            inline={math.inline}
            language={language}
            style={math.inline ? { margin: '0 0.15em' } : { margin: '10px 0' }}
          />
        );
      })}
    </Tag>
  );
};

export default MathText;
