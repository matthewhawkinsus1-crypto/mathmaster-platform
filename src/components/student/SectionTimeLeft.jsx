import React, { useEffect, useRef, useState } from 'react';
import { SR_ONLY_STYLE } from '../../ui/srOnly.js';
import { UNFINISHED_WORK_LINE, formatTimeLeft, takeDueTimeAlert } from '../../platform/student/timeLeftAlerts.js';

const toMillis = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

/*
 * THE TIME LEFT ON A TIMED SECTION, AND ITS WARNINGS (pass 3, RUN-10).
 *
 * `endsAt` is the lifecycle state's own end (getDOLState / getWarmupState):
 * a student's extra time moves it there, never here. This component only
 * counts down to it, on its own one-second clock so the app does not re-render
 * every second.
 *
 * At 2:00 and 0:30 it says, once each per window, how long is left and what
 * happens to unfinished work — in an assertive region that is always mounted
 * (a region inserted already filled is not reliably read). The pill shows
 * seconds in the last minute. `hideCountdown` (a student's support setting)
 * hides the ticking numbers, not the warnings: a warning is said once, and
 * missing it loses work.
 */
export default function SectionTimeLeft({ label, endsAt, hideCountdown = false, className = '', compact = false }) {
  const endMs = toMillis(endsAt);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [alert, setAlert] = useState(null);
  const previousRef = useRef(null);

  // A warning belongs to its window (the section and its end): a new end is a
  // new window, and an old warning is not shown for it. Never cleared on a
  // mount — under React's development double mount that erased a warning
  // already taken for good (said once per window).
  const windowKey = `${label}|${endMs}`;
  useEffect(() => {
    previousRef.current = null;
    if (!endMs) return undefined;
    const tick = () => setNowMs(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [endMs]);

  const remainingMs = endMs ? Math.max(0, endMs - nowMs) : null;
  useEffect(() => {
    if (remainingMs == null) return;
    const due = takeDueTimeAlert({ key: windowKey, remainingMs, previousRemainingMs: previousRef.current });
    previousRef.current = remainingMs;
    if (due) setAlert({ ...due, windowKey });
  }, [remainingMs, windowKey]);
  const shownAlert = alert?.windowKey === windowKey ? alert : null;

  if (!endMs) return null;
  const urgent = remainingMs <= 120_000;
  const time = formatTimeLeft(remainingMs);
  return (
    <span className={`mathmaster-section-time-left${urgent ? ' is-urgent' : ''}${className ? ` ${className}` : ''}`} data-section-time-left="">
      <span aria-hidden={compact ? undefined : 'true'}>
        {compact ? null : `${label} open`}
        {!hideCountdown && <strong>{compact ? `⏱ ${time}` : ` · ${time}`}</strong>}
        {compact && hideCountdown ? <strong>⏱ open</strong> : null}
      </span>
      {/* Screen readers get the time in words when asked, not a tick a second. */}
      {!compact && <span style={SR_ONLY_STYLE}>{`${label} is open${hideCountdown ? '' : `, ${time} left`}.`}</span>}
      {urgent && !compact && <span className="mathmaster-section-time-left-line">{UNFINISHED_WORK_LINE.section}</span>}
      <span role="alert" style={SR_ONLY_STYLE}>
        {shownAlert ? `${shownAlert.words} on the ${label}. ${UNFINISHED_WORK_LINE.section}` : ''}
      </span>
    </span>
  );
}
