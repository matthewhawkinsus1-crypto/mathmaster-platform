import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LineEquation from './LineEquation.jsx';
import LineGraphCanvas from './LineGraphCanvas.jsx';
import StartLights from './StartLights.jsx';
import { ARENA_LINE_VARS, GP_RACE_CSS, arenaLayerCss } from './grandPrixTheme.js';
import { monotonicRoundOrigin } from '../../../functions/shared/liveChallengeParity.mjs';
import { roomFullRoundMs } from '../../../functions/shared/liveChallengeAccommodations.mjs';
import { BUILD_FIELDS, buildPreview, LINE_FORM } from '../../../functions/shared/lineGraphForms.mjs';
import {
  LINE_ANSWER_STYLE,
  LINE_GRAPH_FORMAT,
  LINE_ITEM_TYPE,
  LINE_LIMITS,
  LINE_VERDICT,
  lineFormatGivesExtraTime,
  lineGraphFormatOfMode,
} from '../../../functions/shared/lineGraphRules.mjs';
import { rushRefusalIsTimeUp } from '../../platform/liveChallenge/challengeAnswerRefusal.js';
import { personalRoundClock } from '../../platform/liveChallenge/challengeShellModel.js';
import { pointsKey } from '../../platform/liveChallenge/lineGraphModel.js';
import {
  LINE_FEEDBACK,
  LINE_INPUT,
  LINE_PREFETCH,
  LINE_QUEUE_KEY_PREFIX,
  acknowledge,
  answerEquation,
  createLineSession,
  currentQuestion,
  dropQueue,
  inputState,
  lineFeedbackMessage,
  lineQueueKey,
  lockRemainingMs,
  newLineAttemptId,
  nextBatch,
  parseStoredLineQueue,
  prefetchRequest,
  recordChoice,
  recordEquation,
  recordLine,
  recordSkip,
  settle,
  triesLeft,
  withQuestions,
} from '../../platform/liveChallenge/lineGraphSession.js';
import { getLineGraphRound, submitLineGraphAttempts, timestampMillis } from '../../platform/liveChallenge/liveChallengeService.js';
import { studentErrorSentence } from '../../platform/student/studentErrorWords.js';
import { SR_ONLY_STYLE } from '../../ui/srOnly.js';

/*
 * GRAPH THE LINE: A STUDENT'S ROUND.
 *
 * The grid fills the screen; the equation (or the line to name), Start over
 * and Skip sit in the same places on every item. There is no Submit button:
 * a line is checked the moment its second point is let go, a chosen equation
 * when it is tapped, a typed one on Enter (lineGraphSession.js) — and the
 * answer is queued for the server, which grades it again and alone decides
 * what counts.
 *
 * Built on Graph Feature Rush's round (GraphFeatureRushRound.jsx), which
 * proved each of these in classrooms:
 *
 * TIME. The round's start and deadline are the room's, anchored once to this
 * device's monotonic clock — a device clock change mid-round moves nothing,
 * and a refresh resumes on the same deadline. Input stops at zero. A student
 * whose plan gives them extended time, in a Classic or Sprint round, keeps
 * working past the class's buzzer to their own deadline (the one the server
 * judges against): the race was decided at the buzzer, and the screen says
 * so plainly — to them alone (liveChallengeAccommodations.mjs).
 *
 * THE SLOPE HELPER shows when the room turns it on, or when this student's
 * plan does — which only their own round request says.
 *
 * NETWORK. Attempts are sent one request at a time, gathered for a moment,
 * and kept in localStorage until the server answers: a refresh or a dropped
 * connection resends them, and the server answers a resent attempt as a
 * replay. Items are fetched ahead of the one on screen.
 *
 * FORMATS. Classic: one item, and the round waits for the class. Sprint: a
 * set in a row, then "All done". Rush: as many as the clock allows. Skip is
 * offered in Sprint and Rush; a Classic item is worked until it is right or
 * its tries run out.
 */

const COALESCE_MS = 500;
const RETRY_MIN_MS = 600;
const RETRY_MAX_MS = 5_000;
const JOIN_WAIT_MS = 1_000;

export const LINE_SERVICES = Object.freeze({
  getRound: getLineGraphRound,
  submitAttempts: submitLineGraphAttempts,
});

const readQueue = (key) => {
  if (!key) return [];
  try { return parseStoredLineQueue(window.localStorage.getItem(key)); } catch { return []; }
};
const writeQueue = (key, queue) => {
  if (!key) return;
  try {
    if (queue.length) window.localStorage.setItem(key, JSON.stringify(queue));
    else window.localStorage.removeItem(key);
  } catch { /* the server still has everything it acknowledged */ }
};

/** Forget every other round's queue: the server would refuse it anyway. */
export const clearStaleLineQueues = (keepKey) => {
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(LINE_QUEUE_KEY_PREFIX) && key !== keepKey) window.localStorage.removeItem(key);
    }
  } catch { /* storage unavailable: nothing to clear */ }
};

const formatClock = (milliseconds) => {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const wait = (milliseconds) => new Promise((resolve) => { window.setTimeout(resolve, milliseconds); });

// The server will never take these: the round is over, stale, or not this student's.
const isFinalRefusal = (error) => /failed-precondition|not-found|permission-denied|invalid-argument/.test(String(error?.code || ''));

function useElementSquare(ref) {
  const [side, setSide] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => {
      const box = element.getBoundingClientRect();
      setSide(Math.max(0, Math.floor(Math.min(box.width, box.height))));
    };
    measure();
    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return side;
}

/** The round clock: its own component, so its ticks redraw nothing else. */
function LineClock({ startMono, endMono }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 200);
    return () => window.clearInterval(timer);
  }, []);
  const before = startMono - now;
  if (before > 0) {
    return <span className="mm-line-clock" role="timer" aria-label={`Starts in ${Math.ceil(before / 1000)} seconds`}>Starts in {Math.ceil(before / 1000)}</span>;
  }
  const remaining = Math.max(0, endMono - now);
  return (
    <span className={remaining <= 10_000 ? 'mm-line-clock mm-line-clock-low' : 'mm-line-clock'} role="timer" aria-label={`${Math.ceil(remaining / 1000)} seconds left`}>
      {formatClock(remaining)}
    </span>
  );
}

/* 3 · 2 · 1 off the round's one clock anchor (GraphFeatureRushRound's rule). */
function LineCountdownNumber({ startMono }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(timer);
  }, []);
  const before = startMono - now;
  if (before <= 0) return null;
  const step = Math.min(3, Math.max(1, Math.ceil(before / 1000)));
  return (
    <>
      <StartLights step={step} />
      <span key={step} className="mm-line-count" data-mm-countdown={String(step)} aria-hidden="true">{step}</span>
    </>
  );
}

/** Spoken time warnings, once each: a screen reader is not asked to read a ticking clock. */
function useTimeAnnouncements(endMono, active) {
  const [spoken, setSpoken] = useState('');
  useEffect(() => {
    if (!active) return undefined;
    const timers = [30_000, 10_000].map((left) => {
      const delay = endMono - left - performance.now();
      return delay > 0 ? window.setTimeout(() => setSpoken(`${left / 1000} seconds left`), delay) : null;
    });
    return () => timers.forEach((timer) => timer != null && window.clearTimeout(timer));
  }, [endMono, active]);
  return spoken;
}

// The arena is dark in both themes: its plate, clock, answer boxes and
// buttons keep fixed colours in dark mode too (grandPrixTheme.js, "Fixed
// colours, on purpose").
const LINE_CSS = `
.mm-line-shell {
  /* Full screen below the student identity bar, which stays on top and
     publishes its height (the rush's contract, .mm-rush-shell). */
  position: fixed; top: var(--mm-student-identity-stack-offset, 0px); right: 0; bottom: 0; left: 0; z-index: 9000;
  display: grid; grid-template-rows: auto minmax(0, 1fr); grid-template-columns: minmax(0, 1fr);
  color: #eef2ff; font-family: "Segoe UI", system-ui, sans-serif;
  touch-action: manipulation; overscroll-behavior: none;
  /* The Grand Prix's grid: dark glass, the lines in neon, each mark its own
     colour (grandPrixTheme.js ARENA_MARKS). The arena behind it is the rule
     after this one. */
  ${ARENA_LINE_VARS};
  --mm-line-label-bg: var(--mm-graph-bg); --mm-line-label-text: var(--mm-graph-label);
}
${arenaLayerCss('.mm-line-shell')}
.mm-line-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 8px max(12px, env(safe-area-inset-right)) 8px max(12px, env(safe-area-inset-left));
  min-height: 52px; box-sizing: border-box;
  background: linear-gradient(90deg, rgba(42,15,92,.92), rgba(10,16,52,.92) 55%, rgba(42,15,92,.92));
  border-bottom: 1px solid rgba(53,227,255,.45); box-shadow: 0 1px 0 rgba(255,63,209,.35), 0 6px 18px rgba(0,0,0,.35);
}
/* The student's name on a racing plate. */
.mm-line-chip { padding: 3px 12px; border-radius: 7px; transform: skewX(-8deg); background: linear-gradient(180deg, #d92a48, #c8102e); border: 1px solid rgba(255,255,255,.85); color: #fff; font-weight: 1000; font-style: italic; font-size: calc(13 * var(--mm-px)); white-space: nowrap; }
.mm-line-round { font-weight: 1000; font-style: italic; text-transform: uppercase; letter-spacing: .02em; color: #35e3ff; font-size: calc(15 * var(--mm-px)); white-space: nowrap; }
.mm-line-progress { padding: 4px 10px; border-radius: 999px; background: rgba(10,16,52,.7); border: 1px solid rgba(53,227,255,.35); font-weight: 900; font-size: calc(13 * var(--mm-px)); white-space: nowrap; font-variant-numeric: tabular-nums; }
.mm-line-done { font-weight: 1000; font-style: italic; font-size: calc(18 * var(--mm-px)); color: #ffd23f; font-variant-numeric: tabular-nums; white-space: nowrap; }
.mm-line-streak { font-weight: 1000; font-style: italic; font-size: calc(15 * var(--mm-px)); color: #ffb020; white-space: nowrap; }
/* The clock redraws every second: crisp edges only (a blur here would be redrawn with it). */
.mm-line-clock { margin-left: auto; font-size: calc(30 * var(--mm-px)); font-weight: 1000; font-style: italic; line-height: 1; font-variant-numeric: tabular-nums; color: #fff; text-shadow: 2px 2px 0 rgba(53,227,255,.45); }
/* The last ten seconds: red, and a pulse (a transform: the compositor's). */
.mm-line-clock-low { color: #ff5d73; text-shadow: 2px 2px 0 rgba(255,63,209,.4); animation: mmGpPulse 1s ease-in-out infinite; }
.mm-line-sync { font-size: calc(12 * var(--mm-px)); font-weight: 900; color: #fdd663; }
.mm-line-exit { min-height: 40px; padding: 6px 12px; border: 1px solid rgba(53,227,255,.45); border-radius: 8px; background: rgba(10,16,52,.6); color: #eef2ff; font-weight: 900; cursor: pointer; }
.mm-line-stage {
  /* minmax(0, 1fr) here and in the grids inside: nothing may widen a column
     past the screen (auto columns grew to a built equation's width on a
     320px phone, and its boxes never shrank). */
  display: grid; grid-template-rows: auto minmax(0, 1fr) auto; grid-template-columns: minmax(0, 1fr); gap: 10px; min-height: 0;
  padding: 10px max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
}
.mm-line-prompt h2 { margin: 0; font-size: clamp(calc(18 * var(--mm-px)), calc(3.4vmin * var(--mm-text-scale, 1)), calc(26 * var(--mm-px))); line-height: 1.15; font-weight: 800; color: #c3d2ea; }
.mm-line-equation { display: block; margin-top: 4px; font-size: clamp(calc(28 * var(--mm-px)), calc(6vmin * var(--mm-text-scale, 1)), calc(46 * var(--mm-px))); font-weight: 800; line-height: 1.25; color: #fff; }
.mm-line-hint { margin: 4px 0 0; font-size: calc(13 * var(--mm-px)); color: #b8c4ef; }
.mm-line-graph-area { position: relative; min-height: 0; min-width: 0; display: grid; place-items: start center; }
/* The grid in neon: a cyan rim and a faint outer ring — crisp, not a blurred
   glow, which every new line would draw again. */
.mm-line-graph-frame { position: relative; border-radius: 12px; box-shadow: 0 0 0 1px rgba(53,227,255,.6), 0 0 0 5px rgba(53,227,255,.1), 0 8px 30px rgba(0,0,0,.35); }
.mm-line-graph-frame[data-paused="1"] .mm-line-graph { opacity: .6; transition: opacity 120ms; }
.mm-line-controls { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.mm-line-feedback { min-height: 1.5em; font-weight: 900; font-size: calc(16 * var(--mm-px)); line-height: 1.3; }
.mm-line-feedback[data-kind="correct"] { color: #45ff8a; }
.mm-line-feedback[data-kind="miss"], .mm-line-feedback[data-kind="revealed"], .mm-line-feedback[data-kind="repeated"] { color: #ff8fa3; }
.mm-line-feedback[data-kind="method"], .mm-line-feedback[data-kind="form"] { color: #fdd663; }
.mm-line-buttons { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 10px; }
.mm-line-button { min-height: 52px; border-radius: 12px; font-size: calc(17 * var(--mm-px)); font-weight: 1000; cursor: pointer; border: 1px solid rgba(53,227,255,.45); background: rgba(10,16,52,.6); color: #eef2ff; }
.mm-line-button-primary { border: 0; background: linear-gradient(180deg, #ffe680 0%, #ffc21a 60%, #f59f00 100%); color: #2b1700; box-shadow: 0 4px 0 #a86400; }
/* Pressed down on a tap (a transform only). */
.mm-line-button:active:not(:disabled), .mm-line-choice:active:not(:disabled) { transform: translateY(2px); }
.mm-line-button:disabled { opacity: .45; cursor: not-allowed; }
.mm-line-button:focus-visible, .mm-line-exit:focus-visible, .mm-line-choice:focus-visible, .mm-line-box:focus-visible { outline: 3px solid var(--mm-focus); outline-offset: 2px; }
.mm-line-choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.mm-line-choice {
  min-height: 60px; padding: 8px 10px; border-radius: 12px; cursor: pointer; text-align: center;
  border: 2px solid rgba(53,227,255,.4); background: rgba(10,16,52,.6); color: #fff;
  font-size: clamp(calc(18 * var(--mm-px)), calc(3.6vmin * var(--mm-text-scale, 1)), calc(24 * var(--mm-px))); font-weight: 800;
}
.mm-line-choice[data-state="right"] { border-color: #45ff8a; background: rgba(69,255,138,.16); }
.mm-line-choice[data-state="wrong"] { border-color: #ff8fa3; background: rgba(255,93,115,.14); }
.mm-line-choice:disabled { cursor: default; }
/* One line, always: an equation split across lines (a lone ")" under the
   boxes) no longer reads as one. The boxes give up width before anything wraps. */
.mm-line-build { display: flex; flex-wrap: nowrap; align-items: center; justify-content: center; gap: 6px; max-width: 100%; font-size: clamp(calc(22 * var(--mm-px)), calc(4.4vmin * var(--mm-text-scale, 1)), calc(30 * var(--mm-px))); font-weight: 800; color: #fff; }
.mm-line-build > span { flex: none; }
.mm-line-build i { font-family: Georgia, "Times New Roman", serif; }
.mm-line-box {
  flex: 0 1 3.6em; width: 3.6em; min-width: 2.6em; min-height: 46px; padding: 4px 6px; border-radius: 10px; box-sizing: border-box; text-align: center;
  border: 2px solid rgba(53,227,255,.5); background: #070a22; color: #fff; font: inherit; font-size: .8em;
}
.mm-line-box[aria-invalid="true"] { border-color: #fdd663; }
.mm-line-preview { text-align: center; color: #c3d2ea; font-size: calc(15 * var(--mm-px)); min-height: 1.6em; }
.mm-line-cooldown { height: 6px; border-radius: 999px; background: rgba(255,255,255,.12); overflow: hidden; }
.mm-line-cooldown > span { display: block; height: 100%; background: #ff5d73; transform-origin: left; animation: mmLineDrain linear forwards; }
.mm-line-overlay {
  position: absolute; inset: 0; display: grid; place-content: center; gap: 8px; text-align: center;
  border-radius: 12px; background: radial-gradient(90% 80% at 50% 30%, rgba(42,15,92,.94), rgba(8,12,42,.95)); color: #f7f9ff; padding: 16px;
  border: 1px solid rgba(53,227,255,.35);
}
.mm-line-overlay strong { font-size: clamp(calc(28 * var(--mm-px)), calc(7vmin * var(--mm-text-scale, 1)), calc(56 * var(--mm-px))); line-height: 1; font-style: italic; text-transform: uppercase; text-shadow: 2px 2px 0 rgba(255,63,209,.6); }
/* A new number each second: neon by offset shadows (a blur would be drawn again each time). */
.mm-line-count { font-size: clamp(calc(64 * var(--mm-px)), calc(18vmin * var(--mm-text-scale, 1)), calc(140 * var(--mm-px))); font-weight: 1000; font-style: italic; line-height: .9; font-variant-numeric: tabular-nums; color: #fff; text-shadow: 4px 4px 0 rgba(255,63,209,.7), 0 7px 0 rgba(10,16,52,.9); animation: mmLineCountPop 420ms cubic-bezier(.2,.9,.3,1.3); }
.mm-line-flash { position: absolute; inset: 0; border-radius: 12px; pointer-events: none; box-shadow: inset 0 0 0 6px #45ff8a; animation: mmLineFlash 420ms ease-out forwards; }
.mm-line-banner { padding: 6px 10px; border-radius: 8px; background: rgba(253,214,99,.14); border: 1px solid rgba(253,214,99,.45); color: #fdd663; font-weight: 800; font-size: calc(13 * var(--mm-px)); }
.mm-line-alert { padding: 9px 12px; border-radius: 9px; background: #4a3708; color: #ffe9a8; border: 1px solid #f9ab00; font-weight: 800; }
.mm-line-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.mm-line-reveal { animation: mmLineReveal 500ms ease-out; }
.mm-line-in-a { animation: mmLineInA 160ms ease-out; }
.mm-line-in-b { animation: mmLineInB 160ms ease-out; }
@keyframes mmLineDrain { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@keyframes mmLineFlash { from { opacity: 1; } to { opacity: 0; } }
@keyframes mmLineCountPop { from { transform: scale(.55); opacity: .2; } to { transform: scale(1); opacity: 1; } }
@keyframes mmLineReveal { from { opacity: 0; } to { opacity: 1; } }
@keyframes mmLineInA { from { opacity: .6; } to { opacity: 1; } }
@keyframes mmLineInB { from { opacity: .6; } to { opacity: 1; } }
${GP_RACE_CSS}
@media (min-aspect-ratio: 5/4) and (min-width: 600px) {
  .mm-line-stage {
    grid-template-columns: minmax(0, 1fr) clamp(260px, 34vw, 420px);
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: "graph prompt" "graph controls";
    column-gap: 18px;
  }
  .mm-line-prompt { grid-area: prompt; padding-top: 6px; }
  .mm-line-graph-area { grid-area: graph; place-items: center; }
  .mm-line-controls { grid-area: controls; align-self: end; }
}
@media (max-width: 480px) {
  .mm-line-chip { display: none; }
  .mm-line-bar { gap: 8px; }
  .mm-line-clock { font-size: calc(26 * var(--mm-px)); }
}
@media (max-height: 420px) {
  .mm-line-bar { min-height: 44px; padding-top: 4px; padding-bottom: 4px; }
  .mm-line-clock { font-size: calc(24 * var(--mm-px)); }
  .mm-line-hint { display: none; }
  .mm-line-button { min-height: 46px; }
}
@media (prefers-reduced-motion: reduce) {
  .mm-line-in-a, .mm-line-in-b, .mm-line-count, .mm-line-reveal { animation: none; }
  .mm-line-clock-low { animation: none; }
  .mm-line-flash { animation: none; opacity: .8; }
}
`;

// The boxes of a "Build it" template, around the form's fixed symbols.
const BUILD_LAYOUT = Object.freeze({
  [LINE_FORM.SLOPE_INTERCEPT]: ['y', '=', 'm', 'x', '+', 'b'],
  [LINE_FORM.POINT_SLOPE]: ['y', '−', 'y1', '=', 'm', '(', 'x', '−', 'x1', ')'],
  [LINE_FORM.STANDARD]: ['A', 'x', '+', 'B', 'y', '=', 'C'],
});

/** Name it, build: the form's boxes; Enter (or Check) checks them. */
function BuildAnswer({ question, disabled, feedback, onCheck }) {
  const fields = BUILD_FIELDS[question.build?.form] || [];
  const [values, setValues] = useState({});
  const refs = useRef({});
  // A new item starts with empty boxes, the first one ready to type in.
  useEffect(() => {
    setValues({});
    if (!disabled) refs.current[fields[0]?.id]?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.questionIndex]);
  // Boxes that do not yet spell an equation: the one to fix is focused.
  const fixField = feedback?.kind === LINE_FEEDBACK.FORM && feedback.questionIndex === question.questionIndex ? feedback.field : null;
  useEffect(() => {
    if (fixField) refs.current[fixField]?.focus({ preventScroll: true });
  }, [fixField, feedback?.seq]);
  const preview = buildPreview(question.build?.form, values);
  const fieldById = Object.fromEntries(fields.map((field) => [field.id, field]));
  const check = () => { if (!disabled) onCheck(values); };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
      <form className="mm-line-build" onSubmit={(event) => { event.preventDefault(); check(); }}>
        {(BUILD_LAYOUT[question.build?.form] || []).map((part, index) => {
          const field = fieldById[part];
          if (!field) {
            const symbol = part === 'x' || part === 'y' ? <i>{part}</i> : part;
            // eslint-disable-next-line react/no-array-index-key
            return <span key={index} aria-hidden="true">{symbol}</span>;
          }
          return (
            <input
              key={field.id}
              ref={(element) => { refs.current[field.id] = element; }}
              className="mm-line-box"
              aria-label={`${field.label}, the ${field.name}`}
              aria-invalid={fixField === field.id ? 'true' : undefined}
              placeholder={field.label}
              value={values[field.id] ?? ''}
              maxLength={LINE_LIMITS.fieldLength}
              disabled={disabled}
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="go"
              onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
              // Enter in any box is the check (a hidden submit button is
              // not honoured by every browser's implicit submission).
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                check();
              }}
            />
          );
        })}
      </form>
      <div className="mm-line-preview" aria-live="polite">
        {preview ? <>You wrote <LineEquation equation={preview} /></> : 'Whole numbers, fractions like 2/3, or decimals.'}
      </div>
      <button type="button" className="mm-line-button mm-line-button-primary" disabled={disabled} onClick={check}>Check (Enter)</button>
    </div>
  );
}

/** Name it, choose: four equations; the tap is the answer. */
function ChoiceAnswer({ question, disabled, feedback, onChoose }) {
  const settled = feedback && feedback.questionIndex === question.questionIndex
    && (feedback.kind === LINE_FEEDBACK.CORRECT || feedback.kind === LINE_FEEDBACK.REVEALED);
  return (
    <div className="mm-line-choices" role="group" aria-label="Choose the matching equation">
      {(question.choices || []).map((choice) => {
        let state = '';
        if (settled && choice.id === question.answerChoice) state = 'right';
        else if (settled && choice.id === feedback.choiceId) state = 'wrong';
        return (
          <button
            key={choice.id}
            type="button"
            className="mm-line-choice"
            data-state={state || undefined}
            aria-pressed={settled && choice.id === feedback.choiceId ? 'true' : 'false'}
            disabled={disabled || settled}
            onClick={() => onChoose(choice.id)}
          >
            {state === 'right' && <><span aria-hidden="true">✓ </span><span style={SR_ONLY_STYLE}>Right answer: </span></>}
            {state === 'wrong' && <><span aria-hidden="true">✗ </span><span style={SR_ONLY_STYLE}>Your answer: </span></>}
            <LineEquation equation={choice.equation} />
          </button>
        );
      })}
    </div>
  );
}

const VERDICT_STYLE = Object.freeze({
  [LINE_VERDICT.CORRECT]: 'correct',
  [LINE_VERDICT.INCORRECT]: 'wrong',
  [LINE_VERDICT.REPEATED]: 'wrong',
  [LINE_VERDICT.METHOD]: 'method',
});

/**
 * @param {object}   props.room      the room snapshot, with serverNowAtRender
 *                                   (Date.now() + calibrated offset)
 * @param {object}   props.services  { getRound, submitAttempts } — injectable,
 *                                   so a teacher's practice plays the same screen
 * @param {boolean}  props.persist   keep unsent attempts across a refresh
 * @param {boolean}  props.practice  a teacher's practice: nothing is recorded
 * @param {number}   props.timeMultiplier  this student's own (their invite; 1
 *                                   without extended time)
 */
export default function LineGraphRound({
  room,
  alias = '',
  onExit,
  exitLabel = 'Exit',
  services = LINE_SERVICES,
  persist = true,
  practice = false,
  onPracticeAgain = null,
  timeMultiplier = 1,
}) {
  const roomId = room.roomId;
  const roundIndex = Number(room.currentRound) || 0;
  const roundVersion = Number(room.roundVersion) || 0;
  const roundToken = room.roundToken || '';
  const roundCount = Math.max(1, Number(room.roundCount) || 1);
  const roundClosed = room.roundState === 'closed';
  const format = lineGraphFormatOfMode(room.challengeMode) || LINE_GRAPH_FORMAT.RUSH;
  const config = room.lineGraph?.config || {};
  const rules = useMemo(() => ({ triesPerItem: config.triesPerItem, showMethod: config.showMethod === true }), [config.triesPerItem, config.showMethod]);
  const identity = useMemo(() => ({ roomId, roundIndex, roundVersion, roundToken }), [roomId, roundIndex, roundVersion, roundToken]);
  const queueKey = persist ? lineQueueKey(roomId, roundIndex, roundVersion) : null;

  // Anchored once per mount; the parent mounts one of these per round.
  // `buzzerMono` is the class's deadline; `endMono` this student's — later
  // only with extended time in a round that gives it after the buzzer.
  const [timing] = useState(() => {
    const startsAtMs = timestampMillis(room.startsAt || room.roundStartedAt);
    const endsAtMs = timestampMillis(room.roundEndsAt || room.endsAt);
    const startMono = monotonicRoundOrigin({
      monotonicNow: performance.now(),
      serverNowMs: Number(room.serverNowAtRender) || Date.now(),
      startsAtMs,
    });
    const afterBuzzer = !practice && lineFormatGivesExtraTime(format);
    const own = personalRoundClock({
      startsAtMs, endsAtMs, timeMultiplier: afterBuzzer ? timeMultiplier : 1, fullDurationMs: roomFullRoundMs(room),
    });
    const buzzerMono = startMono + Math.max(0, endsAtMs - startsAtMs);
    return { startMono, buzzerMono, endMono: Math.max(buzzerMono, startMono + Math.max(0, own.endsAtMs - startsAtMs)) };
  });

  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  const [phase, setPhase] = useState('loading');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [alert, setAlert] = useState('');
  const [connection, setConnection] = useState('ok');
  const [started, setStarted] = useState(() => performance.now() >= timing.startMono);
  // GO over the round's first moment, for a student who watched its countdown
  // (not one who opens the round already running).
  const [sawCountdown] = useState(() => performance.now() < timing.startMono);
  const [timeUp, setTimeUp] = useState(() => performance.now() >= timing.endMono);
  // Past the class's buzzer (the same moment as timeUp, unless this student
  // has extra time after it).
  const [pastBuzzer, setPastBuzzer] = useState(() => performance.now() >= timing.buzzerMono);
  // The slope helper from this student's own plan: their round request says
  // so; nothing on the room does.
  const [ownSlopeHelper, setOwnSlopeHelper] = useState(false);
  const [, setWake] = useState(0);
  // The line last checked on this item, and how it was judged.
  const [lineCheck, setLineCheck] = useState(null);
  // A new value clears the student's points (Start over).
  const [startOver, setStartOver] = useState(0);
  const over = timeUp || roundClosed;
  const overRef = useRef(over);
  overRef.current = over;

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const flushTimerRef = useRef(null);
  const retryDelayRef = useRef(0);
  const stoppedRef = useRef(false);
  const fetchingRef = useRef(false);
  const flushRef = useRef(() => {});
  const prefetchRef = useRef(() => {});

  const commit = useCallback((next) => {
    const previous = sessionRef.current;
    sessionRef.current = next;
    setSession(next);
    if (queueKey && previous?.queue !== next.queue) writeQueue(queueKey, next.queue);
  }, [queueKey]);

  const scheduleFlush = useCallback((delay = COALESCE_MS) => {
    if (stoppedRef.current || inFlightRef.current || flushTimerRef.current) return;
    flushTimerRef.current = window.setTimeout(() => flushRef.current(), delay);
  }, []);

  flushRef.current = async () => {
    window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
    const current = sessionRef.current;
    if (!current || inFlightRef.current || stoppedRef.current) return;
    const batch = nextBatch(current);
    if (!batch.length) return;
    inFlightRef.current = true;
    try {
      const reply = await services.submitAttempts({ ...identity, attempts: batch });
      if (!mountedRef.current) return;
      retryDelayRef.current = 0;
      const { session: next } = acknowledge(sessionRef.current, { sent: batch, reply });
      commit(next);
      setConnection('ok');
    } catch (error) {
      if (!mountedRef.current) return;
      const code = String(error?.code || '');
      // "Time is up" from the server, when this device's clock agrees; a
      // client-side timeout with the same code mid-round is retried.
      const timeIsUp = rushRefusalIsTimeUp(code, timing.endMono - performance.now(), error?.details?.reason);
      if (isFinalRefusal(error) || timeIsUp) {
        // The server's own words stay here, for support; the student reads
        // a sentence written for them (studentErrorText.js).
        if (!timeIsUp) console.warn('Round stopped taking answers:', error);
        stoppedRef.current = true;
        commit(dropQueue(sessionRef.current));
        setConnection('ok');
        if (timeIsUp) setTimeUp(true);
        else if (!overRef.current) setAlert(studentErrorSentence(error, 'This round is no longer taking answers.'));
      } else {
        retryDelayRef.current = Math.min(RETRY_MAX_MS, Math.max(RETRY_MIN_MS, retryDelayRef.current * 2));
        setConnection('retrying');
        flushTimerRef.current = window.setTimeout(() => flushRef.current(), retryDelayRef.current);
      }
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current && !stoppedRef.current && sessionRef.current?.queue.length && !flushTimerRef.current) {
        scheduleFlush(overRef.current ? 0 : COALESCE_MS);
      }
    }
  };

  prefetchRef.current = async () => {
    const current = sessionRef.current;
    if (!current || fetchingRef.current || stoppedRef.current || overRef.current) return;
    const request = prefetchRequest(current);
    if (!request) return;
    fetchingRef.current = true;
    try {
      const reply = await services.getRound({ ...identity, ...request });
      if (!mountedRef.current) return;
      if (reply?.roundOpen !== false) commit(withQuestions(sessionRef.current, reply?.questions || []));
    } catch {
      if (mountedRef.current) await wait(1_500);
    } finally {
      fetchingRef.current = false;
    }
    if (mountedRef.current && prefetchRequest(sessionRef.current)) prefetchRef.current();
  };

  // START OR RESUME: first anything this device sent and never heard back
  // about, then where the server says the student is, with their next items.
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    if (persist) clearStaleLineQueues(queueKey);
    const start = async () => {
      let pending = readQueue(queueKey);
      let delay = RETRY_MIN_MS;
      while (pending.length && !cancelled) {
        const batch = pending.slice(0, LINE_LIMITS.batch);
        try {
          // eslint-disable-next-line no-await-in-loop
          await services.submitAttempts({ ...identity, attempts: batch });
          pending = pending.slice(batch.length);
          writeQueue(queueKey, pending);
        } catch (error) {
          // The flush's rule: deadline-exceeded is final only once this
          // device's clock says time is up.
          if (isFinalRefusal(error) || rushRefusalIsTimeUp(error?.code, timing.endMono - performance.now(), error?.details?.reason)) {
            pending = [];
            writeQueue(queueKey, pending);
            break;
          }
          setConnection('retrying');
          // eslint-disable-next-line no-await-in-loop
          await wait(delay);
          delay = Math.min(RETRY_MAX_MS, delay * 2);
        }
      }
      delay = RETRY_MIN_MS;
      while (!cancelled) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const reply = await services.getRound({ ...identity, count: LINE_PREFETCH.batch });
          if (cancelled) return;
          if (reply?.roundOpen === false) { setPhase('closed'); return; }
          if (reply?.joined === false) {
            // The parent's join is on its way.
            // eslint-disable-next-line no-await-in-loop
            await wait(JOIN_WAIT_MS);
            continue;
          }
          setOwnSlopeHelper(reply?.slopeHelper === true);
          commit(createLineSession({ roundIndex, serverState: reply?.state || {}, questions: reply?.questions || [], poolSize: reply?.poolSize ?? null, rules }));
          setConnection('ok');
          setPhase('ready');
          return;
        } catch (error) {
          if (cancelled) return;
          if (isFinalRefusal(error)) {
            console.warn('Round could not be opened:', error);
            setAlert(studentErrorSentence(error, 'This round could not be opened.'));
            setPhase('closed');
            return;
          }
          setConnection('retrying');
          // eslint-disable-next-line no-await-in-loop
          await wait(delay);
          delay = Math.min(RETRY_MAX_MS, delay * 2);
        }
      }
    };
    start();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
      // Leaving mid-round: one last send. What it misses stays stored.
      const batch = sessionRef.current ? nextBatch(sessionRef.current) : [];
      if (batch.length && !stoppedRef.current) services.submitAttempts({ ...identity, attempts: batch }).catch(() => {});
    };
    // One start per mount: the parent remounts this screen for each round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The round's start, the class's buzzer and this student's deadline, on the
  // monotonic clock.
  useEffect(() => {
    const now = performance.now();
    const timers = [];
    if (now < timing.startMono) timers.push(window.setTimeout(() => setStarted(true), timing.startMono - now));
    if (now < timing.buzzerMono) timers.push(window.setTimeout(() => setPastBuzzer(true), timing.buzzerMono - now));
    if (now < timing.endMono) timers.push(window.setTimeout(() => setTimeUp(true), timing.endMono - now));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [timing]);

  // At the buzzer, whatever is queued goes now.
  useEffect(() => {
    if (over) flushRef.current();
  }, [over]);

  // A flash, a shown answer or a skip pause ends: the next item.
  useEffect(() => {
    if (!session?.transition) return undefined;
    const timer = window.setTimeout(() => {
      if (sessionRef.current) commit(settle(sessionRef.current, performance.now()));
    }, Math.max(0, session.transition.until - performance.now()) + 5);
    return () => window.clearTimeout(timer);
  }, [session?.transition, commit]);

  // A pause ends: draw the grid as ready again.
  useEffect(() => {
    const remaining = session ? session.lockedUntil - performance.now() : 0;
    if (!(remaining > 0)) return undefined;
    const timer = window.setTimeout(() => setWake((value) => value + 1), remaining + 5);
    return () => window.clearTimeout(timer);
  }, [session?.lockedUntil, session]);

  // Keep items ready ahead of the one on screen.
  useEffect(() => {
    if (phase === 'ready' && session && prefetchRequest(session)) prefetchRef.current();
  }, [phase, session]);

  // A finished set goes to the server at once: the round may close early.
  const finished = session ? inputState(session, 0) === LINE_INPUT.FINISHED : false;
  useEffect(() => {
    if (finished) flushRef.current();
  }, [finished]);

  // Send what is waiting when the connection returns or the page is hidden.
  useEffect(() => {
    const now = () => flushRef.current();
    const hidden = () => { if (document.visibilityState === 'hidden') flushRef.current(); };
    window.addEventListener('online', now);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('online', now);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);

  const graphAreaRef = useRef(null);
  const side = useElementSquare(graphAreaRef);
  const question = session ? currentQuestion(session) : null;
  const nowMs = performance.now();
  const input = session ? inputState(session, nowMs) : LINE_INPUT.WAITING;
  const playing = phase === 'ready' && started && !over;
  const lockMs = session ? lockRemainingMs(session, nowMs) : 0;
  // The clock a student reads: the race's (the class's buzzer) while it runs —
  // the same countdown as everyone's — then, with extra time, their own.
  const clockEndMono = pastBuzzer ? timing.endMono : timing.buzzerMono;
  const spoken = useTimeAnnouncements(clockEndMono, playing);

  // Refs only: the handlers are memoized for the canvas, and must never see
  // a stale phase.
  const accepting = () => phaseRef.current === 'ready' && !overRef.current
    && performance.now() >= timing.startMono && performance.now() < timing.endMono;
  const act = (record) => {
    const current = sessionRef.current;
    if (!current || !accepting()) return null;
    const at = performance.now();
    const outcome = record(current, { nowMs: at, elapsedMs: at - timing.startMono, attemptId: newLineAttemptId() });
    if (outcome.session !== current) commit(outcome.session);
    if (outcome.attempt) scheduleFlush();
    return outcome;
  };
  const onLine = useCallback((points) => {
    const questionIndex = sessionRef.current ? currentQuestion(sessionRef.current)?.questionIndex : null;
    const outcome = act((current, context) => recordLine(current, { ...context, points }));
    setLineCheck(outcome?.verdict && VERDICT_STYLE[outcome.verdict]
      ? { questionIndex, key: pointsKey(points), kind: VERDICT_STYLE[outcome.verdict] }
      : null);
    // `act` reads only refs and stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, scheduleFlush]);
  const onChoose = (choiceId) => act((current, context) => recordChoice(current, { ...context, choiceId }));
  const onBuild = (fields) => act((current, context) => recordEquation(current, { ...context, fields }));
  const onSkip = () => act(recordSkip);

  // Focus the grid when play begins, so a keyboard is ready at once.
  const frameRef = useRef(null);
  useEffect(() => {
    if (playing && question?.itemType === LINE_ITEM_TYPE.GRAPH) frameRef.current?.querySelector('svg')?.focus({ preventScroll: true });
  }, [playing, question?.itemType, question?.questionIndex]);

  const feedback = session?.feedback || null;
  const feedbackQuestion = feedback ? session.questions[feedback.questionIndex] : null;
  // A message belongs to its item: it shows through that item's flash or
  // shown answer, and clears when the next item appears.
  const message = feedback && (feedback.questionIndex === session.cursor || session.transition)
    ? lineFeedbackMessage(feedback, feedbackQuestion, { left: triesLeft(session) })
    : '';
  const completed = session?.counts.completed ?? 0;
  const ended = session?.counts.ended ?? 0;
  const poolEnd = session?.poolEnd ?? null;
  const transition = session?.transition || null;
  const revealed = transition?.kind === LINE_FEEDBACK.REVEALED && question && transition.questionIndex === question.questionIndex;
  const queued = session?.queue.length || 0;
  const disabled = !playing || input !== LINE_INPUT.READY;
  const canSkip = format !== LINE_GRAPH_FORMAT.CLASSIC;
  const graphing = question?.itemType === LINE_ITEM_TYPE.GRAPH;
  const verdict = lineCheck && question && lineCheck.questionIndex === question.questionIndex ? lineCheck : null;
  const shownAnswer = revealed && question?.itemType === LINE_ITEM_TYPE.NAME && question.answerStyle !== LINE_ANSWER_STYLE.CHOICE ? answerEquation(question) : null;
  // A Sprint counts through its set; a Classic round is one item.
  const progress = format === LINE_GRAPH_FORMAT.SPRINT && poolEnd ? `${Math.min(poolEnd, completed + ended)} / ${poolEnd}` : null;
  const doneLine = format === LINE_GRAPH_FORMAT.CLASSIC
    ? (completed ? 'You got it.' : 'This one is done.')
    : `${completed} of ${completed + ended} right.`;
  const streak = session?.streak || 0;

  let overlay = null;
  if (phase === 'loading') overlay = <><strong>Loading…</strong><span>{connection === 'retrying' ? 'Reconnecting to the round…' : 'Getting your lines ready.'}</span></>;
  else if (phase === 'closed' || roundClosed) overlay = <><strong>Round over</strong><span>Waiting for the results…</span></>;
  else if (!started) overlay = <><LineCountdownNumber startMono={timing.startMono} /><strong>Get ready</strong><span>{format === LINE_GRAPH_FORMAT.RUSH ? 'Graph as many lines as you can.' : 'Place two points — your line is checked when you let go.'}</span></>;
  else if (over) {
    overlay = practice
      ? (
        <>
          <strong>Time!</strong>
          <span>{completed} line{completed === 1 ? '' : 's'} right in practice.</span>
          {typeof onPracticeAgain === 'function' && <button type="button" className="mm-line-button" style={{ marginTop: 8 }} onClick={onPracticeAgain}>Play again</button>}
        </>
      )
      : <><strong>Time!</strong><span>{completed} right. {queued ? 'Saving your last answers…' : 'Waiting for the results…'}</span></>;
  } else if (input === LINE_INPUT.FINISHED) {
    overlay = (
      <>
        <strong>All done!</strong>
        <span>{doneLine} {practice ? '' : queued ? 'Saving your answers…' : 'Waiting for the others…'}</span>
        {practice && typeof onPracticeAgain === 'function' && <button type="button" className="mm-line-button" style={{ marginTop: 8 }} onClick={onPracticeAgain}>Play again</button>}
      </>
    );
  } else if (!question) overlay = <><strong>Loading…</strong><span>Getting your next line.</span></>;

  const prompt = playing && question;
  // EXTRA TIME, past the class's buzzer and before this student's own
  // deadline: said to them, on their own screen, and nowhere else.
  const extraTime = playing && pastBuzzer;
  return (
    <div className="mm-line-shell" role="region" aria-label={practice ? 'Graph the Line practice' : `Graph the Line, round ${roundIndex + 1}`}>
      <style>{LINE_CSS}</style>
      <header className="mm-line-bar">
        {alias && <span className="mm-line-chip">{alias}</span>}
        <span className="mm-line-round">{practice ? 'Practice' : `Round ${roundIndex + 1} of ${roundCount}`}</span>
        {progress && <span className="mm-line-progress"><span aria-hidden="true">{progress}</span><span style={SR_ONLY_STYLE}>{`${progress.replace(' / ', ' of ')} done`}</span></span>}
        {/* Each right line pops the count (and the streak) once, keyed to it. */}
        <span className="mm-line-done"><span key={completed} className={completed > 0 ? 'mm-gp-bump' : undefined} aria-hidden="true">✓ {completed}</span><span style={SR_ONLY_STYLE}>{`${completed} right`}</span></span>
        {streak >= 2 && <span className="mm-line-streak"><span key={streak} className="mm-gp-bump" aria-hidden="true">🔥 {streak}</span><span style={SR_ONLY_STYLE}>{`${streak} right in a row`}</span></span>}
        {connection === 'retrying' && <span className="mm-line-sync" role="status">Reconnecting… your answers are saved</span>}
        <LineClock startMono={timing.startMono} endMono={clockEndMono} />
        {typeof onExit === 'function' && <button type="button" className="mm-line-exit" onClick={onExit}>{exitLabel}</button>}
      </header>
      <div className="mm-line-stage">
        <section className="mm-line-prompt" aria-live="polite">
          {practice && <div className="mm-line-banner" style={{ marginBottom: 6 }}>Practice — nothing is recorded.</div>}
          {extraTime && (
            <div className="mm-line-banner" data-mm-line-extra-time="1" style={{ marginBottom: 6 }}>
              Your extra time. The race is over — finish your lines. They count for your practice, not the race.
            </div>
          )}
          <h2>{prompt ? question.title : 'Graph the Line'}</h2>
          {prompt && graphing && <LineEquation className="mm-line-equation" equation={question.equation} />}
          {prompt && question.instructions && <p className="mm-line-hint">{question.instructions}</p>}
          {prompt && graphing && !question.instructions && <p className="mm-line-hint">Place two points on the grid. Your line is checked when you let go.</p>}
        </section>
        <section className="mm-line-graph-area" ref={graphAreaRef}>
          {side > 0 && (
            <div
              ref={frameRef}
              className="mm-line-graph-frame"
              data-question-index={question && started ? question.questionIndex : ''}
              data-paused={playing && input === LINE_INPUT.LOCKED ? '1' : '0'}
              style={{ width: side, height: side }}
            >
              {question && started && phase === 'ready' ? (
                <div className={question.questionIndex % 2 ? 'mm-line-in-a' : 'mm-line-in-b'} style={{ width: side, height: side }}>
                  <LineGraphCanvas
                    question={question}
                    side={side}
                    mode={graphing ? 'draw' : 'show'}
                    paused={disabled}
                    verdict={verdict}
                    revealed={Boolean(revealed && graphing)}
                    slopeHelper={config.slopeHelper === true || ownSlopeHelper}
                    resetKey={`${question.questionIndex}:${startOver}`}
                    onLine={onLine}
                    label={graphing
                      ? `Graph ${question.equation?.speech || 'the line'}. Press and drag to place two points, or use the arrow keys and Enter.`
                      : 'The line to name.'}
                  />
                </div>
              ) : <div style={{ width: side, height: side, borderRadius: 12, background: 'var(--mm-graph-bg)' }} />}
              {transition?.kind === LINE_FEEDBACK.CORRECT && <div key={transition.questionIndex} className="mm-line-flash" aria-hidden="true" />}
              {/* A gold +1 rises off a right line, inside the flash's own time. */}
              {transition?.kind === LINE_FEEDBACK.CORRECT && <span key={`plus-${transition.questionIndex}`} className="mm-gp-plus" aria-hidden="true">+1</span>}
              {overlay && <div className="mm-line-overlay">{overlay}</div>}
              {/* Mounted once, at the start; faded out and hidden after (CSS). */}
              {started && sawCountdown && (
                <div className="mm-gp-go-flash" aria-hidden="true"><StartLights go /><span className="mm-gp-go">GO!</span></div>
              )}
            </div>
          )}
        </section>
        <section className="mm-line-controls">
          <div className="mm-line-feedback" data-kind={feedback?.kind || ''} aria-live="polite">
            {playing ? message : ''}
            {playing && shownAnswer && <> <LineEquation equation={shownAnswer} /></>}
          </div>
          {input === LINE_INPUT.LOCKED && playing && (
            <div className="mm-line-cooldown" role="status" aria-label="Short pause after misses">
              <span key={session.lockedUntil} style={{ animationDuration: `${lockMs}ms` }} />
            </div>
          )}
          {prompt && question.answerStyle === LINE_ANSWER_STYLE.CHOICE && (
            <ChoiceAnswer question={question} disabled={disabled} feedback={feedback} onChoose={onChoose} />
          )}
          {prompt && question.answerStyle === LINE_ANSWER_STYLE.BUILD && (
            <BuildAnswer question={question} disabled={disabled} feedback={feedback} onCheck={onBuild} />
          )}
          <div className="mm-line-buttons">
            {graphing && <button type="button" className="mm-line-button" disabled={disabled} onClick={() => { setStartOver((value) => value + 1); setLineCheck(null); }}>Start over</button>}
            {canSkip && <button type="button" className="mm-line-button" disabled={disabled} onClick={onSkip}>Skip</button>}
          </div>
          {alert && <div role="alert" className="mm-line-alert">{alert}</div>}
          <div aria-live="polite" className="mm-line-visually-hidden">{spoken}</div>
        </section>
      </div>
    </div>
  );
}
