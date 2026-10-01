import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { db, functions } from '../../../firebase.js';
import { courseLabel } from '../../../../functions/shared/classModel.mjs';
import { normalizeGradingPeriodSettings } from '../../../platform/student/gradingPeriods.js';
import { selectReportAssignments } from '../../../platform/supportEvidence/supportEvidenceReport.js';
import { buildStudentCaseReview } from '../../../platform/caseReview/studentCaseReview.js';
import { loadStudentCaseRecords, saveSisSnapshot } from '../../../platform/caseReview/caseReviewStore.js';
import {
  caseAssignmentsCsv, caseFactsCsv, caseQuestionsCsv, caseReviewFileName, caseReviewJson, TEACHER_AUTHORED_LABEL,
} from '../../../platform/caseReview/caseReviewExport.js';
import CaseSummaryTab from './CaseSummaryTab.jsx';
import CaseGradesTab from './CaseGradesTab.jsx';
import CaseQuestionsTab from './CaseQuestionsTab.jsx';
import CaseSkillsTab from './CaseSkillsTab.jsx';
import CaseDolTab from './CaseDolTab.jsx';
import CaseCompletionTab from './CaseCompletionTab.jsx';
import CaseSupportTab from './CaseSupportTab.jsx';
import CaseTimelineTab from './CaseTimelineTab.jsx';
import CaseGradebookTab from './CaseGradebookTab.jsx';
import CaseNarrativeTab from './CaseNarrativeTab.jsx';
import CaseAttentionTab from './CaseAttentionTab.jsx';
import CasePrintView from './CasePrintView.jsx';
import { day, when } from './CaseReviewParts.jsx';
import { acceptStudentName, formatStudentName } from '../../../platform/studentName.js';
import '../teacherWorkspace.css';
import '../supportEvidence.css';
import './caseReview.css';

/*
 * STUDENT CASE REVIEW / ACADEMIC EVIDENCE DEEP DIVE — one student, one class,
 * one marking period or date range (optionally a chosen set of assignments).
 *
 * Opened from the student drawer and lazily loaded: nothing here — code or
 * data — is fetched until the teacher opens it and presses "Build case
 * review". The records come through the same rules-guarded readers as the
 * Student Support Evidence Report plus the read-only `loadStudentCaseEvidence`
 * callable (caseReviewStore.js); the case file itself is a pure function of
 * them (studentCaseReview.js). This component only renders it.
 *
 * Navigation keeps the teacher's place: every tab stays mounted once visited
 * (its page, filters and scroll position survive), the questions tab drills
 * Assignment → Question, and Back walks the trail in reverse before it
 * returns to the student.
 */

const TABS = [
  { key: 'summary', label: 'Summary' },
  { key: 'grades', label: 'Grades' },
  { key: 'questions', label: 'Questions & attempts' },
  { key: 'skills', label: 'Skills' },
  { key: 'dol', label: 'DOL vs instruction' },
  { key: 'completion', label: 'Completion' },
  { key: 'supports', label: 'Supports' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'gradebook', label: 'Official gradebook' },
  { key: 'facts', label: 'Narrative facts' },
  { key: 'attention', label: 'What needs attention?' },
  { key: 'print', label: 'Print & export' },
];
const TAB_LABEL = Object.fromEntries(TABS.map((tab) => [tab.key, tab.label]));
const EMPTY_SELECTION = { gradingPeriodId: '', fromDateKey: '', toDateKey: '', assignmentIds: [] };

const download = (text, fileName, type) => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const sameLocation = (a, b) => a.tab === b.tab && a.drill.assignmentId === b.drill.assignmentId && a.drill.storageIndex === b.drill.storageIndex;

export default function StudentCaseReviewView({
  open = false,
  student = null,
  studentName = '',
  classRecord = null,
  assignments = [],
  gradingPeriodSettings = null,
  teacherEmail = '',
  onClose,
  onInspectResponse = null,
  onOpenSupportReport = null,
}) {
  const settings = useMemo(() => normalizeGradingPeriodSettings(gradingPeriodSettings || {}), [gradingPeriodSettings]);
  // The name passed in when it is really a name, else the student record's own
  // resolved name, else "Name unavailable" — the id is shown beside it as
  // "ID x", never in its place.
  const resolvedStudentName = useMemo(
    () => acceptStudentName(studentName, student || {}) || formatStudentName(student || {}, { lastFirst: false }),
    [studentName, student],
  );
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const [load, setLoad] = useState({ loading: false, error: '', records: null });
  const [location, setLocation] = useState({ tab: 'summary', drill: {} });
  const [trail, setTrail] = useState([]);
  // The last place the teacher was in Questions & attempts, so the tab
  // reopens there rather than at its overview.
  const [questionsDrill, setQuestionsDrill] = useState({});
  const [visited, setVisited] = useState(() => new Set(['summary']));
  const [sis, setSis] = useState({ snapshot: null, confirmedMatches: {} });
  const [savedSnapshots, setSavedSnapshots] = useState([]);
  const [saving, setSaving] = useState({ busy: false, error: '' });
  const [nextSteps, setNextSteps] = useState('');
  const [printing, setPrinting] = useState(false);
  // The selection folds away once a case review is built, so the evidence
  // gets the height on a 768-pixel screen; "Change selection" brings it back.
  const [selectionOpen, setSelectionOpen] = useState(true);
  const [notice, setNotice] = useState('');
  const shellRef = useRef(null);
  const bodyRef = useRef(null);
  const closeRef = useRef(null);
  const scrollByTab = useRef({});
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // A new student (or reopening) starts a fresh case review.
  useEffect(() => {
    if (!open) return;
    setSelection({ ...EMPTY_SELECTION, gradingPeriodId: settings.currentPeriodId || 'all' });
    setLoad({ loading: false, error: '', records: null });
    setLocation({ tab: 'summary', drill: {} });
    setTrail([]);
    setQuestionsDrill({});
    setVisited(new Set(['summary']));
    setSis({ snapshot: null, confirmedMatches: {} });
    setSavedSnapshots([]);
    setNextSteps('');
    setSelectionOpen(true);
    scrollByTab.current = {};
    closeRef.current?.focus();
  }, [open, student?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes the case review only when it is the top layer: the Response
  // Inspector or the Support Evidence Report opened from here sit above it and
  // close first.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || printing) return;
      const modals = [...document.querySelectorAll('[aria-modal="true"]')];
      if (modals.length && modals[modals.length - 1] !== shellRef.current) return;
      event.preventDefault();
      onCloseRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, printing]);

  // Print: the print copy is portalled onto <body> only while printing, so a
  // Support Evidence Report printed from above this view prints alone.
  useEffect(() => {
    if (!printing) return undefined;
    document.body.classList.add('cr-printing');
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    const timer = setTimeout(() => window.print(), 120);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('cr-printing');
    };
  }, [printing]);

  const records = load.records;
  const model = useMemo(() => {
    if (!records) return null;
    return buildStudentCaseReview({
      student: records.student,
      studentName: resolvedStudentName,
      classRecord,
      assignments,
      gradingPeriodSettings,
      selection: records.selection,
      revisions: records.revisions,
      evidence: records.evidence,
      serviceLog: records.serviceLog,
      engagement: records.engagement,
      supportSignals: records.supportSignals,
      sessionSummaries: records.sessionSummaries,
      exportSnapshots: records.exportSnapshots,
      practicePassKeys: records.practicePassKeys,
      caseEvidence: records.caseEvidence,
      caseEvidenceError: records.caseEvidenceError,
      sisSnapshot: sis.snapshot,
      sisConfirmedMatches: sis.confirmedMatches,
      nowValue: records.loadedAtMs,
      generatedByEmail: teacherEmail,
    });
  }, [records, sis, resolvedStudentName, classRecord, assignments, gradingPeriodSettings, teacherEmail]);

  // Assignments the teacher may narrow the case review to (given to this
  // student's class in the chosen period and dates; never library copies).
  const candidates = useMemo(() => {
    if (!open || !student?.id) return [];
    const { included } = selectReportAssignments({
      assignments, student, gradingPeriodSettings, selection: { ...selection, assignmentIds: [] },
    });
    return included.map(({ assignment }) => ({ id: assignment.id, title: assignment.title || assignment.id, due: assignment.dueAt || assignment.dueDate || '' }));
  }, [open, student, assignments, gradingPeriodSettings, selection]);

  // Per-tab scroll position: restored when the teacher comes back to a tab or
  // a drill level.
  const locationKey = `${location.tab}|${location.drill.assignmentId || ''}|${Number.isInteger(location.drill.storageIndex) ? location.drill.storageIndex : ''}`;
  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = scrollByTab.current[locationKey] || 0;
  }, [locationKey]);

  const navigate = useCallback((next) => {
    const target = { tab: next.tab, drill: next.drill || {} };
    if (sameLocation(target, location)) return;
    if (bodyRef.current) scrollByTab.current[locationKey] = bodyRef.current.scrollTop;
    setTrail((current) => [...current.slice(-40), location]);
    setLocation(target);
    if (target.tab === 'questions') setQuestionsDrill(target.drill);
    setVisited((current) => (current.has(target.tab) ? current : new Set([...current, target.tab])));
  }, [location, locationKey]);

  const goBack = () => {
    if (!trail.length) { onCloseRef.current?.(); return; }
    if (bodyRef.current) scrollByTab.current[locationKey] = bodyRef.current.scrollTop;
    const previous = trail[trail.length - 1];
    setTrail((current) => current.slice(0, -1));
    setLocation(previous);
    if (previous.tab === 'questions') setQuestionsDrill(previous.drill);
  };

  if (!open || !student?.id) return null;

  const periodLabel = selection.gradingPeriodId === 'all'
    ? 'All marking periods'
    : settings.periods.find((period) => period.id === selection.gradingPeriodId)?.label || selection.gradingPeriodId || 'All marking periods';

  const build = async () => {
    const chosen = { ...selection, gradingPeriodLabel: periodLabel };
    setLoad((current) => ({ ...current, loading: true, error: '' }));
    try {
      const loaded = await loadStudentCaseRecords({
        db, functions, student, assignments, gradingPeriodSettings, selection: chosen, teacherEmail,
      });
      setLoad({ loading: false, error: '', records: { ...loaded, selection: chosen } });
      setSavedSnapshots(loaded.savedSnapshots || []);
      setSis({ snapshot: null, confirmedMatches: {} });
      setLocation({ tab: 'summary', drill: {} });
      setTrail([]);
      setQuestionsDrill({});
      setVisited(new Set(['summary']));
      setSelectionOpen(false);
      scrollByTab.current = {};
    } catch (error) {
      setLoad((current) => ({ ...current, loading: false, error: error?.message || 'The case review could not be built.' }));
    }
  };

  const compareSnapshot = (snapshot) => {
    setSis({ snapshot, confirmedMatches: { ...snapshot?.confirmedMatches } });
  };
  const saveSnapshot = async ({ extracted, layout, fileName }) => {
    setSaving({ busy: true, error: '' });
    try {
      const saved = await saveSisSnapshot({
        db, student: records?.student || student, extracted, layout, fileName, confirmedMatches: sis.confirmedMatches, teacherEmail,
      });
      setSavedSnapshots((current) => [saved, ...current]);
      setSis({ snapshot: saved, confirmedMatches: { ...saved.confirmedMatches } });
      setSaving({ busy: false, error: '' });
      return true;
    } catch (error) {
      setSaving({ busy: false, error: error?.message || 'The snapshot could not be saved. It is still compared in this session only.' });
      return false;
    }
  };
  const confirmMatch = (itemName, choice) => {
    setSis((current) => ({ ...current, confirmedMatches: { ...current.confirmedMatches, [itemName]: choice } }));
  };

  const openAssignment = (assignmentId) => navigate({ tab: 'questions', drill: { assignmentId } });
  const openQuestion = (assignmentId, storageIndex) => navigate({ tab: 'questions', drill: { assignmentId, storageIndex } });

  const drillEntry = model && location.drill.assignmentId ? model.assignments.find((row) => row.assignmentId === location.drill.assignmentId) : null;
  const drillQuestion = drillEntry && Number.isInteger(location.drill.storageIndex)
    ? drillEntry.questions.find((row) => row.storageIndex === location.drill.storageIndex)
    : null;
  const course = classRecord?.course ? courseLabel(classRecord.course) : '';
  const exportsFor = (kind) => {
    if (!model) return;
    if (kind === 'json') download(caseReviewJson(model, { nextSteps }), caseReviewFileName(model, '', 'json'), 'application/json');
    if (kind === 'assignments') download(caseAssignmentsCsv(model), caseReviewFileName(model, 'assignments', 'csv'), 'text/csv');
    if (kind === 'questions') download(caseQuestionsCsv(model), caseReviewFileName(model, 'questions', 'csv'), 'text/csv');
    if (kind === 'facts') download(caseFactsCsv(model), caseReviewFileName(model, 'facts', 'csv'), 'text/csv');
    setNotice('Download started.');
  };

  const renderTab = (key) => {
    switch (key) {
      case 'summary': return <CaseSummaryTab model={model} onOpenTab={(tab) => navigate({ tab })} />;
      case 'grades': return <CaseGradesTab model={model} onOpenAssignment={openAssignment} />;
      case 'questions': return <CaseQuestionsTab model={model} drill={location.tab === 'questions' ? location.drill : {}} onDrill={(drill) => navigate({ tab: 'questions', drill })} onInspectResponse={onInspectResponse} />;
      case 'skills': return <CaseSkillsTab model={model} />;
      case 'dol': return <CaseDolTab model={model} />;
      case 'completion': return <CaseCompletionTab model={model} />;
      case 'supports': return <CaseSupportTab model={model} onOpenSupportReport={onOpenSupportReport} />;
      case 'timeline': return <CaseTimelineTab model={model} />;
      case 'gradebook': return (
        <CaseGradebookTab
          model={model}
          student={records.student}
          savedSnapshots={savedSnapshots}
          onUseSnapshot={compareSnapshot}
          onSaveSnapshot={saveSnapshot}
          onClearSnapshot={() => setSis({ snapshot: null, confirmedMatches: {} })}
          onConfirmMatch={confirmMatch}
          saving={saving.busy}
          saveError={saving.error}
        />
      );
      case 'facts': return <CaseNarrativeTab model={model} />;
      case 'attention': return <CaseAttentionTab model={model} onOpenAssignment={openAssignment} onOpenQuestion={openQuestion} />;
      case 'print': return (
        <>
          <section className="cr-section" aria-labelledby="cr-print-controls">
            <h2 id="cr-print-controls">Print or export this case review</h2>
            <label className="cr-field">
              <span>Teacher-entered next steps (optional)</span>
              <textarea className="cr-textarea" value={nextSteps} onChange={(event) => setNextSteps(event.target.value)} aria-describedby="cr-next-steps-note" placeholder="Your own plan or notes. Printed last, labelled as written by you." />
            </label>
            <p className="cr-note" id="cr-next-steps-note">{TEACHER_AUTHORED_LABEL} It is printed and exported apart from the generated evidence and is not saved in MathMaster.</p>
            <div className="tw-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="tw-btn tw-btn--primary tw-btn--sm" onClick={() => setPrinting(true)}>Print / Save PDF</button>
              <button type="button" className="tw-btn tw-btn--sm" onClick={() => exportsFor('assignments')}>Assignments CSV</button>
              <button type="button" className="tw-btn tw-btn--sm" onClick={() => exportsFor('questions')}>Questions CSV</button>
              <button type="button" className="tw-btn tw-btn--sm" onClick={() => exportsFor('facts')}>Facts CSV</button>
              <button type="button" className="tw-btn tw-btn--sm" onClick={() => exportsFor('json')}>JSON (full case file)</button>
              {notice && <span className="cr-note" role="status">{notice}</span>}
            </div>
          </section>
          <section className="cr-section" aria-labelledby="cr-print-preview-title">
            <h2 id="cr-print-preview-title">Preview</h2>
            <div className="cr-print-preview"><CasePrintView model={model} nextSteps={nextSteps} /></div>
          </section>
        </>
      );
      default: return null;
    }
  };

  return (
    <div className="cr-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCloseRef.current?.(); }}>
      <article ref={shellRef} className="cr-shell" role="dialog" aria-modal="true" aria-labelledby="case-review-title" data-case-review={student.id}>
        <header className="cr-header">
          <div className="cr-header__top">
            <div style={{ minWidth: 0 }}>
              <h1 id="case-review-title">Student Case Review — Academic Evidence</h1>
              <div className="cr-header__meta">
                {resolvedStudentName} · ID {student.id} · {classRecord?.name || classRecord?.period || 'No class'}{course ? ` · ${course}` : ''}
                {model ? ` · ${model.meta.gradingPeriodLabel} · ${model.meta.fromDateKey} to ${model.meta.toDateKey}` : ''}
              </div>
              {model && <div className="cr-header__meta">Built {when(model.generatedAtMs)} · a factual summary of MathMaster records — not a compliance determination and not a diagnosis.</div>}
            </div>
            <div className="tw-row" style={{ gap: 8 }}>
              {model && (
                <button type="button" className="tw-btn tw-btn--sm tw-btn--quiet" aria-expanded={selectionOpen} aria-controls="cr-selection" onClick={() => setSelectionOpen((current) => !current)}>
                  {selectionOpen ? 'Hide selection' : 'Change selection'}
                </button>
              )}
              <button type="button" className="tw-btn tw-btn--sm" onClick={goBack} data-case-back>{trail.length ? 'Back' : 'Back to student'}</button>
              <button ref={closeRef} type="button" className="tw-btn tw-btn--sm" onClick={() => onCloseRef.current?.()}>Close</button>
            </div>
          </div>
          <div className="cr-controls" id="cr-selection" hidden={Boolean(model) && !selectionOpen}>
            <label className="cr-field">
              <span>Marking period</span>
              <select className="tw-select" value={selection.gradingPeriodId} onChange={(event) => setSelection((current) => ({ ...current, gradingPeriodId: event.target.value, assignmentIds: [] }))}>
                {settings.periods.map((period) => <option key={period.id} value={period.id}>{period.label}{period.id === settings.currentPeriodId ? ' (current)' : ''}</option>)}
                <option value="all">All marking periods</option>
              </select>
            </label>
            <label className="cr-field">
              <span>From (optional)</span>
              <input className="tw-input" type="date" value={selection.fromDateKey} onChange={(event) => setSelection((current) => ({ ...current, fromDateKey: event.target.value, assignmentIds: [] }))} />
            </label>
            <label className="cr-field">
              <span>To (optional)</span>
              <input className="tw-input" type="date" value={selection.toDateKey} onChange={(event) => setSelection((current) => ({ ...current, toDateKey: event.target.value, assignmentIds: [] }))} />
            </label>
            <details className="cr-field" data-case-assignment-filter>
              <summary className="tw-btn tw-btn--sm">{selection.assignmentIds.length ? `${selection.assignmentIds.length} of ${candidates.length} assignments` : `All ${candidates.length} assignments`}</summary>
              <div className="cr-assignment-picker" role="group" aria-label="Assignments to include">
                {candidates.length ? candidates.map((candidate) => (
                  <label key={candidate.id}>
                    <input
                      type="checkbox"
                      checked={selection.assignmentIds.includes(candidate.id)}
                      onChange={(event) => setSelection((current) => ({
                        ...current,
                        assignmentIds: event.target.checked
                          ? [...current.assignmentIds, candidate.id]
                          : current.assignmentIds.filter((id) => id !== candidate.id),
                      }))}
                    />
                    <span>{candidate.title}{candidate.due ? <span className="cr-note"> · due {day(Date.parse(candidate.due))}</span> : null}</span>
                  </label>
                )) : <span className="cr-note">No assignments for this student in this period and range.</span>}
                {selection.assignmentIds.length > 0 && <button type="button" className="tw-btn tw-btn--sm tw-btn--quiet" onClick={() => setSelection((current) => ({ ...current, assignmentIds: [] }))}>Include all</button>}
              </div>
            </details>
            <button type="button" className="tw-btn tw-btn--primary" disabled={load.loading} onClick={build} data-case-build>
              {load.loading ? 'Building…' : model ? 'Rebuild case review' : 'Build case review'}
            </button>
          </div>
          {load.error && <div className="tw-notice" data-tone="danger" role="alert">{load.error}</div>}
        </header>

        {model && (
          <>
            <div className="cr-tabs" role="tablist" aria-label="Case review sections">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  id={`cr-tab-${tab.key}`}
                  aria-selected={location.tab === tab.key}
                  aria-controls={`cr-panel-${tab.key}`}
                  className="cr-tab"
                  onClick={() => navigate({ tab: tab.key, drill: tab.key === 'questions' ? (location.tab === 'questions' ? location.drill : questionsDrill) : {} })}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <nav className="cr-crumbs" aria-label="Where you are">
              <button type="button" onClick={() => onCloseRef.current?.()}>{resolvedStudentName}</button>
              <span aria-hidden="true">›</span>
              <button type="button" onClick={() => navigate({ tab: 'summary' })}>Case review</button>
              <span aria-hidden="true">›</span>
              {drillEntry
                ? <button type="button" onClick={() => navigate({ tab: 'questions' })}>{TAB_LABEL[location.tab]}</button>
                : <span aria-current="page">{TAB_LABEL[location.tab]}</span>}
              {drillEntry && (
                <>
                  <span aria-hidden="true">›</span>
                  {drillQuestion
                    ? <button type="button" onClick={() => navigate({ tab: 'questions', drill: { assignmentId: drillEntry.assignmentId } })}>{drillEntry.title}</button>
                    : <span aria-current="page">{drillEntry.title}</span>}
                </>
              )}
              {drillQuestion && (
                <>
                  <span aria-hidden="true">›</span>
                  <span aria-current="page">{drillQuestion.sectionLabel} Q{drillQuestion.sectionNumber}</span>
                </>
              )}
            </nav>
          </>
        )}

        <div ref={bodyRef} className="cr-body" onScroll={() => { if (bodyRef.current) scrollByTab.current[locationKey] = bodyRef.current.scrollTop; }}>
          {!model && !load.loading && (
            <div className="tw-notice">
              Choose the marking period (and dates or assignments, if needed), then build the case review. Only this student&apos;s records for that selection are read.
            </div>
          )}
          {load.loading && <div className="tw-notice" role="status">Reading this student&apos;s records…</div>}
          {model && TABS.filter((tab) => visited.has(tab.key) || tab.key === location.tab).map((tab) => (
            <div
              key={tab.key}
              role="tabpanel"
              id={`cr-panel-${tab.key}`}
              aria-labelledby={`cr-tab-${tab.key}`}
              hidden={tab.key !== location.tab}
              style={{ display: tab.key === location.tab ? 'grid' : 'none', gap: 14, minWidth: 0 }}
              data-case-tab={tab.key}
            >
              {renderTab(tab.key)}
            </div>
          ))}
          {model && !model.meta.evidenceLoaded && (
            <div className="tw-notice" data-tone="warning">
              Per-attempt records could not be loaded{records?.caseEvidenceError ? ` (${records.caseEvidenceError})` : ''}. Attempt sequences are derived from question records and are labelled so.
            </div>
          )}
        </div>
      </article>
      {printing && model && createPortal(
        <div className="cr-print-root"><CasePrintView model={model} nextSteps={nextSteps} /></div>,
        document.body,
      )}
    </div>
  );
}
