import React from 'react';
import MathDisplay from '../../MathDisplay.jsx';

// Prose with mathematics in it, rendered as mathematics.
//
// `QuestionPrompt` already does this for the main prompt, but it carries the
// whole "Your question" card with it. Choice labels, table cells, feedback and
// solution-review lines need the same `$…$` handling with no chrome at all, and
// writing `x^2` on a student's screen — which is what happens without this — is
// the specific thing the bank quality audit flags as `ascii-exponent`.

const MATH_SEGMENT = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g;

const isMathSegment = (segment) => {
  MATH_SEGMENT.lastIndex = 0;
  const result = MATH_SEGMENT.test(segment);
  MATH_SEGMENT.lastIndex = 0;
  return result;
};

const unwrap = (segment) => {
  if (segment.startsWith('$$')) return { value: segment.slice(2, -2), inline: false };
  if (segment.startsWith('\\[')) return { value: segment.slice(2, -2), inline: false };
  if (segment.startsWith('\\(')) return { value: segment.slice(2, -2), inline: true };
  return { value: segment.slice(1, -1), inline: true };
};

// Typography for the plain-text parts. Calculator-style `x^-1` and `!=` are
// author shorthand, not something a student should read.
const tidy = (value) => String(value ?? '')
  .replace(/([A-Za-z0-9)])\^-1\b/g, '$1⁻¹')
  .replace(/<=/g, '≤')
  .replace(/>=/g, '≥')
  .replace(/!=/g, '≠')
  .replace(/\+\/-/g, '±');

export const MathText = ({ children, style = {}, as: Tag = 'span' }) => {
  const text = String(children ?? '');
  if (!text) return null;
  const segments = text.split(MATH_SEGMENT).filter(Boolean);
  return (
    <Tag style={style}>
      {segments.map((segment, index) => {
        if (!isMathSegment(segment)) {
          return <React.Fragment key={`t-${index}`}>{tidy(segment)}</React.Fragment>;
        }
        const math = unwrap(segment);
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
