/*
 * SHOW THE STEP: THE ENGINE'S READING OF A RECORDED STEP, FOR A TEACHER (SP-4).
 *
 * A submitted response carries the student's step as one line of text and no
 * verdict. Here the tool's own engine reads that line again
 * (checkpointEngine.js), so what a teacher is told is checked where it is
 * shown, never taken from the record. Loaded only for a response with a step.
 */
import { checkCheckpoint, readCheckpointSource } from './checkpointEngine.js';
import { readCheckpointWork } from './checkpointLine.js';
import { stepVerdictText } from './checkpointWords.js';

export default function StepVerdict({ step, line }) {
  const source = readCheckpointSource(step);
  const check = source.ok ? checkCheckpoint(step, readCheckpointWork(source.kind, typeof line === 'string' ? line : '')) : null;
  const state = !source.ok ? 'unread' : !check.done ? 'unfinished' : check.ok ? 'accepted' : 'not-accepted';
  return (
    <span data-step-verdict={state}>
      <span aria-hidden="true">{state === 'accepted' ? '✓ ' : state === 'not-accepted' ? '✗ ' : '· '}</span>
      {stepVerdictText(source, check)}
      <span style={{ display: 'block', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>The step is the student&apos;s work. It does not change the score.</span>
    </span>
  );
}
