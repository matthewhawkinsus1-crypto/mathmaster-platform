/*
 * Grading declaration for the `intervalNumberLine` registry tool.
 *
 * The tool has ONE view. What varies per question is which stages it asks for
 * (`ask`: graph, interval notation, inequality — default graph + interval),
 * and every asked stage is graded from the student's own work against the
 * question's `intervals`, which the server holds. Nothing the browser knows is
 * missing on the server.
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/intervalNumberLine.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export default declareTool({
  // Work shape v1 — exactly the tool's own state, as it has always submitted it:
  //   { intervals: [{ min, max, minClosed, maxClosed }],   the graph it built;
  //                                                         an unbounded end is
  //                                                         ±Infinity (sent as
  //                                                         "Infinity"/"-Infinity")
  //     notation: string,                                  the notation box
  //     inequality: string }                               the inequality box
  // The same object is what My Math Path's own intervalNumberLine contract reads.
  contractVersion: 1,
  // IntervalNumberLine.jsx never reads `question.mode`: every question renders
  // the same number line, with the asked stages beside it.
  defaultMode: 'numberLine',
  resolveMode: () => 'numberLine',
  modes: {
    numberLine: SHARED,
  },
  // A question with no `intervals` has no answer key. The tool used to mark an
  // empty graph "correct" against an empty key; nothing is marked against a
  // missing key now, on the device or on the server.
  supports: (question) => (
    Array.isArray(question?.intervals) && question.intervals.length > 0 && question.intervals.every(isPlainObject)
      ? { supported: true }
      : { supported: false, reason: 'no-answer-key' }
  ),
});
