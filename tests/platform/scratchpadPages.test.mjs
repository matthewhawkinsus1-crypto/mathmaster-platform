import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MAX_SCRATCHPAD_PAGES,
  buildScratchpadWrites,
  canAddScratchpadPage,
  normalizeScratchpadPages,
  scratchpadPageCount,
  scratchpadPageDocId,
} from '../../src/platform/student/scratchpadPages.js';

const codeOf = (path) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const png = (tag) => `data:image/webp;base64,${tag}`;

test('page one keeps the id every saved scratchpad already uses', () => {
  // There is student work in production under this id right now, and the
  // teacher review dialog reads it directly. Changing it would strand all of it.
  assert.equal(scratchpadPageDocId('asn1__question_3', 0), 'asn1__question_3');
  assert.equal(scratchpadPageDocId('asn1__question_3'), 'asn1__question_3');
  assert.equal(scratchpadPageDocId('asn1__question_3', 1), 'asn1__question_3__p2');
  assert.equal(scratchpadPageDocId('asn1__question_3', 3), 'asn1__question_3__p4');
  assert.equal(scratchpadPageDocId('', 2), null);
});

test('a scratchpad saved before pages existed still opens', () => {
  // The legacy record carries dataUrl and no pageCount. It is one page.
  const legacy = { dataUrl: png('old'), assignmentId: 'a1' };
  assert.equal(scratchpadPageCount(legacy), 1);
  assert.deepEqual(normalizeScratchpadPages(legacy), [png('old')]);
});

test('nothing saved yields one blank page rather than an empty book', () => {
  assert.deepEqual(normalizeScratchpadPages(null), ['']);
  assert.equal(scratchpadPageCount(null), 0);
});

test('a multi-page record comes back in order', () => {
  const first = { dataUrl: png('p1'), pageCount: 3 };
  const later = [{ dataUrl: png('p2') }, { dataUrl: png('p3') }];
  assert.deepEqual(normalizeScratchpadPages(first, later), [png('p1'), png('p2'), png('p3')]);
});

test('a page that fails to load becomes blank without renumbering the rest', () => {
  // Collapsing the gap would silently turn page three into page two, so a
  // student would find their last page holding work they wrote earlier.
  const first = { dataUrl: png('p1'), pageCount: 3 };
  const pages = normalizeScratchpadPages(first, [null, { dataUrl: png('p3') }]);
  assert.deepEqual(pages, [png('p1'), '', png('p3')]);
  assert.equal(pages.length, 3);
});

test('a corrupt or non-image value never renders as a page', () => {
  assert.deepEqual(normalizeScratchpadPages({ dataUrl: 'javascript:alert(1)' }), ['']);
  assert.deepEqual(normalizeScratchpadPages({ dataUrl: null }), ['']);
  assert.deepEqual(normalizeScratchpadPages({ dataUrl: png('a'), pageCount: 2 }, ['not-a-url']), [png('a'), '']);
});

test('the page count is capped, however large the stored number claims to be', () => {
  assert.equal(scratchpadPageCount({ pageCount: 900 }), MAX_SCRATCHPAD_PAGES);
  assert.equal(scratchpadPageCount({ pageCount: 'lots' }), 1);
  assert.equal(scratchpadPageCount({ pageCount: -3 }), 1);
  assert.equal(canAddScratchpadPage(Array(MAX_SCRATCHPAD_PAGES).fill(png('x'))), false);
  assert.equal(canAddScratchpadPage([png('x')]), true);
  assert.equal(canAddScratchpadPage([]), true);
});

test('only page one carries the count, because it is the only findable page', () => {
  const { writes } = buildScratchpadWrites({
    baseId: 'a1__question_0',
    pages: [png('p1'), png('p2'), png('p3')],
  });
  assert.deepEqual(writes.map((entry) => entry.docId), [
    'a1__question_0', 'a1__question_0__p2', 'a1__question_0__p3',
  ]);
  assert.equal(writes[0].data.pageCount, 3);
  assert.equal(writes[1].data.pageCount, undefined);
  assert.equal(writes[2].data.pageCount, undefined);
  assert.equal(writes[2].data.pageIndex, 2);
});

test('a page the student removed is deleted, not merely left unwritten', () => {
  // An orphaned document reappears as a page on the next load, which reads as
  // the platform resurrecting work the student deliberately dropped.
  const { writes, deletes } = buildScratchpadWrites({
    baseId: 'a1__question_0',
    pages: [png('p1')],
    previousPageCount: 3,
  });
  assert.equal(writes.length, 1);
  assert.deepEqual(deletes, ['a1__question_0__p2', 'a1__question_0__p3']);
});

test('growing the page count deletes nothing', () => {
  const { deletes } = buildScratchpadWrites({
    baseId: 'a1__question_0',
    pages: [png('p1'), png('p2')],
    previousPageCount: 1,
  });
  assert.deepEqual(deletes, []);
});

test('an empty save writes nothing rather than blanking saved work', () => {
  assert.deepEqual(buildScratchpadWrites({ baseId: 'a1', pages: [] }), { writes: [], deletes: [] });
  assert.deepEqual(buildScratchpadWrites({ baseId: 'a1', pages: ['', null] }), { writes: [], deletes: [] });
  assert.deepEqual(buildScratchpadWrites({ pages: [png('p1')] }), { writes: [], deletes: [] });
});

test('more pages than the cap are not written', () => {
  const { writes } = buildScratchpadWrites({
    baseId: 'a1',
    pages: Array(9).fill(png('x')),
  });
  assert.equal(writes.length, MAX_SCRATCHPAD_PAGES);
});

test('closing with unsaved work no longer throws it away', () => {
  // The Close button called onClose directly, and the overlay resets its
  // strokes on the next open, so a student who drew for five minutes and
  // pressed Close lost all of it with nothing said.
  const source = codeOf('src/ScratchpadOverlay.jsx');
  assert.match(source, /const requestClose = \(\)/);
  assert.match(source, /onClick=\{requestClose\}/);
  assert.doesNotMatch(source, /onClick=\{onClose\}/);
  assert.match(source, /role="alertdialog"/);
  // All three ways out are offered by name.
  assert.match(source, /Save and close/);
  assert.match(source, /Keep working/);
  assert.match(source, /Discard/);
});

test('drawing marks the page unsaved', () => {
  const source = codeOf('src/ScratchpadOverlay.jsx');
  const finish = source.slice(source.indexOf('const finishStroke'));
  assert.match(finish.slice(0, 600), /setDirty\(true\)/);
});

test('turning a page keeps the page being left', () => {
  // The entire point of the feature: more room without erasing the working
  // already done. A page turn that dropped live strokes would be worse than no
  // pages at all.
  const source = codeOf('src/ScratchpadOverlay.jsx');
  assert.match(source, /const captureCurrentPage = useCallback/);
  const goTo = source.slice(source.indexOf('const goToPage'), source.indexOf('const addPage'));
  assert.match(goTo, /captureCurrentPage\(\)/);
  const addPage = source.slice(source.indexOf('const addPage'), source.indexOf('const save = async'));
  assert.match(addPage, /captureCurrentPage\(\)/);
  assert.match(addPage, /canAddScratchpadPage/);
});

test('a student can save without being closed out of their work', () => {
  const source = codeOf('src/ScratchpadOverlay.jsx');
  assert.match(source, /save\(\{ close: false \}\)/);
  assert.match(source, /save\(\{ close: true \}\)/);
});

test('every scratchpad control clears the Chromebook touch minimum', () => {
  const source = codeOf('src/ScratchpadOverlay.jsx');
  for (const label of ['Previous page', 'Next page']) {
    const index = source.indexOf(`aria-label="${label}"`);
    assert.ok(index > 0, label);
    assert.match(source.slice(index, index + 260), /minHeight: 44/);
  }
});

test('the teacher sees every page, not the first third of an answer', () => {
  const source = codeOf('src/App.jsx');
  const opener = source.slice(source.indexOf('const openTeacherScratchpad'));
  assert.match(opener.slice(0, 1200), /loadScratchpadRecord/);
  assert.match(source, /teacherScratchpadDialog\.pages/);
  assert.match(source, /Page \{index \+ 1\} of \{all\.length\}/);
});

test('a page that will not delete never fails the save', () => {
  // A stale extra page is a nuisance; a save that reports failure after the
  // work is already written tells a student to redo work that is safe.
  const source = codeOf('src/App.jsx');
  const saver = source.slice(source.indexOf('const handleSaveScratchpad'));
  const deletes = saver.slice(saver.indexOf('deletes.map'));
  assert.match(deletes.slice(0, 260), /catch\(\(\) => \{\}\)/);
});
