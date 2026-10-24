import React from 'react';
import { SR_ONLY_STYLE } from '../../ui/srOnly.js';

/*
 * A GRADE THE STUDENT CHOSE TO HIDE (AX15, H-69).
 *
 * "Hide grade" shows dots where the number was. A screen reader read the dots
 * themselves ("Period 1 bullet bullet · 3 assignments"); it now hears "grade
 * hidden", and the dots are for the eye only.
 */
export const HIDDEN_GRADE_WORDS = 'grade hidden';

export default function HiddenGradeMask({ dots = '••' }) {
  return (
    <>
      <span aria-hidden="true">{dots}</span>
      <span style={SR_ONLY_STYLE}>{HIDDEN_GRADE_WORDS}</span>
    </>
  );
}
