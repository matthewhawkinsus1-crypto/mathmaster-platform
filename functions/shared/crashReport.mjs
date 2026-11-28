/*
 * WHAT A CRASH REPORT MAY CARRY, AND HOW A DAY OF THEM IS READ.
 *
 * A question that crashed on every reload kept students stuck for a class
 * period, and the owner heard of it from reports (PR #553). The device already
 * keeps a scrubbed local log (src/platform/runtime/clientDiagnostics.js), but
 * nothing leaves it unless a person presses "Copy details for your teacher".
 * This module defines the one thing that MAY leave the device on its own, when
 * the owner has turned reporting on: a count, in a bucket.
 *
 * A bucket is built ONLY from closed sets and shapes. Nothing in it is free
 * text:
 *
 *   build         7 to 12 hex digits, or "unknown"
 *   kind          one of CRASH_KINDS, or "other"
 *   source        an identifier-shaped word the code passed, or "other"
 *   role          "student" or "teacher" (the server sets it from the token)
 *   screen        a route template: known route words, ":id" for the rest
 *   family        an identifier-shaped question family id, or "none"
 *   questionType  an identifier-shaped module name, or "none"
 *   signature     the error message rebuilt from a fixed word list: every
 *                 word that is not in SIGNATURE_VOCABULARY becomes "_", every
 *                 number "#". A typed answer, a name, an email address, an id,
 *                 a URL or a line of question text cannot survive it, because
 *                 none of them is on the list.
 *   assignmentId, questionId   only in the "question" mode the owner chooses;
 *                 ids of content, never of a person.
 *
 * There is no student id, name, email, class, answer, question text, stack or
 * time of day. The message the local log keeps is NOT sent.
 *
 * Pure, and shared: the browser builds buckets with it, the callable rebuilds
 * every bucket it receives with it (a hand-built request gets no further than
 * the app does), and the Platform health view reads the days with it. No
 * node: imports, so the browser can bundle it.
 */

export const CRASH_REPORT_SCHEMA = 1;
export const CRASH_REPORTING_FLAG = 'crashReporting';
export const PLATFORM_HEALTH_DAILY_COLLECTION = 'platformHealthDaily';
export const PLATFORM_HEALTH_REPORTERS_COLLECTION = 'platformHealthReporters';

/** off: nothing is sent. family: the aggregate key. question: also which question. */
export const CRASH_REPORTING_MODES = Object.freeze(['off', 'family', 'question']);
export const resolveCrashReportingMode = (flag) => (
  flag && typeof flag === 'object' && CRASH_REPORTING_MODES.includes(flag.mode) ? flag.mode : 'off'
);

// The bounds. A device sends little, and the server accepts less.
export const CRASH_REPORT_LIMITS = Object.freeze({
  bucketsPerCall: 12, // buckets in one request
  countPerBucketPerCall: 25, // a crash loop adds at most this much per request
  callsPerReporterPerDay: 8, // report requests one account may make in a day
  bucketsPerReporterPerDay: 20, // distinct buckets one account may touch in a day
  bucketsPerDay: 300, // distinct buckets a day's document holds; the rest are counted as overflow
  dailyRetentionDays: 30,
  reporterRetentionDays: 2,
});

export const CRASH_KINDS = Object.freeze([
  'chunk-load', 'render-error', 'question-module-error', 'unhandled-rejection', 'window-error',
  'question-resolution-error', 'question-resolution-failure',
]);

// Route words (src/app/routes/appUrl.js). A path segment that is not one of
// these is an id or a position, and is sent as ":id".
// tests/platform/crashReportScrubbing.test.mjs fails when appUrl gains a word
// this list lacks.
export const SCREEN_WORDS = Object.freeze([
  'assignments', 'grades', 'rewards', 'path', 'tests', 'test-cycle', 'live', 'results',
  'session', 'dashboard', 'progress', 'ccmr', 'history',
  'teacher', 'admin', 'preview',
  'home', 'library', 'classes-workspace', 'students', 'weekly-path', 'pacing', 'action-center',
  'attendance-history', 'parent-contacts', 'discipline', 'grade-transfer', 'standards', 'analytics', 'exams',
  'live-challenge', 'math-tools', 'simulator', 'demo', 'classes', 'classroom', 'access',
  'accounts', 'ai', 'coverage', 'reset',
]);

/*
 * The only words an error signature can contain. They are the words JavaScript
 * engines, React, Firebase and the math libraries use to say what went wrong.
 * Deliberately absent: anything that is also a common given name or could
 * read as an answer (no "max", "may", "will", "mark", "page", "case", "long").
 */
export const SIGNATURE_VOCABULARY = Object.freeze(new Set((
  'a an the of to in at on for from by with without into as and or but not no is are was were be been '
  + 'has have had does do did it its this that than then when while during before after between '
  + 'cannot can could must should '
  + 'read reading write writing set setting get getting call calling called access accessing '
  + 'convert converting parse parsing parser load loading loaded fetch fetching import imported importing '
  + 'evaluate evaluating render rendering rendered renders remove removed append insert create created '
  + 'properties property undefined null nan infinity true false function object array iterable '
  + 'string number boolean symbol bigint value values key keys index length size type types '
  + 'defined declared initialized initialization constructor class instance prototype constant variable '
  + 'assignment argument arguments parameter parameters '
  + 'invalid unexpected expected unknown unsupported missing required failed failure error errors '
  + 'token identifier end input json syntax position line column character char none '
  + 'typeerror rangeerror syntaxerror referenceerror evalerror urierror aborterror networkerror '
  + 'quotaexceedederror securityerror notfounderror domexception chunkloaderror invariant '
  + 'maximum minimum stack exceeded too much many more fewer recursion depth update updates '
  + 'hooks hook previous minified react see full message use non development environment '
  + 'warnings additional helpful component components children child parent node element document '
  + 'window boundary suspense module modules dynamically chunk script css stylesheet '
  + 'out range bounds valid precision digits integer finite negative positive zero division '
  + 'operation operator operand expression parenthesis bracket brace unit units dimension dimensions '
  + 'mismatch matrix vector '
  + 'permission permissions denied insufficient unavailable deadline timeout timed network request '
  + 'response offline internal aborted cancelled canceled already exists found such storage quota '
  + 'unauthenticated unimplemented precondition resource exhausted data loss circular structure '
  + 'firebase firestore auth functions client server transaction snapshot listener '
  + 'katex latex mathlive mathjs jsxgraph canvas svg context '
  + 'date time draft saved question tool state version '
  + 'resolution exception pin replay family generation generated recovery retry reload stale content'
).split(' ')));

const SIGNATURE_PUNCTUATION = new Set(['(', ')', ':', '_', '#']);
export const SIGNATURE_LIMIT = 96;

/**
 * An error message, rebuilt from SIGNATURE_VOCABULARY. Anything in quotes is
 * removed whole first: a quoted span is where a message repeats what it was
 * given. Idempotent: the server applies it again to whatever it is sent.
 */
export const crashSignature = (message) => {
  const unquoted = String(message ?? '').slice(0, 600).replace(/(["'`]).*?\1/g, ' _ ');
  const tokens = unquoted.match(/[A-Za-z]+|\d+|[^\sA-Za-z\d]/g) || [];
  const out = [];
  for (const token of tokens) {
    let next;
    if (/^[A-Za-z]/.test(token)) next = SIGNATURE_VOCABULARY.has(token.toLowerCase()) ? token.toLowerCase() : '_';
    else if (/^\d/.test(token)) next = '#';
    else if (SIGNATURE_PUNCTUATION.has(token)) next = token;
    else continue;
    // A run of removed words says no more than one.
    if ((next === '_' || next === '#') && out[out.length - 1] === next) continue;
    out.push(next);
  }
  const text = out.join(' ')
    .replace(/ ([):])/g, '$1')
    .replace(/\( /g, '(')
    .slice(0, SIGNATURE_LIMIT)
    .trim();
  return /[a-z]/.test(text) ? text : 'none';
};

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.:-]{0,47}$/;

/**
 * A code or content identifier (a family id, a module name), or the fallback.
 * Refuses what could be a person: an "@", whitespace, or a run of five or more
 * digits (a student number).
 */
export const safeIdentifier = (value, fallback = 'none') => {
  const text = String(value ?? '').trim();
  if (!IDENTIFIER.test(text) || /\d{5,}/.test(text)) return fallback;
  return text;
};

// A content id (an assignment's document id, an authored question id).
const CONTENT_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const contentId = (value) => {
  const text = String(value ?? '').trim();
  return CONTENT_ID.test(text) ? text : null;
};

/** A path as a route template: "/assignments/:id/:id/:id", "/teacher/admin/health". */
export const screenTemplate = (pathname) => {
  const path = String(pathname ?? '').split(/[?#]/)[0];
  const segments = path.split('/').filter(Boolean).slice(0, 6);
  return `/${segments.map((segment) => (SCREEN_WORDS.includes(segment) ? segment : ':id')).join('/')}`;
};

const safeBuild = (value) => {
  const text = String(value ?? '').trim().toLowerCase().slice(0, 12);
  return /^[0-9a-f]{7,12}$/.test(text) ? text : 'unknown';
};

// FNV-1a over the bucket's values, twice with different offsets: a stable
// 16-hex-digit name for a map key. Not a secret and not a security boundary.
const hash32 = (text, seed) => {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};
const BUCKET_FIELDS = ['build', 'kind', 'source', 'role', 'screen', 'family', 'questionType', 'signature', 'assignmentId', 'questionId'];
export const crashBucketId = (bucket) => {
  const text = BUCKET_FIELDS.map((field) => bucket[field] ?? '').join('\u0001');
  return `${hash32(text, 0x811c9dc5)}${hash32(text, 0x9747b28c)}`;
};

/**
 * The bucket a failure belongs to. Accepts what a caller knows (or what a
 * request claims) and returns only the closed shape above. `mode` decides
 * whether the question is named; `role` is the caller's, never the request's.
 */
export const normalizeCrashBucket = (raw = {}, { mode = 'family', role = 'student' } = {}) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const bucket = {
    build: safeBuild(source.build),
    kind: CRASH_KINDS.includes(source.kind) ? source.kind : 'other',
    source: safeIdentifier(source.source, 'other').slice(0, 24),
    role: role === 'teacher' ? 'teacher' : 'student',
    screen: screenTemplate(source.screen),
    family: safeIdentifier(source.family),
    questionType: safeIdentifier(source.questionType),
    signature: crashSignature(source.signature ?? source.message),
  };
  if (mode === 'question') {
    const assignmentId = contentId(source.assignmentId);
    const questionId = contentId(source.questionId);
    if (assignmentId) bucket.assignmentId = assignmentId;
    if (questionId) bucket.questionId = questionId;
  }
  return bucket;
};

/** The whole-number count a request may add to one bucket. */
export const clampCrashCount = (value) => {
  const count = Math.floor(Number(value));
  return Number.isFinite(count) && count >= 1 ? Math.min(count, CRASH_REPORT_LIMITS.countPerBucketPerCall) : 1;
};

export const utcDayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

/*
 * READING THE DAYS (the Platform health view).
 *
 * An ISSUE is one failure wherever it shows: kind + family + module +
 * signature (+ the question, in question mode), across builds and screens.
 * Three signals, each a plain statement about counts:
 *
 *   widespread  at least WIDESPREAD_REPORTERS accounts hit it today
 *   new         it appears today and on no earlier day that is still kept
 *   rising      today is at least 3x its average over the earlier kept days
 */
export const WIDESPREAD_REPORTERS = 5;
export const RISING_FACTOR = 3;
export const RISING_MINIMUM = 10;

const issueKeyOf = (bucket) => [bucket.kind, bucket.family, bucket.questionType, bucket.signature, bucket.assignmentId || '', bucket.questionId || ''].join('\u0001');

export const summarizePlatformHealth = ({ days = [], today = '' } = {}) => {
  const ordered = [...days].filter((day) => day && typeof day.day === 'string').sort((a, b) => a.day.localeCompare(b.day));
  const issues = new Map();
  for (const day of ordered) {
    for (const bucket of Object.values(day.buckets || {})) {
      if (!bucket || typeof bucket !== 'object') continue;
      const key = issueKeyOf(bucket);
      if (!issues.has(key)) {
        issues.set(key, {
          key, kind: bucket.kind, family: bucket.family, questionType: bucket.questionType, signature: bucket.signature,
          assignmentId: bucket.assignmentId || null, questionId: bucket.questionId || null,
          byDay: {}, builds: new Set(), screens: new Set(), roles: new Set(), total: 0,
        });
      }
      const issue = issues.get(key);
      const count = Number(bucket.count) || 0;
      const reporters = Number(bucket.reporters) || 0;
      const entry = issue.byDay[day.day] || { count: 0, reporters: 0 };
      entry.count += count;
      // One account can sit in two buckets of an issue (two screens), so the
      // largest bucket is what is known for certain: "at least this many".
      entry.reporters = Math.max(entry.reporters, reporters);
      issue.byDay[day.day] = entry;
      issue.total += count;
      issue.builds.add(bucket.build);
      issue.screens.add(bucket.screen);
      issue.roles.add(bucket.role);
    }
  }
  const earlierDays = ordered.map((day) => day.day).filter((day) => day < today);
  const rows = [...issues.values()].map((issue) => {
    const now = issue.byDay[today] || { count: 0, reporters: 0 };
    const earlierTotal = earlierDays.reduce((sum, day) => sum + (issue.byDay[day]?.count || 0), 0);
    const seenBefore = earlierDays.some((day) => issue.byDay[day]);
    const signals = [];
    if (now.count > 0) {
      if (now.reporters >= WIDESPREAD_REPORTERS) signals.push('widespread');
      if (!seenBefore) signals.push('new');
      else if (now.count >= RISING_MINIMUM && now.count >= RISING_FACTOR * (earlierTotal / earlierDays.length)) signals.push('rising');
    }
    return {
      ...issue,
      builds: [...issue.builds].sort(), screens: [...issue.screens].sort(), roles: [...issue.roles].sort(),
      today: now.count, reportersToday: now.reporters, signals,
    };
  });
  const weight = (row) => (row.signals.includes('widespread') ? 4 : 0) + (row.signals.includes('new') ? 2 : 0) + (row.signals.includes('rising') ? 1 : 0);
  rows.sort((a, b) => weight(b) - weight(a) || b.today - a.today || b.total - a.total || a.key.localeCompare(b.key));
  return {
    today,
    issues: rows,
    alerts: rows.filter((row) => row.signals.length),
    totals: ordered.map((day) => ({ day: day.day, total: Number(day.total) || 0, overflow: Number(day.overflow) || 0 })),
  };
};
