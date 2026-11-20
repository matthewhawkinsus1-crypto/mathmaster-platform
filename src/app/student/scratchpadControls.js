/*
 * A QUESTION'S SCRATCHPAD: WHERE ITS RECORD LIVES, LOADING IT, AND SAVING IT.
 *
 * Moved verbatim from App.jsx. These are plain functions: no state, no effects, no hooks. App builds them on every render, as it did when they were written inline, and passes what they read by position (tests/platform/appSplitAssignmentRuntime.test.mjs holds the two sides to the same names in the same order). App owns the state and the refs they read and fill.
 */
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { buildScratchpadWrites, normalizeScratchpadPages, scratchpadPageCount, scratchpadPageDocId } from '../../platform/student/scratchpadPages.js';
import { readCachedScratchpadPage, storeCachedScratchpad, touchCachedScratchpad } from '../../platform/student/practiceScratchpadCache.js';
import { normalizeQuestionRecord } from '../../attemptPolicy';
import { getAssignmentLifecycle } from '../../assignmentLifecycle';

export function createScratchpadControls(
  user, assignments, activeAssignmentId, tracker, practiceTracker, practiceScratchpads, setPracticeScratchpads,
  previewTracker, previewScratchpads, setPreviewScratchpads, currentQuestionIndex, isTeacherPreview,
  loadedScratchpadPageCounts,
) {
  const getScratchpadDocumentId = (assignmentId, questionIndex) =>
    `${assignmentId}__question_${questionIndex}`;

  // Every page after the first lives in its own document, because a page is a
  // 700KB flattened image and a Firestore document caps at 1MiB. Page one keeps
  // the id it has always had, so scratchpads already saved in production load
  // unchanged and the teacher review dialog keeps working against them.
  const loadScratchpadRecord = async (readPage, baseId) => {
    const first = await readPage(scratchpadPageDocId(baseId, 0));
    if (!first) {
      loadedScratchpadPageCounts.current[baseId] = 0;
      return null;
    }
    const count = scratchpadPageCount(first);
    loadedScratchpadPageCounts.current[baseId] = count;
    const later = [];
    for (let index = 1; index < count; index += 1) {
      // Sequential: a scratchpad holds at most four pages, and a partial read
      // is handled by normalizeScratchpadPages rather than by failing the open.
      later.push(await readPage(scratchpadPageDocId(baseId, index)));
    }
    return { ...first, pages: normalizeScratchpadPages(first, later) };
  };

  const handleLoadScratchpad = async () => {
    if (!activeAssignmentId) return null;
    const scratchpadId = getScratchpadDocumentId(
      activeAssignmentId,
      currentQuestionIndex,
    );
    const scratchpadAssignment = assignments.find(
      (assignment) => assignment.id === activeAssignmentId,
    );

    // Opening a kept scratchpad is a use of it: it moves to the back of the
    // eviction queue, so the work a student just looked at is not the next to go.
    if (isTeacherPreview) {
      setPreviewScratchpads((current) => touchCachedScratchpad(current, scratchpadId));
      return loadScratchpadRecord(async (id) => readCachedScratchpadPage(previewScratchpads, scratchpadId, id), scratchpadId);
    }

    if (getAssignmentLifecycle(scratchpadAssignment, Date.now(), {
      studentId: user?.role === 'student' ? user.id : undefined,
    }).isPracticeOnly) {
      setPracticeScratchpads((current) => touchCachedScratchpad(current, scratchpadId));
      return loadScratchpadRecord(async (id) => readCachedScratchpadPage(practiceScratchpads, scratchpadId, id), scratchpadId);
    }

    if (user?.role !== 'student') return null;
    try {
      return await loadScratchpadRecord(async (id) => {
        const snapshot = await getDoc(doc(db, 'grades', user.id, 'scratchpads', id));
        return snapshot.exists() ? snapshot.data() : null;
      }, scratchpadId);
    } catch (error) {
      console.error('Could not load the student scratchpad:', error);
      return null;
    }
  };

  const handleSaveScratchpad = async (pages, metadata = {}) => {
    const pageList = (Array.isArray(pages) ? pages : [pages]).filter(Boolean);
    const dataUrl = pageList[0] || '';
    if (!activeAssignmentId || !dataUrl) return;
    const scratchpadId = getScratchpadDocumentId(
      activeAssignmentId,
      currentQuestionIndex,
    );
    const scratchpadAssignment = assignments.find(
      (assignment) => assignment.id === activeAssignmentId,
    );
    const practiceOnly = getAssignmentLifecycle(scratchpadAssignment, Date.now(), {
      studentId: user?.role === 'student' ? user.id : undefined,
    }).isPracticeOnly;
    const currentScratchpadTracker = isTeacherPreview
      ? previewTracker
      : practiceOnly
        ? practiceTracker[activeAssignmentId] || {}
        : tracker[activeAssignmentId] || {};
    const compactRecord = {
      dataUrl,
      assignmentId: activeAssignmentId,
      questionIndex: currentQuestionIndex,
      variantIndex: normalizeQuestionRecord(
        currentScratchpadTracker?.[currentQuestionIndex],
      ).variantIndex,
      updatedAt: new Date().toISOString(),
      metadata: {
        width: Number(metadata.width) || 0,
        height: Number(metadata.height) || 0,
        mimeType: String(
          metadata.mimeType || dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/webp',
        ),
        byteLength:
          Number(metadata.byteLength ?? metadata.byteEstimate) || dataUrl.length,
      },
    };

    // A page the student removed has to be deleted, not merely left unwritten:
    // an orphaned document reappears as a page on the next load, which reads as
    // the platform resurrecting work they deliberately dropped.
    const previousPageCount = Math.max(
      Number(loadedScratchpadPageCounts.current[scratchpadId]) || 0,
      scratchpadPageCount(
        isTeacherPreview
          ? readCachedScratchpadPage(previewScratchpads, scratchpadId)
          : practiceOnly ? readCachedScratchpadPage(practiceScratchpads, scratchpadId) : null,
      ),
    );
    const { writes, deletes } = buildScratchpadWrites({
      baseId: scratchpadId,
      pages: pageList,
      metadata: { ...compactRecord, dataUrl: undefined },
      previousPageCount,
    });
    loadedScratchpadPageCounts.current[scratchpadId] = pageList.length;

    // In memory only, and within budget: the least recently used scratchpads
    // beyond it are dropped whole, never this one — it is the question on screen.
    if (isTeacherPreview) {
      setPreviewScratchpads((current) => storeCachedScratchpad(current, { baseId: scratchpadId, writes, deletes }));
      return;
    }

    if (practiceOnly) {
      setPracticeScratchpads((current) => storeCachedScratchpad(current, { baseId: scratchpadId, writes, deletes }));
      return;
    }

    if (user?.role !== 'student') return;
    try {
      await Promise.all(writes.map((entry) => setDoc(
        doc(db, 'grades', user.id, 'scratchpads', entry.docId),
        entry.data,
      )));
      // A page that will not delete is a stale extra page, not lost work, so it
      // must never fail the save the student is waiting on.
      await Promise.all(deletes.map((id) => deleteDoc(
        doc(db, 'grades', user.id, 'scratchpads', id),
      ).catch(() => {})));
    } catch (error) {
      console.error('Could not save the student scratchpad:', error);
      throw error;
    }
  };
  return [getScratchpadDocumentId, loadScratchpadRecord, handleLoadScratchpad, handleSaveScratchpad];
}
