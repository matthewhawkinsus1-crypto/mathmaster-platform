/*
 * DIAGNOSTICS MUST NEVER STAND BETWEEN A STUDENT AND THEIR GRADE.
 *
 * Two separate callables run after a Submit. `ingestStudentSubmissions` is the
 * one that turns captured work into a canonical attempt. `reportStudentDeviceQueue`
 * is a diagnostic: it tells a teacher what this Chromebook is still holding.
 *
 * The first implementation ran them in a straight line —
 *
 *     await reportStudentOutbox();     // pre-drain snapshot
 *     await drainStudentOutbox();      // the grades
 *     await reportStudentOutbox();     // post-drain snapshot
 *
 * — which makes the diagnostic part of the delivery critical path. Both
 * callables share the same 12-second timeout, so a reporting endpoint that is
 * degraded while ingestion is perfectly healthy delays every canonical grade
 * by twelve seconds. That is exactly backwards: a delayed diagnostic costs a
 * teacher a little visibility, a delayed grade costs a student their work
 * sitting unrecorded for longer than it had to.
 *
 * So the pre-drain report is STARTED before the drain — the teacher still gets
 * the "before" snapshot, and starting it first is the only way to capture the
 * queue as it stood — but it is never awaited ahead of delivery. It settles on
 * its own, and its failure is handled where it happens.
 *
 * Nothing in this module touches the student's screen. The local-first path
 * (local grade, durable IndexedDB enqueue, UI advances) is upstream of all of
 * it and awaits none of it.
 */

/**
 * Start a report, swallow its failure, and report how it settled — without
 * ever handing the caller a promise they might be tempted to await.
 *
 * `onSettled` receives `{ ok, result, error }`. It is the ONLY place a report
 * failure surfaces, which is what keeps a reporting outage out of the delivery
 * path entirely rather than merely off its happy path.
 */
export const startDetachedReport = (report, onSettled = () => {}) => {
  let settled;
  try {
    settled = Promise.resolve(report());
  } catch (error) {
    settled = Promise.reject(error);
  }
  return settled.then(
    (result) => { onSettled({ ok: true, result, error: null }); return result; },
    (error) => { onSettled({ ok: false, result: null, error }); return null; },
  );
};

/**
 * Report, deliver, report — with delivery gated on nothing but delivery.
 *
 * The returned promise resolves as soon as the drain resolves. Both reports
 * are in flight or finished by then or they are not, and either way the
 * caller's next step (and the student's next question) does not wait for them.
 */
export const reconcileWithDeviceReports = async ({
  report,
  drain,
  onReportSettled = () => {},
}) => {
  // Pre-drain snapshot: started FIRST so it describes the queue before the
  // drain empties it, and awaited by nobody.
  startDetachedReport(report, onReportSettled);
  const result = await drain();
  // Post-drain snapshot: what is left after delivery did what it could. Also
  // detached — the drain result is already known and the caller may have it.
  startDetachedReport(report, onReportSettled);
  return result;
};

/*
 * WHY REPORTS ARE COALESCED.
 *
 * Every queued submission is "new queued work", and a student answering a
 * multi-part question can queue several inside a second. One report cycle per
 * submission means an unbounded fan-out of duplicate callables, each with a
 * 12-second bound, describing a queue that changed while they were in flight.
 *
 * The rule is: at most ONE report in flight, and at most ONE follow-up waiting
 * behind it. Anything asked for while a report is in flight collapses into
 * that single follow-up, so the last request always produces a report and the
 * count never grows with the submission rate.
 *
 * The events that must report IMMEDIATELY — hydration, reconnect, pageshow,
 * visibility return, new queued work, post-drain state — pass through with no
 * delay when nothing is in flight. They still coalesce onto an in-flight
 * report, which is not a delay: a report that started a moment ago plus the
 * follow-up behind it already describe the current state.
 */
export const DEVICE_REPORT_MIN_INTERVAL_MS = 3_000;

export const createDeviceReportCoordinator = ({
  report,
  onSettled = () => {},
  minIntervalMs = DEVICE_REPORT_MIN_INTERVAL_MS,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
  now = () => Date.now(),
} = {}) => {
  let inFlight = false;
  let followUpQueued = false;
  let trailingTimer = null;
  let lastStartedAt = null;
  let started = 0;

  const cancelTrailing = () => {
    if (trailingTimer === null) return;
    clearTimer(trailingTimer);
    trailingTimer = null;
  };

  const run = () => {
    cancelTrailing();
    inFlight = true;
    lastStartedAt = now();
    started += 1;
    startDetachedReport(report, (settlement) => {
      inFlight = false;
      onSettled(settlement);
      if (!followUpQueued) return;
      followUpQueued = false;
      // The state changed while this report was describing an older one, so
      // exactly one more goes out. It cannot cascade: a follow-up that is
      // itself superseded sets the same single flag again.
      run();
    });
  };

  return {
    /**
     * Ask for the device's state to be reported.
     *
     * `immediate` is for the events that must not wait behind a rate limit:
     * hydration, reconnect, pageshow, visibility return, newly queued work and
     * the post-drain snapshot. Ordinary background ticks may be held to
     * `minIntervalMs` instead.
     */
    request: ({ immediate = true } = {}) => {
      if (inFlight) {
        followUpQueued = true;
        return;
      }
      const sinceLast = lastStartedAt === null ? Infinity : now() - lastStartedAt;
      if (immediate || sinceLast >= minIntervalMs) {
        run();
        return;
      }
      if (trailingTimer !== null) return;
      trailingTimer = setTimer(() => { trailingTimer = null; run(); }, Math.max(0, minIntervalMs - sinceLast));
    },
    /** Drop a pending trailing report; in-flight work is left to settle. */
    cancel: () => { cancelTrailing(); followUpQueued = false; },
    /** For tests and diagnostics: how many reports this coordinator started. */
    startedCount: () => started,
    pending: () => inFlight || followUpQueued || trailingTimer !== null,
  };
};
