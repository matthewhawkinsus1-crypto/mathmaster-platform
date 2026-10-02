/*
 * Grading declaration for the `sequenceExplorer` registry tool.
 *
 * Every mode is typed numbers, a family choice, typed rules or plotted (n, aₙ)
 * points, checked against a sequence the server rebuilds from the question's
 * own spec — nothing the browser holds that the server does not. A typed rule
 * is sampled with mathjs on both sides (functions/package.json ships it).
 *
 * Light by design: imported into the grading manifest, which the student
 * app's main bundle, Pre-Flight and the checkpoint writer all read. Never
 * import grading mathematics here — that belongs in ../tools/sequenceExplorer.mjs.
 */
import { SHARED, declareTool } from '../toolGraderDefinition.mjs';

// The views SequenceExplorer.jsx routes to by exact `mode` match; anything
// else (missing, unknown, mis-cased, padded, not a string) renders Analyze.
const ROUTED_VIEWS = Object.freeze(['fullBridge', 'ruleBridge', 'missingTerm', 'partialSum', 'compare']);

export default declareTool({
  // Work shape v1 — per mode, exactly the state the screen's inputs hold:
  //   analyze      { kindAnswer, changeAnswer, termAnswer }
  //   ruleBridge   { explicitRule, recursiveFirst, recursiveRule }
  //   fullBridge   { tableValues: string[], plottedPoints: [n, aₙ][], kindAnswer,
  //                  changeAnswer, explicitRule, recursiveFirst, recursiveRule, termAnswer }
  //   missingTerm  { termAnswer, kindAnswer }
  //   partialSum   { lastTerm, sumAnswer }
  //   compare      { relation: ''|'A'|'B'|'equal', difference,
  //                  leftPlottedPoints: [n, aₙ][], rightPlottedPoints: [n, aₙ][] }
  contractVersion: 1,
  // SequenceExplorer.jsx: `questionData.mode || 'analyze'`, then strict `===`
  // against each routed view, falling through to AnalyzeSequence. The
  // manifest's own fallback trims and stringifies the mode, so a padded
  // ' compare ' would resolve to compare there while the screen shows Analyze;
  // this reproduces the screen exactly.
  defaultMode: 'analyze',
  resolveMode: (question) => {
    const mode = question?.mode || 'analyze';
    return ROUTED_VIEWS.includes(mode) ? mode : 'analyze';
  },
  modes: {
    analyze: SHARED,
    ruleBridge: SHARED,
    fullBridge: SHARED,
    missingTerm: SHARED,
    partialSum: SHARED,
    compare: SHARED,
  },
});
