import { useMemo, useRef, useState } from 'react';
import {
  EXAMPLE_FADED_OPENED_TEXT,
  EXAMPLE_OPENED_BY_ITSELF_TEXT,
  EXAMPLE_SHOW_HOW_LABEL,
  EXAMPLE_SLIDE,
  EXAMPLE_YOUR_TURN_LABEL,
  SPOT_THE_MISTAKE_HEADING,
  SPOT_THE_MISTAKE_INTRO,
  SPOT_THE_MISTAKE_NOTE,
  SPOT_THE_MISTAKE_QUESTION,
  WHY_THIS_STEP_OTHER,
  WHY_THIS_STEP_NEXT,
  WHY_THIS_STEP_PROMPT,
  WHY_THIS_STEP_RIGHT,
  WHY_THIS_STEP_SKIP_LABEL,
  exampleSlideAt,
  exampleSlides,
  planeSummary,
  shownHowSlideIndex,
  slideReadingText,
  slideTranslationText,
  slideTurnText,
  spotTheMistakeChosenLabel,
  spotTheMistakeFeedback,
  spotTheMistakeReadingText,
  spotTheMistakeTranslationText,
  whyThisStepFor,
  whyThisStepReadingText,
  whyThisStepTranslationText,
} from './exampleSlides.js';

/*
 * THE WORKED-EXAMPLE PLAYER (WE-A; docs/platform/WORKED_EXAMPLES.md section 4
 * and 10). One slide at a time: the problem, each step with its why, the
 * answer. Next and Back are buttons, so the keyboard reaches them like any
 * other; the last slide's button is "Your turn", which hands the student their
 * own question (the caller closes the example and puts the cursor in the
 * work). What plays, and where, is decided in examplePlayer.js; opening it is
 * recorded by the caller (QuestionEngine) as workedExampleUsed.
 *
 * ACCESSIBILITY. The slide is a polite live region read whole, so a screen
 * reader hears each move and its why as it arrives. Back stays in the page on
 * the first slide (aria-disabled), and Next becomes "Your turn" in place, so
 * focus never falls off a button that went away. Nothing animates: a slide
 * replaces the last. The step, its why and the place in the example are
 * words, never colour alone; borders carry every edge, so forced colours draw
 * them. The row of buttons wraps, for a phone and for 200% text. Read aloud
 * and Translate take the slide through the pipeline Solution Review uses
 * (SupportedTextActions).
 *
 * A TOOL REPLAY (WE-C). A step that carries a `board` is one move of the
 * tool, drawn as the board shows it: the equation, the operation on both
 * sides, the equation once the cancelling terms are gone, and the next
 * equation. Every line is the tool's own engine's (stepAlgebraReplay.js); this
 * file only lays them out, each with its name in words. A faded example plays
 * its first moves and ends on "Your turn" with the rest left to the student.
 *
 * WHY THIS STEP? AND SPOT THE MISTAKE (WE-F). On Classwork (`whyThisStep`)
 * the slide before one step names that step's move and asks for its reason:
 * three choices, all of them the example's own whys, and Skip. A choice is
 * answered in a polite region and the choices go (focus goes to Next); Skip
 * and Next go on without one; the step then plays with its reason, as every
 * step does, and the example never asks again. Not scored and not recorded.
 * After the last slide of a whole example (`spotTheMistake`, Classwork and
 * Practice; a faded example has none) comes a step with the question's
 * common error in it and three choices for what is wrong with it: the first
 * choice made is the student's (aria-pressed, and "Your choice" in words), the
 * answer and the whole common error follow in a polite region, and
 * `onSpotTheMistake` is told, so the caller can record the fact. Neither
 * touches a score. Both read aloud and translate like the slide, and every
 * choice is a button of 44px or more with an edge of its own.
 *
 * Loaded on demand (HintPanel.jsx): nothing here is in a page that shows no
 * example. This chunk imports only React and its own slides (exampleSlides.js)
 * and shares no module with the question's chunk, so opening an example adds
 * nothing to what a page loads first (scripts/check-first-load-budget.mjs).
 */
const button = {
  minHeight: 44,
  minWidth: 88,
  padding: '8px 16px',
  borderRadius: 999,
  border: '1px solid var(--mm-primary-border)',
  background: 'var(--mm-primary-soft)',
  color: 'var(--mm-primary-text)',
  fontWeight: 800,
  cursor: 'pointer',
};
const primaryButton = { ...button, border: '2px solid var(--mm-primary-text)' };
const muted = { margin: 0, color: 'var(--mm-text-muted)' };

// A choice is a sentence: a full-width button that wraps, with an edge of its
// own (forced colours keep it), and a heavier edge once it is the one chosen.
const choiceButton = {
  ...button,
  display: 'block',
  width: '100%',
  minWidth: 0,
  textAlign: 'left',
  borderRadius: 12,
  fontWeight: 700,
  lineHeight: 1.45,
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  background: 'var(--mm-surface)',
};
// Chosen: a heavier edge and "Your choice" in words, on the same background
// (in forced colours a background is not kept, so it cannot carry the state).
const chosenButton = { ...choiceButton, border: '2px solid var(--mm-primary-text)' };
const checkBox = { display: 'grid', gap: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface)', minWidth: 0, margin: 0 };
const choiceList = { margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8, minWidth: 0 };

// Each example asks "Why this step?" once: Back to that step, or the example
// opened again (the player drawn anew), keeps the answer it was given. Kept by
// the example's own words, so a redrawn example is the same example.
const whyAnswers = new Map();
const exampleKey = (example) => [example?.prompt, ...(Array.isArray(example?.steps) ? example.steps : []).map((step) => (step && typeof step === 'object' ? step.show : step))].join('\n');

/*
 * WHY THIS STEP? The step's move is on the slide above; its reason is held
 * back until a choice is made or the question is skipped. The choices are
 * buttons, so the keyboard reaches them like Next; the caller moves focus to
 * Next once they go.
 */
export function WhyThisStep({ MathText, check, answer, onChoose, onSkip }) {
  const feedback = answer?.choice ? (answer.choice.right ? WHY_THIS_STEP_RIGHT : WHY_THIS_STEP_OTHER) : '';
  return (
    <fieldset data-why-this-step="" data-why-answered={answer ? '' : undefined} style={checkBox}>
      <legend style={{ padding: 0, fontWeight: 800, color: 'var(--mm-primary-text)' }}>{WHY_THIS_STEP_PROMPT}</legend>
      <p data-why-next-step="" style={{ margin: 0, lineHeight: 1.55, overflowWrap: 'anywhere' }}><strong>{WHY_THIS_STEP_NEXT}: </strong><MathText>{check.nextStep}</MathText></p>
      {answer ? null : (
        <>
          <ul style={choiceList}>
            {check.choices.map((choice) => (
              <li key={choice.id}>
                <button type="button" data-why-choice={choice.id} onClick={() => onChoose(choice)} style={choiceButton}><MathText>{choice.text}</MathText></button>
              </li>
            ))}
          </ul>
          <div>
            <button type="button" data-why-skip="" onClick={onSkip} style={button}>{WHY_THIS_STEP_SKIP_LABEL}</button>
          </div>
        </>
      )}
      {/* In the page, empty, before a choice: what it says is announced once it is there. */}
      <p role="status" aria-live="polite" data-why-feedback={answer?.choice ? (answer.choice.right ? 'right' : 'other') : ''} style={{ margin: 0, fontWeight: 700 }}>{feedback}</p>
    </fieldset>
  );
}

/*
 * SPOT THE MISTAKE. A step with the question's common error in it, and three
 * choices for what is wrong with it. The first choice made is kept: it shows
 * as "Your choice" in words and aria-pressed, the other two say they are not
 * available, and focus stays on the button pressed. What went wrong is then
 * said in a polite region, which is in the page, empty, before anything is
 * chosen.
 */
export function SpotTheMistake({ MathText, SupportedTextActions, spot, chosen, onChoose, readAloud, translation, onSupportEvidence }) {
  const choose = (choice) => { if (!chosen) onChoose(choice); };
  const feedback = chosen ? spotTheMistakeFeedback(spot, chosen) : '';
  return (
    <section aria-label={SPOT_THE_MISTAKE_HEADING} data-spot-the-mistake="" data-spot-answered={chosen ? '' : undefined} style={checkBox}>
      <p style={{ margin: 0, fontWeight: 800, color: 'var(--mm-primary-text)' }}>{SPOT_THE_MISTAKE_HEADING}</p>
      <p style={{ margin: 0 }}>{SPOT_THE_MISTAKE_INTRO}</p>
      <p data-spot-line="" style={{ margin: 0, padding: '6px 10px', borderLeft: '3px dashed var(--mm-primary-border)', fontWeight: 700, lineHeight: 1.55, overflowWrap: 'anywhere' }}><MathText>{spot.line}</MathText></p>
      <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 8 }}>
        <legend style={{ padding: 0, fontWeight: 800 }}>{SPOT_THE_MISTAKE_QUESTION}</legend>
        <ul style={choiceList}>
          {spot.choices.map((choice) => {
            const mine = chosen === choice.id;
            return (
              <li key={choice.id}>
                <button
                  type="button"
                  data-spot-choice={choice.id}
                  aria-pressed={mine ? 'true' : 'false'}
                  aria-disabled={chosen && !mine ? 'true' : undefined}
                  onClick={() => choose(choice)}
                  style={mine ? chosenButton : chosen ? { ...choiceButton, border: '1px dashed var(--mm-primary-border)', cursor: 'default' } : choiceButton}
                >
                  {mine ? <span data-spot-chosen="" style={{ display: 'block', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800 }}>{spotTheMistakeChosenLabel(choice)}</span> : null}
                  <MathText>{choice.text}</MathText>
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <p role="status" aria-live="polite" data-spot-feedback="" style={{ margin: 0, fontWeight: 700, lineHeight: 1.55, overflowWrap: 'anywhere' }}>{feedback ? <MathText>{feedback}</MathText> : null}</p>
      <p style={muted}>{SPOT_THE_MISTAKE_NOTE}</p>
      {/* Keyed by the choice: what is read and translated grows once the answer is there. */}
      <SupportedTextActions
        key={chosen || 'open'}
        text={spotTheMistakeReadingText(spot, chosen)}
        translationText={spotTheMistakeTranslationText(spot, chosen)}
        readAloud={readAloud}
        translation={translation}
        label="spot the mistake"
        onEvidence={onSupportEvidence}
      />
    </section>
  );
}

const boardLine = { display: 'grid', gap: 2, minWidth: 0 };
const boardName = { margin: 0, fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text-muted)' };
const boardMath = { margin: 0, fontWeight: 700, lineHeight: 1.6, overflowWrap: 'anywhere' };

const sidesNamed = (sides) => (sides.length === 2 ? 'both sides' : `the ${sides[0]} side`);
const asMath = (latex) => ['$', latex, '$'].join('');

// One move of the tool as its board shows it. The lines come from the engine;
// the names beside them say what each one is, so nothing rests on position.
// The plane a move leaves (planeReplay.js): what is plotted, the rise and
// run, each line solid or dashed, and what is shaded. Drawn from the replay's
// own numbers; the lines under it say the same move in words. Its strokes are
// the text colour, so it keeps its shape in the dark theme and forced colours.
function PlaneFigure({ plane }) {
  const { xMin, xMax, yMin, yMax } = plane.bounds;
  const SIZE = 240;
  const px = (x) => ((x - xMin) / (xMax - xMin)) * SIZE;
  const py = (y) => SIZE - ((y - yMin) / (yMax - yMin)) * SIZE;
  const ticks = (from, to) => Array.from({ length: Math.round(to - from) + 1 }, (_, index) => from + index);
  return (
    <svg
      data-example-plane=""
      role="img"
      aria-label={planeSummary(plane)}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ width: 'min(100%, 20rem)', aspectRatio: '1 / 1', display: 'block', border: '1px solid var(--mm-tint-border)', borderRadius: 8, color: 'var(--mm-text)' }}
      // A drawing of its own (index.css, forced colours): the page's Canvas behind it, its strokes the text colour.
      data-mm-drawing=""
    >
      {ticks(xMin, xMax).map((x) => <line key={`x${x}`} x1={px(x)} y1={0} x2={px(x)} y2={SIZE} stroke="currentColor" strokeOpacity={x === 0 ? 0.9 : 0.14} strokeWidth={x === 0 ? 1.5 : 1} />)}
      {ticks(yMin, yMax).map((y) => <line key={`y${y}`} x1={0} y1={py(y)} x2={SIZE} y2={py(y)} stroke="currentColor" strokeOpacity={y === 0 ? 0.9 : 0.14} strokeWidth={y === 0 ? 1.5 : 1} />)}
      {/* A shaded region is fill only: an edge of its own would lie along the boundary and close the gaps of a dashed line. */}
      {plane.regions.map((region, index) => (
        <polygon key={`r${index}`} data-example-plane-region="" points={region.points.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')} fill="currentColor" fillOpacity={0.16} stroke="none" />
      ))}
      {plane.lines.map((drawn, index) => (
        <line
          key={`l${index}`}
          data-example-plane-line={drawn.style}
          x1={px(xMin)}
          y1={py(drawn.m * xMin + drawn.b)}
          x2={px(xMax)}
          y2={py(drawn.m * xMax + drawn.b)}
          stroke="currentColor"
          strokeWidth={2.5}
          strokeDasharray={drawn.style === 'dashed' ? '7 5' : undefined}
        />
      ))}
      {plane.arrows.map((arrow, index) => (
        <line key={`a${index}`} data-example-plane-move="" x1={px(arrow.from[0])} y1={py(arrow.from[1])} x2={px(arrow.to[0])} y2={py(arrow.to[1])} stroke="currentColor" strokeWidth={2} strokeDasharray="2 3" />
      ))}
      {plane.points.map((point, index) => (
        <g key={`p${index}`} data-example-plane-point="">
          <circle cx={px(point.x)} cy={py(point.y)} r={4.5} fill="currentColor" />
          <text x={px(point.x) + (point.x > xMax - 4 ? -8 : 8)} y={py(point.y) + (point.y > yMax - 2 ? 14 : -7)} textAnchor={point.x > xMax - 4 ? 'end' : 'start'} fontSize={11} fontWeight={700} fill="currentColor" stroke="var(--mm-surface)" strokeWidth={3} paintOrder="stroke">{point.label}</text>
        </g>
      ))}
    </svg>
  );
}

// The synthetic division table a move leaves (divisionReplay.js): r in the
// box, then the coefficient, products and bottom rows, one column per power.
// A real table with a caption and named rows and columns, so a screen reader
// reads each cell with its row and its power; a blank cell is one the example
// has not filled yet, and is said as "not yet". The remainder's cell is
// boxed, and its row header says so in words.
const tableCell = { padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid var(--mm-tint-border)', minWidth: '2.4em' };
function SyntheticTable({ MathText, table }) {
  const rows = [
    { id: 'top', name: 'Coefficients', cells: table.top, offset: 0 },
    { id: 'middle', name: 'Products (r times the number before)', cells: table.middle, offset: 1 },
    { id: 'bottom', name: table.remainder ? 'Bottom row (the last is the remainder)' : 'Bottom row', cells: table.bottom, offset: 0 },
  ];
  return (
    // At 200% text on a phone a long row is wider than the player: the table
    // then scrolls inside this frame, which the keyboard can focus to scroll.
    <div data-example-synthetic-frame="" role="group" aria-label="Synthetic division table" tabIndex={0} style={{ overflowX: 'auto', maxWidth: '100%' }}>
      <table data-example-synthetic="" style={{ borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
        <caption style={{ textAlign: 'left', fontWeight: 700, paddingBottom: 4 }}>
          <MathText>{`Synthetic division by $r = ${table.r}$`}</MathText>
        </caption>
        <thead>
          <tr>
            <th scope="col" style={{ ...tableCell, textAlign: 'left' }}>Row</th>
            {table.columns.map((column, index) => <th key={`h${index}`} scope="col" style={{ ...tableCell, whiteSpace: 'nowrap' }}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-example-synthetic-row={row.id}>
              <th scope="row" style={{ ...tableCell, textAlign: 'left', fontWeight: 700 }}>{row.name}</th>
              {table.columns.map((_, index) => {
                const value = index >= row.offset ? row.cells[index - row.offset] : null;
                const isRemainder = row.id === 'bottom' && index === table.columns.length - 1 && table.remainder;
                return (
                  <td key={`${row.id}${index}`} data-example-synthetic-cell={value === null ? 'none' : value ? 'filled' : 'blank'} style={{ ...tableCell, ...(isRemainder ? { outline: '2px solid var(--mm-text-strong)', outlineOffset: -2 } : {}) }}>
                    {value === null ? '' : value ? <MathText>{asMath(value)}</MathText> : <span style={{ color: 'var(--mm-text-muted)' }}>not yet</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReplayBoard({ MathText, board }) {
  const check = board.kind === 'check';
  // A board that names its own lines (the radical replay) is drawn as given.
  const lines = Array.isArray(board.lines) ? board.lines : [
    { id: 'before', name: check ? 'The first equation' : 'Start with', latex: board.before },
    { id: 'applied', name: check ? 'With the value put in' : 'The same move on both sides', latex: board.applied },
    board.cancelled ? { id: 'cancelled', name: `Cancel on ${sidesNamed(board.cancels)}`, latex: board.cancelled } : null,
    { id: 'after', name: check ? 'Both sides' : 'Simplify', latex: board.after },
  ].filter(Boolean);
  return (
    <div data-example-board={board.kind} data-example-board-operation={board.operation || ''} style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <p data-example-board-label="" style={{ margin: 0, fontWeight: 800, lineHeight: 1.55 }}><MathText>{board.label}</MathText></p>
      {board.plane ? <PlaneFigure plane={board.plane} /> : null}
      {board.synthetic ? <SyntheticTable MathText={MathText} table={board.synthetic} /> : null}
      <ol data-example-board-lines="" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8, minWidth: 0 }}>
        {lines.map((line) => (
          <li
            key={line.id}
            data-example-board-line={line.id}
            style={{ ...boardLine, padding: '6px 10px', borderLeft: (Array.isArray(board.lines) ? line.result === true : line.id === 'after') ? '3px solid var(--mm-primary-border)' : '3px dashed var(--mm-primary-border)' }}
          >
            <p style={boardName}>{line.name}</p>
            <p style={boardMath}><MathText>{asMath(line.latex)}</MathText></p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function WorkedExamplePlayer({
  // The two components every slide is drawn with, handed over by the panel
  // (HintPanel.jsx), which has them already: importing them here would make
  // the build share them out between this chunk and the question's.
  MathText,
  SupportedTextActions,
  example = null,
  readAloud = null,
  translation = null,
  onSupportEvidence = null,
  // WE-F: "Why this step?" (the section rule's `whyThisStep`: Classwork), and
  // "Spot the mistake" ({ line, choices, explanation }, spotTheMistake.js),
  // with what to call once the student answers it.
  whyThisStep = false,
  spotTheMistake = null,
  onSpotTheMistake = null,
  onYourTurn = null,
  openedByItself = false,
}) {
  // "Show how" (Practice): the slides of the skill inside a step join the sequence.
  const [shownHow, setShownHow] = useState(false);
  const slides = useMemo(() => exampleSlides(example, { shownHow }), [example, shownHow]);
  const [position, setPosition] = useState(0);
  // Why this step? The question for this example's slides, and how it was answered.
  const whyCheck = useMemo(() => (whyThisStep === true ? whyThisStepFor(slides) : null), [whyThisStep, slides]);
  const [whyAnswer, setWhyAnswer] = useState(() => whyAnswers.get(exampleKey(example)) || null);
  const [spotChosen, setSpotChosen] = useState(null);
  const nextRef = useRef(null);
  if (!slides.length) return null;
  const at = exampleSlideAt(slides, position);
  const slide = slides[at];
  const first = at === 0;
  // Asked on the slide before its step, once: open until a choice, Skip or
  // Next; a choice stays to say whether it was the reason.
  const whyHere = Boolean(whyCheck) && at === whyCheck.askAt;
  const whyPending = whyHere && !whyAnswer && !whyAnswers.has(exampleKey(example));
  const whyShown = whyPending || (whyHere && Boolean(whyAnswer?.choice));
  const whyFeedback = whyHere && whyAnswer?.choice ? (whyAnswer.choice.right ? WHY_THIS_STEP_RIGHT : WHY_THIS_STEP_OTHER) : '';
  const settleWhy = (answer) => {
    if (example) whyAnswers.set(exampleKey(example), answer);
    setWhyAnswer(answer);
  };
  // A choice, or Skip: the choices go, so focus goes to Next.
  const answerWhy = (answer) => {
    settleWhy(answer);
    nextRef.current?.focus();
  };
  const spotShown = Boolean(spotTheMistake) && slide.last && example?.faded !== true;
  const chooseMistake = (choice) => {
    setSpotChosen(choice.id);
    onSpotTheMistake?.();
  };
  // Read aloud and Translate take the question with the slide it is on.
  const readingText = [slideReadingText(slide), whyPending ? whyThisStepReadingText(whyCheck) : '', whyFeedback].filter(Boolean).join(' ');
  const translationText = [slideTranslationText(slide), whyPending ? whyThisStepTranslationText(whyCheck) : '', whyFeedback].filter(Boolean).join('\n');
  const back = () => { if (!first) setPosition(at - 1); };
  const showHow = () => {
    setPosition(shownHowSlideIndex(example, slide.subSkill?.skill));
    setShownHow(true);
  };
  const next = () => {
    // Next past an open "Why this step?" skips it.
    if (whyPending) settleWhy({ skipped: true });
    if (slide.last) onYourTurn?.();
    else setPosition(at + 1);
  };
  return (
    <div
      role="group"
      aria-label="Worked example"
      data-worked-example-player=""
      data-example-source={example?.source || ''}
      data-example-slide-number={at + 1}
      data-example-slide-count={slides.length}
      data-example-slide-kind={slide.kind}
      data-example-format={example?.format || ''}
      data-example-faded={example?.faded === true ? '' : undefined}
      style={{ display: 'grid', gap: 10, minWidth: 0 }}
    >
      {openedByItself ? (
        <p data-example-opened-by-itself="" style={{ ...muted, fontWeight: 700 }}>
          {example?.faded === true ? EXAMPLE_FADED_OPENED_TEXT : EXAMPLE_OPENED_BY_ITSELF_TEXT}
        </p>
      ) : null}
      {/* The problem stays in sight while its steps play. */}
      {slide.kind !== EXAMPLE_SLIDE.PROBLEM ? (
        <p data-example-problem="" style={{ ...muted, overflowWrap: 'anywhere' }}><MathText>{example.prompt}</MathText></p>
      ) : null}
      <div
        aria-live="polite"
        aria-atomic="true"
        data-example-slide=""
        style={{ display: 'grid', gap: 6, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface)', minWidth: 0, overflowWrap: 'anywhere' }}
      >
        <p data-example-slide-label="" style={{ margin: 0, fontWeight: 800, color: 'var(--mm-primary-text)' }}>{slide.label}</p>
        {slide.board ? <ReplayBoard MathText={MathText} board={slide.board} /> : (
          <p data-example-show="" style={{ margin: 0, fontWeight: 700, lineHeight: 1.55 }}>
            {slide.kind === EXAMPLE_SLIDE.ANSWER ? 'Answer: ' : null}<MathText>{slide.show}</MathText>
          </p>
        )}
        {slide.why ? (
          <p data-example-why="" style={{ margin: 0, lineHeight: 1.55 }}><strong>Why: </strong><MathText>{slide.why}</MathText></p>
        ) : null}
        {slide.showHow ? (
          <div>
            <button type="button" data-example-show-how="" onClick={showHow} style={button}>{EXAMPLE_SHOW_HOW_LABEL}</button>
          </div>
        ) : null}
        {slide.note ? <p data-example-note="" style={muted}>{slide.note}</p> : null}
        {slide.last ? <p data-example-your-turn-note="" style={muted}>{slideTurnText(slide)}</p> : null}
      </div>
      {/* Outside the slide's live region: the slide is announced as ever, and the answer in a region of its own. */}
      {whyShown ? (
        <WhyThisStep MathText={MathText} check={whyCheck} answer={whyHere ? whyAnswer : null} onChoose={(choice) => answerWhy({ choice })} onSkip={() => answerWhy({ skipped: true })} />
      ) : null}
      {/* Keyed by slide: a translation shown for one step is not the next step's. */}
      <SupportedTextActions
        key={`${at}${whyPending ? '-asking' : whyFeedback ? '-answered' : ''}`}
        text={readingText}
        translationText={translationText}
        readAloud={readAloud}
        translation={translation}
        label={`the worked example, ${slide.label.toLowerCase()}`}
        onEvidence={onSupportEvidence}
      />
      {spotShown ? (
        <SpotTheMistake
          MathText={MathText}
          SupportedTextActions={SupportedTextActions}
          spot={spotTheMistake}
          chosen={spotChosen}
          onChoose={chooseMistake}
          readAloud={readAloud}
          translation={translation}
          onSupportEvidence={onSupportEvidence}
        />
      ) : null}
      <div data-example-controls="" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          data-example-back=""
          aria-disabled={first ? 'true' : undefined}
          onClick={back}
          style={first ? { ...button, opacity: 0.55, cursor: 'not-allowed', border: '1px dashed var(--mm-primary-border)' } : button}
        >
          Back
        </button>
        <span data-example-progress="" style={{ ...muted, fontWeight: 700 }}>{at + 1} of {slides.length}</span>
        <button ref={nextRef} type="button" data-example-next="" data-example-your-turn={slide.last ? '' : undefined} onClick={next} style={primaryButton}>
          {slide.last ? EXAMPLE_YOUR_TURN_LABEL : 'Next'}
        </button>
      </div>
    </div>
  );
}
