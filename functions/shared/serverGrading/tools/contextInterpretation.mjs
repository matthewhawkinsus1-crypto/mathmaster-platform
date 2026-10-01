/*
 * Shared grader for the `contextInterpretation` structured question surface
 * (src/ContextInterpretation.jsx + src/PointMeaningBuilder.jsx) — run by the
 * screen for the verdict it reports, and by the server as the authority. See
 * ../toolGraderDefinition.mjs.
 *
 * The checks are buildContextInterpretationParts — the screen's own function,
 * moved verbatim to ../../toolMath/scenario/contextInterpretationUtils.mjs —
 * over the question as the config, prefix 'meaning':
 *
 *   builder  x/y quantity (id or accepted name), x/y value (1e-8), x/y unit
 *   guided   x/y value, x/y unit
 *   open     the text contains every required concept group (any non-blank
 *            text when none are authored — kept at parity, a content issue)
 *
 * `requireQuantities` / `requireValues` / `requireUnits: false` drop those
 * parts. The work is complete when there is at least one part and every part
 * is complete. A part is correct only when it is complete (creditCompleteParts):
 * `Number('')` is 0, so on its own a BLANK value box "matches" an expected 0.
 *
 * KNOWN CONTENT DRIFT, KEPT AT PARITY: the runtime reads `target.coordinates`
 * (or `coordinates`) and `quantities.{x,y}`; the type catalog advertises
 * `point` and an object-shaped `quantityChoices`, which the runtime never
 * read. A catalog-shaped item has no expected values or units, so those parts
 * cannot be correct — here exactly as on the old screen. Only a full
 * authoring fix (target + quantities) makes such an item gradeable.
 */
import declaration from '../declarations/contextInterpretation.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import { buildContextInterpretationParts } from '../../toolMath/scenario/contextInterpretationUtils.mjs';
import { creditCompleteParts, readPointMeaningWork } from '../../toolMath/scenario/scenarioWork.mjs';

const interpret = (question, work) => {
  const parts = creditCompleteParts(buildContextInterpretationParts(readPointMeaningWork(work), question, { prefix: 'meaning' }));
  return gradedResult({
    isComplete: parts.length > 0 && parts.every((part) => part.isComplete),
    parts,
  });
};

export default bindToolGrader(declaration, 'contextInterpretation', {
  builder: interpret,
  guided: interpret,
  open: interpret,
});
