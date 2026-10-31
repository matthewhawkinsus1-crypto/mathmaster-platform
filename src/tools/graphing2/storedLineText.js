/*
 * THE LINE A GRAPHING RECORD STORES, AS A PERSON READS IT (GR30).
 *
 * The shared grader stores the student's line as formatLine writes it
 * (functions/shared/toolMath/graphing2/graphingMath.mjs): "y = 1x + 0",
 * "y = 0.66666667x + 2", "y = -1x − 4". That text is the record, and it stays
 * exactly as it is: every record already stored holds that shape, and nothing
 * grades from it. Where a record is read — the teacher's Response Inspector,
 * the Spotlight projector, the student's closed-question card — it is shown
 * the way the student's own readout writes a line (lineReadout.js): "y = x",
 * "y = (2/3)x + 2", "y = −x − 4". Old and new records therefore read alike.
 *
 * Only text that is exactly formatLine's shape is rewritten, and only for a
 * Graphing question: a typed answer is always shown as the student typed it.
 */
import { lineReadoutLatex, lineReadoutText } from './lineReadout.js';

const NUMBER = '-?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?';
// formatLine: 'y = ' + m + 'x ' + ('+' | '−') + ' ' + |b|, or 'x = ' + x.
const STORED_LINE = new RegExp(`^y = (${NUMBER})x ([+−]) (${NUMBER})$`);
const STORED_VERTICAL = new RegExp(`^x = (${NUMBER})$`);

/** The line a stored formatLine text describes, or null for any other text. */
export const storedGraphingLine = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const line = STORED_LINE.exec(text);
  if (line) {
    const m = Number(line[1]);
    const b = Number(line[3]) * (line[2] === '−' ? -1 : 1);
    return Number.isFinite(m) && Number.isFinite(b) ? { kind: 'line', m, b } : null;
  }
  const vertical = STORED_VERTICAL.exec(text);
  if (vertical && Number.isFinite(Number(vertical[1]))) return { kind: 'vertical', x: Number(vertical[1]) };
  return null;
};

const isGraphingQuestion = (question) => [question?.type, question?.toolId].includes('graphing2');

/** A stored part response, readable: a Graphing line as the readout writes it; anything else unchanged. */
export const readableStoredResponse = (value, question) => {
  if (!isGraphingQuestion(question)) return value;
  const line = storedGraphingLine(value);
  return line ? lineReadoutText(line) ?? value : value;
};

/** The same, as LaTeX, for a place that draws the response as mathematics. */
export const readableStoredResponseLatex = (value, question) => {
  if (!isGraphingQuestion(question)) return value;
  const line = storedGraphingLine(value);
  return line ? lineReadoutLatex(line) ?? value : value;
};
