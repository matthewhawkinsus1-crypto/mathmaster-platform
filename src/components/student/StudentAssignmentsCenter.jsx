import React, { useMemo, useState } from 'react';
import { EmptyState, ProgressBar } from '../../ui/primitives';
import StudentGlobalNav, { STUDENT_DESTINATION } from './StudentGlobalNav.jsx';
import BuildStamp from './BuildStamp.jsx';
import {
  ALL_PERIODS_ID,
  ASSIGNMENT_CATEGORY,
  buildStudentAssignmentsCenter,
} from '../../platform/student/studentAssignmentsCenterModel.js';
import { MIN_TOUCH_TARGET_PX } from '../../platform/mobile/mobileInteractionFoundation.js';
import { formatDateTime, formatRemainingTime } from '../../assignmentLifecycle';
import { RecoveryInlineNotice } from './RecoveryOpportunities.jsx';

/*
 * THE ASSIGNMENTS CENTER.
 *
 * The reported problem, in a student's words: "I can't find the assignment I
 * finished." Home is built to surface the next action, so finished work sits
 * inside a collapsed group underneath however many active cards there are —
 * which in November is a lot of scrolling to reach the thing you came for.
 *
 * So this screen is built around finding rather than doing: four tabs, a search
 * box that ignores the tabs, and a marking-period filter that can reach back
 * into closed terms. Nothing is hidden behind progressive disclosure.
 *
 * Presentational. Every number arrives from buildStudentAssignmentsCenter,
 * which merges the dashboard model and the Grade Center model and computes no
 * grade of its own.
 */

const STATUS_TONE = {
  graded: { bg: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' },
  completed: { bg: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' },
  inProgress: { bg: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)' },
  pendingGrade: { bg: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)' },
  late: { bg: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)' },
  missing: { bg: 'var(--mm-error-bg)', color: 'var(--mm-error-text)' },
  practiceOnly: { bg: 'var(--mm-primary-subtle)', color: 'var(--mm-accent-text)' },
  excused: { bg: 'var(--mm-surface-control)', color: 'var(--mm-text)' },
  reopened: { bg: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)' },
  locked: { bg: 'var(--mm-surface-control)', color: 'var(--mm-text)' },
  notStarted: { bg: 'var(--mm-surface-control)', color: 'var(--mm-text)' },
};

const control = (primary) => ({
  appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
  minHeight: MIN_TOUCH_TARGET_PX, padding: '10px 16px', borderRadius: 10,
  fontWeight: 900, fontSize: 14, cursor: 'pointer', flex: '1 1 auto',
  border: primary ? 0 : '2px solid var(--mm-border)',
  background: primary ? 'var(--mm-primary)' : 'var(--mm-surface)',
  color: primary ? 'var(--mm-on-primary)' : 'var(--mm-text)',
});

function AssignmentRow({ row, onContinue, onOpenResult, onPractice, studentId, onOpenRecovery }) {
  const tone = STATUS_TONE[row.status] || STATUS_TONE.notStarted;
  return (
    <article
      style={{
        background: 'var(--mm-surface)', borderRadius: 12, border: '1px solid var(--mm-border)',
        padding: 16, marginBottom: 12, textAlign: 'left', minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>{row.title}</h3>
          {/* Named as one thing, because it is one thing. A student who sees
              four stages listed as four assignments starts asking which of
              them counts. */}
          {row.isTestCycle && (
            <div style={{ marginTop: 4, fontSize: 11, fontWeight: 900, letterSpacing: .3, textTransform: 'uppercase', color: 'var(--mm-accent-text)' }}>
              Test Cycle · Review → Test → Corrections → Retest
            </div>
          )}
          {row.testCycleDetail && (
            <div data-test-cycle-discovery={row.testCycleKey} style={{ marginTop: 4, fontSize: 13, color: 'var(--mm-text)', lineHeight: 1.45 }}>
              {row.testCycleDetail}
            </div>
          )}
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--mm-text-muted)', overflowWrap: 'anywhere' }}>
            Due {formatDateTime(row.dueAt)}
            {row.frozen
              ? ` · Closed ${formatDateTime(row.lateDueAt)}`
              : row.lifecycle?.isLate
                ? ` · Closes in ${formatRemainingTime(row.lifecycle.millisecondsRemaining)}`
                : ''}
            {/* Which term this belongs to, because the filter can be set to
                every period at once and a row then has to say where it is. */}
            {row.gradingPeriod?.label ? ` · ${row.gradingPeriod.label}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 0 }}>
          {row.displayGrade !== null && (
            <div style={{ fontSize: 'clamp(17px, 5.5vw, 22px)', fontWeight: 1000, color: 'var(--mm-text-strong)' }}>{row.displayGrade}%</div>
          )}
          {row.statusLabel && (
            <span style={{ display: 'inline-block', marginTop: 4, padding: '4px 9px', borderRadius: 999, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', background: tone.bg, color: tone.color }}>
              {row.statusLabel}
            </span>
          )}
        </div>
      </div>

      {row.questionsTotal > 0 && !row.isTestCycle && (
        <div style={{ marginTop: 12 }}>
          <ProgressBar
            value={row.questionsDone}
            max={row.questionsTotal}
            label={`${row.questionsDone} of ${row.questionsTotal} question${row.questionsTotal === 1 ? '' : 's'} finished`}
          />
        </div>
      )}

      {/* An open Warm-Up/DOL Recovery, with its own button: the row's Practice
          button is the assignment's practice, which never unlocks one. */}
      <RecoveryInlineNotice opportunities={row.recovery} studentId={studentId} onOpen={onOpenRecovery} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        {row.canContinue && (
          <button type="button" style={control(true)} onClick={() => onContinue?.(row.assignmentId)}>
            {row.continueLabel}
          </button>
        )}
        {row.canViewResults && (
          <button type="button" style={control(!row.canContinue)} onClick={() => onOpenResult?.(row.assignmentId)}>
            View Results
          </button>
        )}
        {row.canPractice && (
          <button type="button" style={control(false)} onClick={() => onPractice?.(row.assignmentId)}>
            Practice
          </button>
        )}
        {/* A locked assignment with nothing to open says why, rather than
            offering a button that does nothing. */}
        {!row.canContinue && !row.canViewResults && !row.canPractice && (
          <span style={{ fontSize: 13, color: 'var(--mm-text-muted)' }}>Opens when your teacher releases it.</span>
        )}
      </div>
    </article>
  );
}

export default function StudentAssignmentsCenter({
  dashboard,
  gradeCenter,
  gradingPeriodSettings = null,
  supportPresentation = {},
  onNavigate = null,
  onLogout = null,
  onContinue = null,
  onOpenResult = null,
  onPractice = null,
  // Open Warm-Up/DOL Recoveries by assignment id (buildStudentRecoveryDiscovery),
  // the signed-in student (for the NEW mark) and the handler that opens one.
  recoveryByAssignment = {},
  studentId = null,
  onOpenRecovery = null,
}) {
  const [search, setSearch] = useState('');
  const [periodId, setPeriodId] = useState(null);
  const [category, setCategory] = useState(ASSIGNMENT_CATEGORY.ACTIVE);

  const center = useMemo(() => buildStudentAssignmentsCenter({
    dashboard, gradeCenter, gradingPeriodSettings, search, periodId, category, recoveryByAssignment,
  }), [dashboard, gradeCenter, gradingPeriodSettings, search, periodId, category, recoveryByAssignment]);

  const { categories, activeCategory, activePeriodId, periodOptions, isSearching, visibleEntries, totalCount } = center;
  const activeGroup = categories.find((group) => group.id === activeCategory) || null;

  return (
    <div
      className={`${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`}
      style={{
        fontFamily: '"Segoe UI", sans-serif',
        background: supportPresentation.highContrast ? 'var(--mm-surface)' : 'var(--mm-surface-control)',
        minHeight: '100vh', padding: '20px 14px 48px',
        fontSize: supportPresentation.largeText ? '120%' : undefined,
      }}
    >
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <StudentGlobalNav
          current={STUDENT_DESTINATION.ASSIGNMENTS}
          onNavigate={onNavigate}
          onLogout={onLogout}
          style={{ marginBottom: 16 }}
        />

        <header style={{ marginBottom: 14, textAlign: 'left' }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(20px, 6vw, 26px)', color: 'var(--mm-primary-text)' }}>My Assignments</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--mm-text-muted)' }}>
            Everything your teacher has assigned you — {totalCount} assignment{totalCount === 1 ? '' : 's'}, including finished and closed work.
          </p>
        </header>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <label htmlFor="assignments-search" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            Search assignments
          </label>
          <input
            id="assignments-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search all assignments by title…"
            style={{
              flex: '1 1 220px', minWidth: 0, minHeight: MIN_TOUCH_TARGET_PX,
              padding: '9px 13px', borderRadius: 10, border: '2px solid var(--mm-border)',
              fontSize: 14, fontFamily: 'inherit',
            }}
          />
          <label htmlFor="assignments-period" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            Marking period
          </label>
          <select
            id="assignments-period"
            value={activePeriodId || ALL_PERIODS_ID}
            onChange={(event) => setPeriodId(event.target.value)}
            style={{
              flex: '1 1 180px', minWidth: 0, minHeight: MIN_TOUCH_TARGET_PX,
              padding: '9px 11px', borderRadius: 10, border: '2px solid var(--mm-border)',
              fontSize: 14, fontFamily: 'inherit', background: 'var(--mm-surface)',
            }}
          >
            {/* Past marking periods stay selectable. A closed term is exactly
                where a student goes looking for old work. */}
            {periodOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}{option.archived ? ' (closed)' : ''} · {option.count}
              </option>
            ))}
            <option value={ALL_PERIODS_ID}>All marking periods · {totalCount}</option>
          </select>
        </div>

        {isSearching ? (
          <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: 'var(--mm-primary-text)' }}>
            {/* Search deliberately reaches past the tabs and the period filter,
                so it says so — otherwise the counts above look wrong. */}
            {visibleEntries.length} result{visibleEntries.length === 1 ? '' : 's'} across every tab and marking period.
          </p>
        ) : (
          <div role="tablist" aria-label="Assignment categories" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {categories.map((group) => {
              const active = group.id === activeCategory;
              return (
                <button
                  key={group.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCategory(group.id)}
                  style={{
                    appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
                    minHeight: MIN_TOUCH_TARGET_PX, padding: '9px 14px', borderRadius: 999,
                    border: `2px solid ${active ? '#1a73e8' : 'var(--mm-border)'}`,
                    background: active ? '#1a73e8' : 'var(--mm-surface)',
                    color: active ? '#fff' : 'var(--mm-text)',
                    fontWeight: 900, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {group.label} · {group.count}
                </button>
              );
            })}
          </div>
        )}

        {!isSearching && activeGroup?.hint && (
          <p style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.5, color: 'var(--mm-text-muted)' }}>{activeGroup.hint}</p>
        )}

        {visibleEntries.length === 0 ? (
          <EmptyState
            icon={isSearching ? '🔍' : '📄'}
            title={isSearching ? 'No assignments match that search' : 'Nothing in this group'}
            message={isSearching
              ? 'Try part of the title instead. Search looks through every tab and every marking period, including closed ones.'
              : 'Try another tab, or switch the marking period filter to All marking periods to see older work.'}
          />
        ) : (
          visibleEntries.map((row) => (
            <AssignmentRow
              key={row.assignmentId}
              row={row}
              onContinue={onContinue}
              onOpenResult={onOpenResult}
              onPractice={onPractice}
              studentId={studentId}
              onOpenRecovery={onOpenRecovery}
            />
          ))
        )}

        <BuildStamp />
      </div>
    </div>
  );
}
