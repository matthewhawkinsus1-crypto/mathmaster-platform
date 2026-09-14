/*
 * THE SCHOOL CLOCK, USABLE FROM BOTH SIDES.
 *
 * Warm-Up and DOL windows are defined in school-local wall time: "Period 3
 * starts at 10:05", "this is the instructional date". The browser got that for
 * free because a student's Chromebook is in the school's timezone. A Cloud
 * Function is not — it runs in UTC — so every local-time primitive the
 * lifecycle depends on is restated here with an explicit zone.
 *
 * `timeZone: null` means "use the runtime's own zone", which is exactly what
 * the browser did before and still does. The server passes the school zone.
 */

const PART_FORMAT_CACHE = new Map();

const partsFormatter = (timeZone) => {
  const key = timeZone || 'local';
  if (!PART_FORMAT_CACHE.has(key)) {
    PART_FORMAT_CACHE.set(key, new Intl.DateTimeFormat('en-US', {
      ...(timeZone ? { timeZone } : {}),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }));
  }
  return PART_FORMAT_CACHE.get(key);
};

/** Wall-clock fields for an instant, in the given zone. */
export const zonedParts = (value, timeZone = null) => {
  const date = value instanceof Date ? value : new Date(Number(value));
  if (Number.isNaN(date.getTime())) return null;
  if (!timeZone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
      weekday: date.getDay(),
    };
  }
  const parts = Object.fromEntries(
    partsFormatter(timeZone).formatToParts(date).map((part) => [part.type, part.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  // Day-of-week from the zoned Y/M/D, so a UTC instant near midnight does not
  // report yesterday's weekly day type for a Chicago class.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour: Number(parts.hour) % 24, minute: Number(parts.minute), second: Number(parts.second), weekday };
};

const offsetMs = (instantMs, timeZone) => {
  const parts = zonedParts(instantMs, timeZone);
  if (!parts) return 0;
  // formatToParts has no milliseconds, so compare second-aligned instants on
  // both sides. Zone offsets are whole minutes; nothing is lost.
  const wallSeconds = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wallSeconds - Math.floor(instantMs / 1000) * 1000;
};

/**
 * The instant at which the given wall-clock time occurs in the given zone.
 *
 * Resolved twice so a DST transition inside the first guess corrects itself.
 */
export const zonedInstant = ({ year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0 }, timeZone = null) => {
  if (!timeZone) return new Date(year, month - 1, day, hour, minute, second, millisecond).getTime();
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const firstPass = wall - offsetMs(wall, timeZone);
  return wall - offsetMs(firstPass, timeZone);
};

/** `YYYY-MM-DD` for an instant, in the given zone. */
export const zonedDateKey = (value = Date.now(), timeZone = null) => {
  const parts = zonedParts(value, timeZone);
  if (!parts) return '';
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};

/** The instant of `HH:MM` on the calendar day containing `value`. */
export const zonedTimeOnDate = (value, text, timeZone = null) => {
  if (!/^\d{2}:\d{2}$/.test(String(text || ''))) return null;
  const parts = zonedParts(value, timeZone);
  if (!parts) return null;
  const [hour, minute] = String(text).split(':').map(Number);
  return zonedInstant({ year: parts.year, month: parts.month, day: parts.day, hour, minute }, timeZone);
};

/**
 * Parse a stored date or datetime into an instant.
 *
 * A bare `YYYY-MM-DD` is a school calendar DAY, so it resolves to the start (or
 * end) of that day in the school's zone rather than to UTC midnight.
 */
export const parseInstant = (value, { endOfDay = false, timeZone = null } = {}) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') {
    const asDate = value.toDate();
    return Number.isNaN(asDate.getTime()) ? null : asDate.getTime();
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return zonedInstant(
      endOfDay
        ? { year, month, day, hour: 23, minute: 59, second: 59, millisecond: 999 }
        : { year, month, day },
      timeZone,
    );
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};
