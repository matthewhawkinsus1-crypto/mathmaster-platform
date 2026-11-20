/*
 * PRACTICE AND PREVIEW SCRATCHPADS, KEPT IN MEMORY WITHIN A BUDGET
 * (deep dive 2026-10-01, §10.5).
 *
 * The store is pure, so its behaviour is tested directly: the budget, the
 * least-recently-used order, the open question's exemption, and that a
 * scratchpad's pages live and die together. The App wiring is a source
 * contract, because node cannot import App.jsx.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { appFactorySeam, appFactorySource, appSurfaceSource, positionalHookSeam, positionalHookSource } from './helpers/appScreens.mjs';
import {
  EMPTY_SCRATCHPAD_CACHE,
  SCRATCHPAD_CACHE_BUDGET_BYTES,
  cachedScratchpadBytes,
  cachedScratchpadIds,
  readCachedScratchpadPage,
  scratchpadPageBytes,
  storeCachedScratchpad,
  touchCachedScratchpad,
} from '../../src/platform/student/practiceScratchpadCache.js';
import {
  MAX_SCRATCHPAD_PAGES,
  buildScratchpadWrites,
  normalizeScratchpadPages,
  scratchpadPageCount,
  scratchpadPageDocId,
} from '../../src/platform/student/scratchpadPages.js';

const PREFIX = 'data:image/webp;base64,';
/** A page image whose data URL is exactly `length` characters. */
const page = (length, tag = 'x') => `${PREFIX}${tag}${'A'.repeat(length - PREFIX.length - tag.length)}`;
const baseId = (question, assignment = 'asn1') => `${assignment}__question_${question}`;

/** What App stores after a save: buildScratchpadWrites' output, routed through the cache. */
const save = (cache, id, pages, options = {}) => {
  const { writes, deletes } = buildScratchpadWrites({
    baseId: id,
    pages,
    metadata: { assignmentId: 'asn1', updatedAt: '2026-10-01T12:00:00.000Z' },
    previousPageCount: scratchpadPageCount(readCachedScratchpadPage(cache, id)),
  });
  return storeCachedScratchpad(cache, { baseId: id, writes, deletes, ...options });
};

/** What App's loader gets back for a question: every page, in order, or null. */
const reopen = (cache, id) => {
  const first = readCachedScratchpadPage(cache, id);
  if (!first) return null;
  const later = [];
  for (let index = 1; index < scratchpadPageCount(first); index += 1) {
    later.push(readCachedScratchpadPage(cache, id, scratchpadPageDocId(id, index)));
  }
  return normalizeScratchpadPages(first, later);
};

/* ----------------------------------------------------------- the budget */

test('the budget holds the open question at its worst case and still leaves room for six full pages', () => {
  // A page is refused above 1.25 × 700,000 characters; a scratchpad has at most four.
  const worstOpenScratchpad = MAX_SCRATCHPAD_PAGES * 875_000;
  assert.ok(SCRATCHPAD_CACHE_BUDGET_BYTES >= worstOpenScratchpad + 6 * 700_000);
  assert.ok(SCRATCHPAD_CACHE_BUDGET_BYTES <= 8 * 1024 * 1024, 'a day of practice stays a few megabytes');
});

test('a page costs the length of its data URL, and only its data URL', () => {
  assert.equal(scratchpadPageBytes({ dataUrl: page(1000), assignmentId: 'asn1', metadata: { width: 1200 } }), 1000);
  assert.equal(scratchpadPageBytes({ assignmentId: 'asn1' }), 0);
  assert.equal(scratchpadPageBytes(null), 0);
});

test('a day of practice at the page cap stays within the budget instead of growing with every question', () => {
  let cache = EMPTY_SCRATCHPAD_CACHE;
  for (let question = 0; question < 40; question += 1) {
    cache = save(cache, baseId(question), [page(700_000, `q${question}`)]);
    assert.ok(cachedScratchpadBytes(cache) <= SCRATCHPAD_CACHE_BUDGET_BYTES, `over budget after question ${question}`);
  }
  const kept = cachedScratchpadIds(cache);
  assert.equal(kept.length, Math.floor(SCRATCHPAD_CACHE_BUDGET_BYTES / 700_000));
  assert.deepEqual(kept, Array.from({ length: kept.length }, (_, index) => baseId(40 - kept.length + index)), 'the most recent questions are the ones kept');
  assert.equal(cachedScratchpadBytes(cache), kept.length * 700_000);
});

test('eviction stops as soon as the store is within budget', () => {
  let cache = EMPTY_SCRATCHPAD_CACHE;
  for (const question of [1, 2, 3]) cache = save(cache, baseId(question), [page(300)], { budgetBytes: 1000 });
  cache = save(cache, baseId(4), [page(300)], { budgetBytes: 1000 });
  assert.deepEqual(cachedScratchpadIds(cache), [baseId(2), baseId(3), baseId(4)]);
  assert.equal(cachedScratchpadBytes(cache), 900);
});

/* ----------------------------------------------------- least recently used */

test('in-progress work survives moving between questions and back', () => {
  // Realistic pages are a fraction of the cap; a whole practice assignment fits.
  let cache = EMPTY_SCRATCHPAD_CACHE;
  for (let question = 0; question < 15; question += 1) {
    cache = save(cache, baseId(question), [page(180_000, `q${question}p1`), page(120_000, `q${question}p2`)]);
  }
  cache = touchCachedScratchpad(cache, baseId(0));
  assert.deepEqual(reopen(cache, baseId(0)), [page(180_000, 'q0p1'), page(120_000, 'q0p2')]);
  assert.deepEqual(reopen(cache, baseId(7)), [page(180_000, 'q7p1'), page(120_000, 'q7p2')]);
  assert.equal(cachedScratchpadIds(cache).length, 15, 'nothing is dropped for leaving a question');
});

test('opening a scratchpad counts as using it: the least recently USED goes first, not the oldest', () => {
  let cache = EMPTY_SCRATCHPAD_CACHE;
  for (const question of [1, 2, 3]) cache = save(cache, baseId(question), [page(300)], { budgetBytes: 1000 });
  cache = touchCachedScratchpad(cache, baseId(1)); // the student went back to question 1
  cache = save(cache, baseId(4), [page(300)], { budgetBytes: 1000 });
  assert.equal(reopen(cache, baseId(2)), null, 'question 2 was the least recently used');
  assert.deepEqual(reopen(cache, baseId(1)), [page(300)]);
  assert.deepEqual(cachedScratchpadIds(cache), [baseId(3), baseId(1), baseId(4)]);
});

test('saving a scratchpad again makes it the most recently used', () => {
  let cache = EMPTY_SCRATCHPAD_CACHE;
  for (const question of [1, 2, 3]) cache = save(cache, baseId(question), [page(300, `v1-${question}`)], { budgetBytes: 1000 });
  cache = save(cache, baseId(1), [page(300, 'v2-1')], { budgetBytes: 1000 });
  cache = save(cache, baseId(4), [page(300)], { budgetBytes: 1000 });
  assert.deepEqual(cachedScratchpadIds(cache), [baseId(3), baseId(1), baseId(4)]);
  assert.deepEqual(reopen(cache, baseId(1)), [page(300, 'v2-1')], 'the newer save replaced the older one');
});

test('touch returns the same store when nothing moves, so React can skip the update', () => {
  let cache = EMPTY_SCRATCHPAD_CACHE;
  cache = save(cache, baseId(1), [page(300)]);
  cache = save(cache, baseId(2), [page(300)]);
  assert.equal(touchCachedScratchpad(cache, baseId(2)), cache, 'already the most recent');
  assert.equal(touchCachedScratchpad(cache, baseId(9)), cache, 'nothing stored for that question');
  assert.equal(touchCachedScratchpad(cache, ''), cache);
  const moved = touchCachedScratchpad(cache, baseId(1));
  assert.notEqual(moved, cache);
  assert.deepEqual(cachedScratchpadIds(moved), [baseId(2), baseId(1)]);
  assert.deepEqual(cachedScratchpadIds(cache), [baseId(1), baseId(2)], 'the original store is untouched');
});

/* ------------------------------------------- the question currently open */

test('the open question\'s scratchpad is never evicted, even when it alone is over budget', () => {
  let cache = EMPTY_SCRATCHPAD_CACHE;
  cache = save(cache, baseId(1), [page(300)], { budgetBytes: 1000 });
  cache = save(cache, baseId(2), [page(300)], { budgetBytes: 1000 });
  // Four big pages on the question on screen.
  const big = [page(400, 'a'), page(400, 'b'), page(400, 'c'), page(400, 'd')];
  cache = save(cache, baseId(3), big, { budgetBytes: 1000 });
  assert.deepEqual(reopen(cache, baseId(3)), big, 'the student is looking at it');
  assert.deepEqual(cachedScratchpadIds(cache), [baseId(3)], 'everything else went first');
  // Once the student moves on, it is an ordinary least-recently-used entry again.
  cache = save(cache, baseId(4), [page(300)], { budgetBytes: 1000 });
  assert.deepEqual(cachedScratchpadIds(cache), [baseId(4)]);
});

test('the open question is exempt even when it is also the least recently used', () => {
  // Nothing else is ever saved while a question is open, but the exemption is
  // a property of the store, not of call order: storing never evicts what it stores.
  let cache = EMPTY_SCRATCHPAD_CACHE;
  cache = save(cache, baseId(1), [page(600)], { budgetBytes: 1000 });
  cache = save(cache, baseId(2), [page(300)], { budgetBytes: 1000 });
  cache = save(cache, baseId(1), [page(700, 'more')], { budgetBytes: 1000 });
  assert.deepEqual(reopen(cache, baseId(1)), [page(700, 'more')]);
  assert.deepEqual(cachedScratchpadIds(cache), [baseId(2), baseId(1)]);
});

/* ------------------------------------------------- pages travel together */

test('a multi-page scratchpad is stored, counted and evicted as one piece of work', () => {
  let cache = EMPTY_SCRATCHPAD_CACHE;
  const three = [page(200, 'p1'), page(200, 'p2'), page(200, 'p3')];
  cache = save(cache, baseId(1), three, { budgetBytes: 1000 });
  assert.equal(cachedScratchpadBytes(cache), 600, 'every page counts toward the budget');
  assert.deepEqual(reopen(cache, baseId(1)), three);
  cache = save(cache, baseId(2), [page(500)], { budgetBytes: 1000 });
  // Evicted whole: no page of question 1 is left behind to come back half-empty.
  for (let index = 0; index < 3; index += 1) {
    assert.equal(readCachedScratchpadPage(cache, baseId(1), scratchpadPageDocId(baseId(1), index)), null);
  }
  assert.equal(reopen(cache, baseId(1)), null);
  assert.deepEqual(cachedScratchpadIds(cache), [baseId(2)]);
  assert.equal(cachedScratchpadBytes(cache), 500);
});

test('a page the student removed is gone from the store, and stops counting', () => {
  let cache = EMPTY_SCRATCHPAD_CACHE;
  cache = save(cache, baseId(1), [page(200, 'p1'), page(200, 'p2'), page(200, 'p3')]);
  cache = save(cache, baseId(1), [page(200, 'p1')]);
  assert.deepEqual(reopen(cache, baseId(1)), [page(200, 'p1')]);
  assert.equal(readCachedScratchpadPage(cache, baseId(1), scratchpadPageDocId(baseId(1), 2)), null);
  assert.equal(cachedScratchpadBytes(cache), 200);
});

test('one scratchpad can never hold, or evict, another scratchpad\'s page', () => {
  let cache = EMPTY_SCRATCHPAD_CACHE;
  cache = save(cache, baseId(1), [page(300, 'mine')]);
  cache = storeCachedScratchpad(cache, {
    baseId: baseId(2),
    writes: [
      { docId: baseId(2), data: { dataUrl: page(300, 'two') } },
      { docId: baseId(1), data: { dataUrl: page(300, 'stray') } },
      { docId: `${baseId(2)}__p9`, data: { dataUrl: page(300, 'beyond the page cap') } },
    ],
    deletes: [baseId(1)],
  });
  assert.deepEqual(reopen(cache, baseId(1)), [page(300, 'mine')]);
  assert.equal(readCachedScratchpadPage(cache, baseId(2), `${baseId(2)}__p9`), null);
  assert.equal(cachedScratchpadBytes(cache), 600);
});

test('the store is never edited in place, and the empty store cannot be', () => {
  assert.ok(Object.isFrozen(EMPTY_SCRATCHPAD_CACHE) && Object.isFrozen(EMPTY_SCRATCHPAD_CACHE.groups) && Object.isFrozen(EMPTY_SCRATCHPAD_CACHE.order));
  const one = save(EMPTY_SCRATCHPAD_CACHE, baseId(1), [page(300)], { budgetBytes: 500 });
  const snapshot = JSON.stringify(one);
  const two = save(one, baseId(2), [page(300)], { budgetBytes: 500 });
  assert.equal(JSON.stringify(one), snapshot, 'storing returns a new store');
  assert.deepEqual(cachedScratchpadIds(two), [baseId(2)]);
  assert.equal(storeCachedScratchpad(one, { baseId: '', writes: [] }), one, 'no scratchpad id, no change');
  assert.equal(readCachedScratchpadPage(undefined, baseId(1)), null, 'an absent store reads as empty');
});

/* ------------------------------------------------------- the App wiring */

const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const app = executableSource(appSource);
// Since the App split, useLiveTeachingPreviewSync owns the effect that
// releases the preview's scratchpads.
const previewSync = executableSource(positionalHookSource('useLiveTeachingPreviewSync'));
// Since the App split (slice 6) createScratchpadControls owns opening and
// saving a scratchpad, and createStudentOutbox owns leaving an unavailable
// assignment. App calls each once, by position (appFactorySource holds App's
// arguments to the factory's parameters, name for name).
const scratchpadControls = executableSource(appFactorySource('createScratchpadControls'));
const studentOutbox = executableSource(appFactorySource('createStudentOutbox'));

test('App imports the store it calls (a missing import is a ReferenceError nothing else catches)', () => {
  assert.match(
    previewSync,
    /import \{[^}]*\bEMPTY_SCRATCHPAD_CACHE\b[^}]*\} from '\.\.\/\.\.\/platform\/student\/practiceScratchpadCache\.js';/,
    'EMPTY_SCRATCHPAD_CACHE is used in useLiveTeachingPreviewSync and must be imported there',
  );
  const imported = app.match(/import \{([^}]*)\} from '\.\/platform\/student\/practiceScratchpadCache\.js';/);
  assert.ok(imported, 'App.jsx imports practiceScratchpadCache.js');
  for (const name of ['EMPTY_SCRATCHPAD_CACHE']) {
    assert.match(imported[1], new RegExp(`\\b${name}\\b`), `${name} is called in App.jsx and must be imported`);
  }
  // Since the App split each import sits with the code that calls it: the
  // store's read, save and touch in createScratchpadControls, the empty store
  // in createStudentOutbox (leaving an unavailable assignment).
  const controlsImported = scratchpadControls.match(/import \{([^}]*)\} from '\.\.\/\.\.\/platform\/student\/practiceScratchpadCache\.js';/);
  assert.ok(controlsImported, 'createScratchpadControls imports practiceScratchpadCache.js');
  for (const name of ['readCachedScratchpadPage', 'storeCachedScratchpad', 'touchCachedScratchpad']) {
    assert.match(scratchpadControls.replace(/^import .*$/gm, ''), new RegExp(`\\b${name}\\(`), `${name} is called in createScratchpadControls`);
    assert.match(controlsImported[1], new RegExp(`\\b${name}\\b`), `${name} is called in createScratchpadControls and must be imported there`);
  }
  assert.match(
    studentOutbox,
    /import \{[^}]*\bEMPTY_SCRATCHPAD_CACHE\b[^}]*\} from '\.\.\/\.\.\/platform\/student\/practiceScratchpadCache\.js';/,
    'EMPTY_SCRATCHPAD_CACHE is used in createStudentOutbox and must be imported there',
  );
});

test('both in-memory scratchpad maps are budgeted stores, read and written only through the store', () => {
  assert.match(app, /const \[practiceScratchpads, setPracticeScratchpads\] = useState\(EMPTY_SCRATCHPAD_CACHE\);/);
  assert.match(app, /const \[previewScratchpads, setPreviewScratchpads\] = useState\(EMPTY_SCRATCHPAD_CACHE\);/);

  // Every read of either map is a store read: no indexing, spreading or
  // iterating that would skip it (and break on the store's shape).
  // Since the App split the reads are createScratchpadControls's: App declares
  // each store and hands it to that factory by position, and nothing else.
  // Uses are looked for across App and every module its code moved into, and
  // the only use that is not a declaration or a store read is that hand-over
  // (App's arguments to the one call, the factory's own parameter list).
  const surface = executableSource(appSurfaceSource());
  const within = (startNeedle, endNeedle, label) => {
    const start = surface.indexOf(startNeedle);
    assert.notEqual(start, -1, `could not find ${label}`);
    assert.equal(surface.indexOf(startNeedle, start + 1), -1, `${label} appears once`);
    const end = surface.indexOf(endNeedle, start);
    assert.notEqual(end, -1, `could not find the end of ${label}`);
    return [start, end];
  };
  const handOvers = [
    within('] = createScratchpadControls(', ');', 'App\'s call of createScratchpadControls'),
    within('export function createScratchpadControls(', ') {', 'createScratchpadControls\'s parameters'),
  ];
  const handedOver = (index) => handOvers.some(([start, end]) => index > start && index < end);
  const reads = [...surface.matchAll(/\b(practiceScratchpads|previewScratchpads)\b/g)];
  for (const store of ['practiceScratchpads', 'previewScratchpads']) {
    assert.ok(reads.filter((match) => match[1] === store && !handedOver(match.index)).length >= 3, `${store} is declared and read`);
    assert.equal(reads.filter((match) => match[1] === store && handedOver(match.index)).length, 2, `${store} is handed to createScratchpadControls once, and declared there once`);
  }
  for (const match of reads) {
    const before = surface.slice(Math.max(0, match.index - 40), match.index);
    const declared = before.endsWith('const [');
    const storeRead = before.endsWith('readCachedScratchpadPage(');
    assert.ok(declared || storeRead || handedOver(match.index), `${match[1]} is used outside the store: …${before}${surface.slice(match.index, match.index + 40)}…`);
  }

  // Every write replaces the store with one the store built: the empty store,
  // a touch, or a budgeted save. A hand-built map would bypass the budget.
  // (Since the App split one of those writes, the release on leaving the
  // preview, is useLiveTeachingPreviewSync's: its writes are held the same.)
  // (Since slice 6 the touch and the budgeted save are
  // createScratchpadControls's and one release is createStudentOutbox's: every
  // write in App and in every module its code moved into is held the same.)
  const written = surface;
  const writes = [...written.matchAll(/\bset(Practice|Preview)Scratchpads\(/g)];
  assert.ok(previewSync.match(/\bsetPreviewScratchpads\(/), 'the hook\'s write is among those checked');
  for (const [owner, source, setter] of [
    ['useLiveTeachingPreviewSync', previewSync, 'setPreviewScratchpads'],
    ['createScratchpadControls', scratchpadControls, 'setPreviewScratchpads'],
    ['createScratchpadControls', scratchpadControls, 'setPracticeScratchpads'],
    ['createStudentOutbox', studentOutbox, 'setPracticeScratchpads'],
  ]) {
    const write = source.match(new RegExp(`\\b${setter}\\([^\\n]*`));
    assert.ok(write && written.includes(write[0]), `${owner}'s ${setter} write is among those checked`);
  }
  assert.ok(writes.length >= 9, 'the writes in App and in its modules are all counted');
  for (const match of writes) {
    const argument = written.slice(match.index + match[0].length, match.index + match[0].length + 80);
    assert.match(
      argument,
      /^(?:EMPTY_SCRATCHPAD_CACHE\)|\(current\) => (?:storeCachedScratchpad|touchCachedScratchpad)\(current, )/,
      `set${match[1]}Scratchpads(${argument.slice(0, 50)}…) does not go through the store`,
    );
  }
});

test('opening a scratchpad reads the right store and marks it used', () => {
  // Since the App split handleLoadScratchpad is createScratchpadControls's,
  // which App hands both stores and their setters.
  for (const input of ['previewScratchpads', 'setPreviewScratchpads', 'practiceScratchpads', 'setPracticeScratchpads', 'isTeacherPreview']) {
    assert.ok(appFactorySeam('createScratchpadControls').parameters.includes(input), `App hands createScratchpadControls ${input}`);
  }
  const load = region(scratchpadControls, 'const handleLoadScratchpad = async () => {', 'const handleSaveScratchpad', 'handleLoadScratchpad');
  const preview = region(load, 'if (isTeacherPreview) {', '}', 'preview load');
  assert.match(preview, /setPreviewScratchpads\(\(current\) => touchCachedScratchpad\(current, scratchpadId\)\);/);
  assert.match(preview, /return loadScratchpadRecord\(async \(id\) => readCachedScratchpadPage\(previewScratchpads, scratchpadId, id\), scratchpadId\);/);
  const practice = region(load, '.isPracticeOnly) {', '}', 'practice load');
  assert.match(practice, /setPracticeScratchpads\(\(current\) => touchCachedScratchpad\(current, scratchpadId\)\);/);
  assert.match(practice, /return loadScratchpadRecord\(async \(id\) => readCachedScratchpadPage\(practiceScratchpads, scratchpadId, id\), scratchpadId\);/);
});

test('saving stores the open question\'s scratchpad through the budget, in the right store', () => {
  // Since the App split handleSaveScratchpad is createScratchpadControls's:
  // it is the last function before the factory returns. App hands the factory
  // the open question and both stores, and still calls it above
  // createTeacherScratchpadControls, which holds openTeacherScratchpad.
  for (const input of ['activeAssignmentId', 'currentQuestionIndex', 'previewScratchpads', 'setPreviewScratchpads', 'practiceScratchpads', 'setPracticeScratchpads', 'isTeacherPreview']) {
    assert.ok(appFactorySeam('createScratchpadControls').parameters.includes(input), `App hands createScratchpadControls ${input}`);
  }
  const controlsAt = app.indexOf('] = createScratchpadControls(');
  const teacherControlsAt = app.indexOf('const [openTeacherScratchpad]');
  assert.ok(controlsAt !== -1 && teacherControlsAt !== -1 && controlsAt < teacherControlsAt, 'the save is built above the teacher\'s scratchpad controls');
  const saveHandler = region(scratchpadControls, 'const handleSaveScratchpad = async', '\n  return [getScratchpadDocumentId, loadScratchpadRecord, handleLoadScratchpad, handleSaveScratchpad];', 'handleSaveScratchpad');
  // The id saved is the question on screen — the one the store exempts.
  assert.match(saveHandler, /const scratchpadId = getScratchpadDocumentId\(\s*activeAssignmentId,\s*currentQuestionIndex,\s*\);/);
  const preview = region(saveHandler, 'if (isTeacherPreview) {\n      setPreviewScratchpads', 'return;', 'preview save');
  assert.match(preview, /setPreviewScratchpads\(\(current\) => storeCachedScratchpad\(current, \{ baseId: scratchpadId, writes, deletes \}\)\);/);
  const practice = region(saveHandler, 'if (practiceOnly) {\n      setPracticeScratchpads', 'return;', 'practice save');
  assert.match(practice, /setPracticeScratchpads\(\(current\) => storeCachedScratchpad\(current, \{ baseId: scratchpadId, writes, deletes \}\)\);/);
  // The page count a save compares against comes from the same store.
  const previous = region(saveHandler, 'const previousPageCount = Math.max(', ');\n    const { writes, deletes }', 'previous page count');
  assert.match(previous, /readCachedScratchpadPage\(previewScratchpads, scratchpadId\)/);
  assert.match(previous, /readCachedScratchpadPage\(practiceScratchpads, scratchpadId\)/);
});

test('leaving "View as Student" releases its scratchpads, unless Live Teaching can resume into them', () => {
  // Since the App split, useLiveTeachingPreviewSync owns the release; App
  // calls it once with the flag, the session and the store's setter
  // (positionalHookSource holds App's arguments to the hook's parameters).
  for (const input of ['isTeacherPreview', 'liveTeachingSession', 'setPreviewScratchpads']) {
    assert.ok(positionalHookSeam('useLiveTeachingPreviewSync').parameters.includes(input), `App hands useLiveTeachingPreviewSync ${input}`);
  }
  const release = region(previewSync, 'const previewScratchpadsReachable =', '}, [previewScratchpadsReachable]);', 'preview scratchpad release');
  assert.match(release, /^const previewScratchpadsReachable = isTeacherPreview \|\| Boolean\(liveTeachingSession\?\.active\);/);
  assert.match(release, /useEffect\(\(\) => \{\s*if \(!previewScratchpadsReachable\) setPreviewScratchpads\(EMPTY_SCRATCHPAD_CACHE\);\s*$/);
  // The flag it reads is the same one that gates every preview write.
  assert.match(app, /const isTeacherPreview = user\?\.role === 'teacher' && activeView === 'teacherPreview';/);
  // Resume still finds the exemplar's pages: it neither resets them itself...
  // (since the App split, createTeacherPreviewNavigation owns resumeLiveTeaching;
  // App builds it once, and it is the last function before the factory returns).
  const resume = region(
    executableSource(appFactorySource('createTeacherPreviewNavigation')),
    'const resumeLiveTeaching = ', '\n  return [startTeacherPreview, teachAssignmentLive, resumeLiveTeaching];', 'resumeLiveTeaching',
  );
  assert.match(resume, /setActiveView\('teacherPreview'\);/, 'the region is the function that re-enters the preview');
  assert.doesNotMatch(resume, /setPreviewScratchpads/);
});

test('signing out, and leaving an unavailable assignment, empty the stores', () => {
  const logout = region(app, 'const handleLogout = async () => {', 'setGradebookFilter(', 'handleLogout');
  assert.match(logout, /setPracticeScratchpads\(EMPTY_SCRATCHPAD_CACHE\);/);
  assert.match(logout, /setPreviewScratchpads\(EMPTY_SCRATCHPAD_CACHE\);/);
  // Since the App split leaveUnavailableAssignment is createStudentOutbox's,
  // which App hands the practice store's setter.
  assert.ok(appFactorySeam('createStudentOutbox').parameters.includes('setPracticeScratchpads'), 'App hands createStudentOutbox setPracticeScratchpads');
  const leave = region(studentOutbox, 'const leaveUnavailableAssignment = () => {', '};', 'leaveUnavailableAssignment');
  assert.match(leave, /setPracticeScratchpads\(EMPTY_SCRATCHPAD_CACHE\);/);
});
