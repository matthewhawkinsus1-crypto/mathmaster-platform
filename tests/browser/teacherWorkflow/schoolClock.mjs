// Every teacher-harness browser runs as a school Chromebook: in the school's
// time zone, on a mid-week school morning. (warmupReopenJourneys.mjs sets and
// fast-forwards its own clock.)
//
// WHY. The fixture builds the bell schedule, "yesterday" and the week's service
// log from the browser's clock and zone, and the app counts support evidence by
// the school's week in America/Chicago. A browser on CI's clock (UTC) therefore
// met a different school day from the app's: after about 23:10 UTC Period 3 was
// clamped to end by 23:55, so DOL journeys read "Opens automatically". On a
// Saturday evening in Chicago, already Sunday in UTC, this week's service
// minutes were counted into another week. Both are the time of day, not the PR.
//
// ONE TIMELINE. Every context's clock is real time shifted back to the most
// recent Wednesday 11:00 in Chicago, so a device opened later in the run stays
// in step with the others, and a browser is never ahead of this runner's clock.
// Wednesday keeps "yesterday" and the fixture's week of service minutes inside
// one school week, whichever day the week starts on.
//
// ONLY THE DATE MOVES. Timers, animation frames and performance.now() stay the
// browser's own, so the app's timing is a Chromebook's. Playwright's
// clock.install fakes timers too and fires them from its own loop, which
// reorders a delayed draft read against keystrokes: draftCrossDeviceJourneys'
// "directions" then typed into a question that was remounting under it.
export const SCHOOL_TIME_ZONE = 'America/Chicago';
const SCHOOL_WEEKDAY = 3; // Wednesday
const SCHOOL_HOUR = 11;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const schoolParts = (ms) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: SCHOOL_TIME_ZONE, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
}).formatToParts(ms).map(({ type, value }) => [type, value]));
// The school zone's offset from UTC at an instant (Chicago: −5 or −6 hours).
const offsetAt = (ms) => {
  const parts = schoolParts(ms);
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) - Math.floor(ms / 1000) * 1000;
};
// The instant that a wall-clock hour on a school-zone date names.
const schoolInstant = (year, monthIndex, day, hour) => {
  const wall = Date.UTC(year, monthIndex, day, hour);
  return wall - offsetAt(wall - offsetAt(wall));
};

// The most recent Wednesday 11:00 in the school's zone, at or before `realMs`.
export const schoolMorningBefore = (realMs) => {
  const parts = schoolParts(realMs);
  const year = Number(parts.year);
  const monthIndex = Number(parts.month) - 1;
  const daysBack = (WEEKDAYS.indexOf(parts.weekday) - SCHOOL_WEEKDAY + 7) % 7;
  const morning = schoolInstant(year, monthIndex, Number(parts.day) - daysBack, SCHOOL_HOUR);
  return morning <= realMs ? morning : schoolInstant(year, monthIndex, Number(parts.day) - daysBack - 7, SCHOOL_HOUR);
};

const SHIFT_MS = schoolMorningBefore(Date.now()) - Date.now();

// What the harness browsers' clocks read now.
export const schoolNow = () => Date.now() + SHIFT_MS;

// Runs in each page before the app: `Date` reads the school clock.
const shiftDate = (shiftMs) => {
  const RealDate = Date;
  const now = () => RealDate.now() + shiftMs;
  globalThis.Date = new Proxy(RealDate, {
    construct: (target, args, newTarget) => Reflect.construct(target, args.length ? args : [now()], newTarget),
    apply: () => new RealDate(now()).toString(),
    get: (target, key) => (key === 'now' ? now : Reflect.get(target, key)),
  });
};

// browser.newContext in the school's zone, with every page on the school clock.
export const newSchoolContext = async (browser, options = {}) => {
  const context = await browser.newContext({ timezoneId: SCHOOL_TIME_ZONE, ...options });
  await context.addInitScript(shiftDate, SHIFT_MS);
  return context;
};
