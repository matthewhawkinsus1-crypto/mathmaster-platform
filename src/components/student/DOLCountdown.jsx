import React, { useEffect, useState } from 'react';

const toMillis = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

const formatCountdown = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
};

// Isolated one-second clock so the entire MathMaster application does not have
// to re-render every second merely to make a DOL countdown feel like a timer.
export default function DOLCountdown({ endsAt, style = {}, prefix = '' }) {
  const [tick, setTick] = useState(() => Date.now());
  const endMs = toMillis(endsAt);

  useEffect(() => {
    if (!endMs) return undefined;
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [endMs]);

  if (!endMs) return null;
  return <span aria-live="off" style={style}>{prefix}{formatCountdown(endMs - tick)}</span>;
}
