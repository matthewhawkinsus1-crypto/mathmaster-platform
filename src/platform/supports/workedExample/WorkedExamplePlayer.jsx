import { useMemo, useState } from 'react';
import {
  EXAMPLE_FADED_OPENED_TEXT,
  EXAMPLE_OPENED_BY_ITSELF_TEXT,
  EXAMPLE_SHOW_HOW_LABEL,
  EXAMPLE_SLIDE,
  EXAMPLE_YOUR_TURN_LABEL,
  exampleSlideAt,
  exampleSlides,
  planeSummary,
  shownHowSlideIndex,
  slideReadingText,
  slideTranslationText,
  slideTurnText,
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
      {plane.regions.map((region, index) => (
        <polygon key={`r${index}`} data-example-plane-region="" points={region.points.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')} fill="currentColor" fillOpacity={0.16} stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} />
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
  onYourTurn = null,
  openedByItself = false,
}) {
  // "Show how" (Practice): the slides of the skill inside a step join the sequence.
  const [shownHow, setShownHow] = useState(false);
  const slides = useMemo(() => exampleSlides(example, { shownHow }), [example, shownHow]);
  const [position, setPosition] = useState(0);
  if (!slides.length) return null;
  const at = exampleSlideAt(slides, position);
  const slide = slides[at];
  const first = at === 0;
  const back = () => { if (!first) setPosition(at - 1); };
  const showHow = () => {
    setPosition(shownHowSlideIndex(example, slide.subSkill?.skill));
    setShownHow(true);
  };
  const next = () => {
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
      {/* Keyed by slide: a translation shown for one step is not the next step's. */}
      <SupportedTextActions
        key={at}
        text={slideReadingText(slide)}
        translationText={slideTranslationText(slide)}
        readAloud={readAloud}
        translation={translation}
        label={`the worked example, ${slide.label.toLowerCase()}`}
        onEvidence={onSupportEvidence}
      />
      <div data-example-controls="" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          data-example-back=""
          aria-disabled={first ? 'true' : undefined}
          onClick={back}
          style={first ? { ...button, opacity: 0.55, cursor: 'not-allowed', borderStyle: 'dashed' } : button}
        >
          Back
        </button>
        <span data-example-progress="" style={{ ...muted, fontWeight: 700 }}>{at + 1} of {slides.length}</span>
        <button type="button" data-example-next="" data-example-your-turn={slide.last ? '' : undefined} onClick={next} style={primaryButton}>
          {slide.last ? EXAMPLE_YOUR_TURN_LABEL : 'Next'}
        </button>
      </div>
    </div>
  );
}
