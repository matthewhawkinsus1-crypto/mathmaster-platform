import { useEffect, useRef, useState } from 'react';
import { answerEditorPreflightRequest } from '../../platform/preflight/questionPreflightFindings.js';

/*
 * PRE-FLIGHT'S FINDINGS IN THE QUESTION EDITOR, KEPT UP TO DATE, NEVER IN THE WAY.
 *
 * The findings come from the whole assignment's Pre-Flight model, which costs
 * hundreds of milliseconds a run for a large assignment, and several times
 * that on a Chromebook (docs/handoffs/NOVEMBER_BUILD_2026-11.md, section 2).
 * So it runs just after the editor opens, and then only once the questions
 * have stopped changing for PREFLIGHT_FINDINGS_DELAY_MS. Typing the title or
 * a repair request changes no question and runs nothing. The findings already
 * shown stay until the new ones are ready, so nothing on screen jumps while
 * the teacher types, and nothing is announced.
 *
 * A run is never on the page's own thread: it was one long task there, and a
 * key pressed just after a pause waited for all of it. It runs in a worker
 * (editorPreflightWorker.js) that the first run starts and closing the editor
 * ends. A run whose questions changed while it ran is never shown, and only
 * the newest request waits for a busy worker, so a stale run can never take
 * the place of a newer one. Where no worker can start, the run is made on the
 * page as it always was, with the same findings.
 *
 * The findings live in a small store the regions subscribe to
 * (PreflightFindings.jsx), not in the editor's state: a keystroke draws the
 * editor once, as it always did, and new findings draw only the regions whose
 * findings changed, never the editor's other cards.
 */
export const PREFLIGHT_FINDINGS_DELAY_MS = 500;

const sameFindings = (before, after) => Boolean(before && after)
  && before.warnings.length === after.warnings.length
  && before.notes.length === after.notes.length
  && before.warnings.every((text, index) => text === after.warnings[index])
  && before.notes.every((text, index) => text === after.notes[index]);

// Each question's findings keep the object they had when nothing in them
// changed, so the region drawn from them is not drawn again.
const keepUnchanged = (previous, next) => {
  if (!previous || !next) return next;
  next.byQuestionId.forEach((entry, questionId) => {
    const before = previous.byQuestionId.get(questionId);
    if (sameFindings(before, entry)) next.byQuestionId.set(questionId, before);
  });
  if (sameFindings(previous.assignment, next.assignment)) next.assignment = previous.assignment;
  return next;
};

/**
 * { snapshot, subscribe, publish }: `snapshot()` is { findings, basis }, the
 * findings and the { source, questions, classSize } they were computed for.
 */
export const createPreflightFindingsStore = () => {
  let snapshot = { findings: null, basis: null };
  const listeners = new Set();
  return {
    snapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish: (findings, basis) => {
      snapshot = { findings: keepUnchanged(snapshot.findings, findings), basis };
      listeners.forEach((listener) => listener());
    },
  };
};

// Vite bundles the worker on its own when it is written exactly so: a
// `new URL(…, import.meta.url)` inside `new Worker(…)`.
const startPreflightWorker = () => new Worker(new URL('../../platform/preflight/editorPreflightWorker.js', import.meta.url), { type: 'module', name: 'Pre-Flight' });

/**
 * The editor's Pre-Flight runs, in a worker.
 *
 *   request(basis, deliver)  run Pre-Flight on basis = { source, questions,
 *                            classSize }; deliver(findings, basis) is called
 *                            with what it found, unless request() or cancel()
 *                            is called again first.
 *   cancel()                 the newest request is not wanted any more (its
 *                            questions changed): it is never delivered.
 *   stop()                   the editor closed: the worker ends, with any run
 *                            in it, and nothing is delivered after.
 *
 * One request at a time is with the worker; a newer one waits, in place of
 * any that was waiting, and an answer is delivered only for the newest
 * request. The worker starts at the first request (never while the editor is
 * drawn), and where it cannot start or fails, each run is made here.
 * `startWorker` and `answerHere` are for the tests.
 */
export const createPreflightFindingsRunner = ({ startWorker = startPreflightWorker, answerHere = answerEditorPreflightRequest } = {}) => {
  let worker = null;
  let noWorker = false;
  let requests = 0;
  let wanted = null;
  let running = null;
  let waiting = null;

  const deliver = (id, findings) => {
    if (!wanted || wanted.id !== id) return;
    const { basis, onFindings } = wanted;
    wanted = null;
    onFindings(findings ?? null, basis);
  };
  const runHere = (entry) => deliver(entry.id, answerHere({ id: entry.id, ...entry.basis }).findings);

  const end = () => {
    if (!worker) return;
    worker.removeEventListener('message', answered);
    worker.removeEventListener('error', failed);
    worker.removeEventListener('messageerror', failed);
    worker.terminate();
    worker = null;
  };
  function answered(event) {
    const { id, findings } = event?.data || {};
    if (running === null || id !== running) return;
    running = null;
    deliver(id, findings);
    if (!waiting) return;
    const entry = waiting;
    waiting = null;
    send(entry);
  }
  // The worker could not load (a file a newer deploy replaced) or broke: this
  // run, and every run after it, is made here, as it always was.
  function failed(event) {
    event?.preventDefault?.();
    end();
    noWorker = true;
    running = null;
    waiting = null;
    if (wanted) runHere(wanted);
  }
  function send(entry) {
    if (!worker && !noWorker) {
      try {
        worker = startWorker();
        worker.addEventListener('message', answered);
        worker.addEventListener('error', failed);
        worker.addEventListener('messageerror', failed);
      } catch {
        worker = null;
        noWorker = true;
      }
    }
    if (!worker) {
      runHere(entry);
      return;
    }
    try {
      worker.postMessage({ id: entry.id, ...entry.basis });
      running = entry.id;
    } catch {
      // Questions the browser cannot copy to a worker: this run is made here.
      runHere(entry);
    }
  }

  return {
    request(basis, onFindings) {
      requests += 1;
      wanted = { id: requests, basis, onFindings };
      if (running !== null) {
        waiting = wanted;
        return;
      }
      send(wanted);
    },
    cancel() {
      wanted = null;
      waiting = null;
    },
    stop() {
      end();
      wanted = null;
      waiting = null;
      running = null;
      // A component mounted again (React's StrictMode does it once) starts afresh.
      noWorker = false;
    },
  };
};

export default function useQuestionPreflightFindings({ source, questions, classSize = null, delayMs = PREFLIGHT_FINDINGS_DELAY_MS }) {
  const [store] = useState(createPreflightFindingsStore);
  const [runner] = useState(createPreflightFindingsRunner);
  // Closing the editor ends the worker, and the run in it.
  useEffect(() => () => runner.stop(), [runner]);
  // The first run waits for nothing: the editor has just opened.
  const ranRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      ranRef.current = true;
      runner.request({ source, questions, classSize }, (findings, basis) => store.publish(findings, basis));
    }, ranRef.current ? delayMs : 0);
    return () => {
      clearTimeout(timer);
      // The questions changed, or the editor closed: a run still going is for
      // questions no longer on screen, and its findings are never shown.
      runner.cancel();
    };
  }, [store, runner, source, questions, classSize, delayMs]);
  return store;
}
