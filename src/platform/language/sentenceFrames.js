/*
 * HELP ME SAY IT — sentence frames for explaining reasoning.
 *
 * Support `sentence-frames` (functions/shared/supportCatalog.mjs). A frame is
 * a sentence starter with blanks (_____). It helps a student put THEIR
 * reasoning into words; it never contains an answer, a value from the item, a
 * conclusion, or which method to use. Curated here, matched deterministically —
 * there is no runtime generation.
 *
 * Offered only where an item asks the student to explain, justify, describe,
 * interpret or find an error (or carries a written-response field). Anywhere
 * else the tool is `not-applicable` — not missing.
 *
 * Each frame carries an English line and (for the built-in Spanish pack) a
 * Spanish line, shown together: the student may write in either language
 * their teacher accepts.
 */
import { segmentMathText } from './mathSafeText.js';

const frame = (en, es) => Object.freeze({ en, es });

/** Topic frame sets, most specific first. `when` is matched against prose. */
export const FRAME_SETS = Object.freeze([
  {
    id: 'correlation',
    when: /\b(correlation|correlated|association|scatter ?plot|trend)\b/i,
    frames: [
      frame('The data show a _____ correlation because as _____ increases, _____.', 'Los datos muestran una correlación _____ porque cuando _____ aumenta, _____.'),
      frame('I know there is _____ correlation because the points _____.', 'Sé que hay una correlación _____ porque los puntos _____.'),
    ],
  },
  {
    id: 'residual-model',
    when: /\b(residual|line of best fit|best-fit|regression|model|predict(ion)?)\b/i,
    frames: [
      frame('The model predicts _____ when _____.', 'El modelo predice _____ cuando _____.'),
      frame('The residual is _____, which means the actual value is _____ the predicted value.', 'El residuo es _____, lo que significa que el valor real es _____ el valor predicho.'),
      frame('This model is (is not) a good fit because _____.', 'Este modelo (no) se ajusta bien porque _____.'),
    ],
  },
  {
    id: 'system-solution',
    when: /\b(system|both equations|intersection|intersect|simultaneous)\b/i,
    frames: [
      frame('The point (__, __) is the solution because it _____ both equations.', 'El punto (__, __) es la solución porque _____ ambas ecuaciones.'),
      frame('I checked my solution by _____.', 'Comprobé mi solución al _____.'),
    ],
  },
  {
    id: 'transformation',
    when: /\b(transform|transformation|shift(ed|s)?|translat|reflect|stretch|compress|dilat)\w*/i,
    frames: [
      frame('The graph moved _____ units _____.', 'La gráfica se movió _____ unidades hacia _____.'),
      frame('Compared with the parent function, the graph is _____ because _____.', 'Comparada con la función madre, la gráfica está _____ porque _____.'),
    ],
  },
  {
    id: 'error-analysis',
    when: /\b(what is wrong|what went wrong|mistake|error|diagnose|correction|incorrect step|wrong)\b/i,
    frames: [
      frame('The mistake occurred when _____. The correct step should be _____.', 'El error ocurrió cuando _____. El paso correcto debe ser _____.'),
      frame('The student should have _____ instead of _____.', 'El estudiante debió _____ en lugar de _____.'),
    ],
  },
  {
    id: 'rate-of-change',
    when: /\b(slope|rate of change|per (hour|day|minute|week|year|unit)|unit rate|increase|decrease)\b/i,
    frames: [
      frame('The rate of change is _____, which means that for each _____, the _____ changes by _____.', 'La tasa de cambio es _____, lo que significa que por cada _____, _____ cambia en _____.'),
      frame('The slope shows that _____.', 'La pendiente muestra que _____.'),
    ],
  },
  {
    id: 'intercept',
    when: /\b(intercept|starting value|initial value|start(s|ed)? at)\b/i,
    frames: [
      frame('The _____-intercept is _____, which means _____.', 'La intersección con el eje _____ es _____, lo que significa _____.'),
      frame('At the start, the value is _____ because _____.', 'Al principio, el valor es _____ porque _____.'),
    ],
  },
  {
    id: 'domain-range',
    when: /\b(domain|range|reasonable values?|input values?|output values?)\b/i,
    frames: [
      frame('The domain is _____ because _____.', 'El dominio es _____ porque _____.'),
      frame('The values of _____ must be _____ because in this situation _____.', 'Los valores de _____ deben ser _____ porque en esta situación _____.'),
    ],
  },
  {
    id: 'inequality',
    when: /\b(inequalit|boundary|shade|shaded|dashed|solid)\w*/i,
    frames: [
      frame('The boundary line is _____ because _____.', 'La línea límite es _____ porque _____.'),
      frame('I shaded _____ because the points there _____.', 'Sombreé _____ porque los puntos ahí _____.'),
    ],
  },
  {
    id: 'sequence',
    when: /\b(sequence|common difference|common ratio|term)\b/i,
    frames: [
      frame('Each term is found by _____ the previous term.', 'Cada término se obtiene al _____ el término anterior.'),
      frame('This sequence is _____ because _____.', 'Esta sucesión es _____ porque _____.'),
    ],
  },
  {
    id: 'exponential',
    when: /\b(exponential|growth|decay|doubles|half-life|percent (increase|decrease))\b/i,
    frames: [
      frame('Each _____, the amount is multiplied by _____, so it is _____.', 'Cada _____, la cantidad se multiplica por _____, así que es _____.'),
    ],
  },
  {
    id: 'equivalent',
    when: /\b(equivalent|same value|equal for all)\b/i,
    frames: [
      frame('These expressions are (are not) equivalent because _____.', 'Estas expresiones (no) son equivalentes porque _____.'),
    ],
  },
  {
    id: 'compare',
    when: /\b(compare|comparison|greater|less|faster|slower|better|more|fewer)\b/i,
    frames: [
      frame('_____ is greater than _____ because _____.', '_____ es mayor que _____ porque _____.'),
      frame('Both _____ and _____ _____, but _____.', 'Tanto _____ como _____ _____, pero _____.'),
    ],
  },
]);

/** Always offered with a topic set (or alone, when no topic matches). */
export const GENERAL_FRAMES = Object.freeze([
  frame('I know _____ because _____.', 'Sé que _____ porque _____.'),
  frame('First, I _____. Next, I _____. Finally, I _____.', 'Primero, _____. Después, _____. Por último, _____.'),
  frame('My answer makes sense because _____.', 'Mi respuesta tiene sentido porque _____.'),
]);

const ASKS_FOR_WORDS = /\b(explain|explanation|justify|justification|describe|why|how do you know|how can you tell|interpret|what does .{1,60} (mean|represent)|what is wrong|what went wrong|diagnose|correction|mistake|reason|convince|argue|show that|tell how|conclusion|support your)\b/i;
const WRITTEN_TYPES = new Set([
  'explanation', 'shortanswer', 'short-answer', 'freeresponse', 'free-response', 'constructedresponse',
  'errorAnalysis'.toLowerCase(), 'written', 'writtenresponse', 'justification', 'essay',
]);

const proseOf = (text) => segmentMathText(text).filter((segment) => segment.kind === 'text').map((segment) => segment.value).join(' ');

/** Does this item ask the student to put reasoning into words? */
export const asksForExplanation = ({ text = '', question = null } = {}) => {
  if (ASKS_FOR_WORDS.test(proseOf(text))) return true;
  const type = String(question?.type || question?.responseType || '').toLowerCase();
  if (WRITTEN_TYPES.has(type)) return true;
  const fields = Array.isArray(question?.responseFields) ? question.responseFields : Array.isArray(question?.answerFields) ? question.answerFields : [];
  return fields.some((field) => ['text', 'explanation', 'justification', 'written', 'paragraph'].includes(String(field?.type || field?.inputType || field?.kind || '').toLowerCase()));
};

/**
 * The frames for one item: `{ applicable, sets: [ids], frames: [{ en, es }] }`.
 * Topic frames first (at most two topics), then the general frames.
 */
export const sentenceFramesFor = ({ text = '', question = null, toolType = '', limit = 6 } = {}) => {
  if (!asksForExplanation({ text, question })) return { applicable: false, sets: [], frames: [] };
  // A tool's own name counts as context ("regressionCalculator" → "regression Calculator").
  const prose = `${proseOf(text)} ${String(toolType || '').replace(/([a-z])([A-Z])/g, '$1 $2')}`;
  const sets = FRAME_SETS.filter((set) => set.when.test(prose)).slice(0, 2);
  const frames = [...sets.flatMap((set) => set.frames), ...GENERAL_FRAMES].slice(0, limit);
  return { applicable: true, sets: sets.map((set) => set.id), frames };
};

export default sentenceFramesFor;
