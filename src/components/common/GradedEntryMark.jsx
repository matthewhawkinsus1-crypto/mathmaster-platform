/*
 * A GRADED ENTRY SAYS WHETHER IT WAS RIGHT IN WORDS, NOT ONLY IN COLOUR.
 *
 * The legacy graders (TableGrader, GraphLine) marked a wrong entry with a red
 * border and a right one with a green border, and told the student "Incorrect
 * blanks are outlined" — while every box had an outline. A colour-blind
 * student could not tell them apart, and a screen reader heard nothing (pass 3,
 * A11Y-8, WCAG 1.4.1 and 3.3.1). Each graded entry now shows "✗ Check this" or
 * "✓ Correct" under it, its input is aria-invalid when wrong, and the mark is
 * the input's description.
 */
import { gradedEntryState } from './gradedEntryState.js';

export const gradedEntryInputProps = (grade, markId) => {
  const state = gradedEntryState(grade);
  if (!state) return {};
  return { 'aria-invalid': state.invalid ? 'true' : undefined, 'aria-describedby': markId };
};

export default function GradedEntryMark({ grade, id }) {
  const state = gradedEntryState(grade);
  if (!state) return null;
  return (
    <span
      id={id}
      data-graded-entry-mark={state.invalid ? 'wrong' : 'right'}
      style={{
        display: 'block',
        marginTop: 4,
        fontSize: 'calc(13 * var(--mm-px))',
        fontWeight: 800,
        color: state.invalid ? 'var(--mm-error-text)' : 'var(--mm-success-text)',
      }}
    >
      <span aria-hidden="true">{state.symbol} </span>{state.text}
    </span>
  );
}
