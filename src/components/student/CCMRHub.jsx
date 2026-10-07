import { useEffect, useMemo, useState } from 'react';
import {
  ASSESSMENT_FRAMEWORKS, FRAMEWORK_LABELS, READINESS,
  explainAssessmentRecommendation, getAssessmentRecommendations,
} from '../../platform/ccmr/assessmentPathways';
import { getAssessmentProfile } from '../../platform/ccmr/assessmentProfiles';
import {
  ccmrTestDateBounds, ccmrTestDateDraftProblem, describeCcmrPlan,
} from '../../platform/ccmr/ccmrPlan.js';
import { matchesAssessmentReferenceSearch, referenceLabel } from '../../platform/ccmr/assessmentStandardReferences.js';
import CcmrReferenceList from '../common/CcmrReferenceList.jsx';
import CCMRReadinessWheel from './CCMRReadinessWheel.jsx';
import { resolveAssessmentPracticeStage } from '../../platform/ccmr/assessmentFidelity.js';
import { toneTextColor } from '../../theme/themeColorRoles.js';

// 9F — College, Career & Military Readiness.
//
// A parallel destination, not a replacement for the course path. Two things
// keep it from becoming "four more subjects":
//
//   1. Every skill listed is a canonical MathMaster skill. The SAT's domain
//      headings are a grouping over those ids, never a second taxonomy.
//   2. The buckets are the same buckets the course path uses. A student who
//      understands their normal path already understands this screen.
//
// Unpractised is never rendered as weak, and never as 0%.

const STATUS_STYLE = {
  [READINESS.TRANSFER_GAP]: { label: 'Know the math, not the format', border: '#a50e0e', background: 'var(--mm-error-bg)', chip: '#a50e0e' },
  [READINESS.STRENGTHEN]: { label: 'Strengthen', border: '#f9ab00', background: 'var(--mm-warning-bg)', chip: '#7a4f00' },
  [READINESS.NOT_PRACTICED]: { label: 'Not practised yet', border: '#1a73e8', background: 'var(--mm-primary-soft)', chip: '#174ea6' },
  [READINESS.READY]: { label: 'Ready', border: 'var(--mm-border)', background: 'var(--mm-surface)', chip: '#3c4043' },
  [READINESS.STRONG]: { label: 'Strong', border: '#137333', background: 'var(--mm-success-bg)', chip: '#137333' },
  [READINESS.CHALLENGE_READY]: { label: 'Challenge ready', border: '#7e57c2', background: 'var(--mm-accent-soft)', chip: '#5b21b6' },
  [READINESS.MAINTENANCE]: { label: 'Challenge complete', border: '#137333', background: 'var(--mm-success-bg)', chip: '#137333' },
  [READINESS.NOT_AVAILABLE]: { label: 'Not available', border: 'var(--mm-border)', background: 'var(--mm-surface-sunken)', chip: '#5f6368' },
};

const BUCKET_TITLES = [
  ['recommended', 'Recommended'],
  ['strengthen', 'Strengthen'],
  ['available', 'Ready'],
  ['challenge', 'Challenge / completed'],
];

// Every control on this screen is at least 44px tall: it is used on phones
// and on shared Chromebooks with touch screens.
const TAP = 44;

const planStatusText = (planStatus, readOnly) => {
  if (!planStatus) return '';
  if (planStatus.error) return planStatus.error;
  if (!planStatus.loaded) return readOnly ? 'Loading this student’s plan…' : 'Loading your plan…';
  if (planStatus.state === 'saving') return 'Saving…';
  if (planStatus.state === 'error') return planStatus.message || 'Your plan could not be saved.';
  if (planStatus.state === 'saved') return 'Saved to your account. It follows you to any device.';
  return '';
};

// "I'm preparing for…", the test date, and what each test's benchmark is.
// The plan is the student's saved CCMR plan; a teacher sees it read-only.
function CcmrPlanPanel({ goals, plan, planStatus, readOnly, now, onToggleGoal, onChangeTest }) {
  const described = useMemo(
    () => describeCcmrPlan(plan, { now, audience: readOnly ? 'teacher' : 'student' }),
    [plan, now, readOnly],
  );
  const savedDate = plan?.testDate || '';
  const savedFramework = plan?.testFramework || '';
  const [draftDate, setDraftDate] = useState(savedDate);
  const [draftFramework, setDraftFramework] = useState(savedFramework || goals[0] || '');
  // Keyed by the goals' VALUES: the array is rebuilt whenever the evidence
  // reloads, and an unsaved choice must not be reset by that.
  const goalsKey = goals.join('|');
  useEffect(() => { setDraftDate(savedDate); }, [savedDate]);
  useEffect(() => { setDraftFramework(savedFramework || goalsKey.split('|')[0] || ''); }, [savedFramework, goalsKey]);

  // Editing waits for the saved plan to arrive; a teacher never edits.
  const locked = !readOnly && Boolean(planStatus) && planStatus.editable === false;
  const bounds = ccmrTestDateBounds({ now });
  const framework = goals.includes(draftFramework) ? draftFramework : (goals[0] || '');
  const problem = ccmrTestDateDraftProblem(draftDate, { now });
  const changed = draftDate !== savedDate || (Boolean(draftDate) && framework !== savedFramework);
  const status = planStatusText(planStatus, readOnly);
  const statusIsError = Boolean(planStatus?.error) || planStatus?.state === 'error';
  const controlStyle = { minHeight: TAP, padding: '8px 10px', border: '1px solid var(--mm-border)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-text)', font: 'inherit', boxSizing: 'border-box' };
  // A disabled button must look disabled: "Save date" is off until the date
  // actually changes, and a bright blue button that does nothing reads as broken.
  const buttonStyle = (primary, disabled = false) => ({
    minHeight: TAP, padding: '8px 14px', borderRadius: 8, fontWeight: 850, fontSize: 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: primary && !disabled ? 0 : '1px solid var(--mm-border)',
    background: primary && !disabled ? '#1a73e8' : 'var(--mm-surface)',
    color: primary && !disabled ? '#fff' : (disabled ? 'var(--mm-text-muted)' : 'var(--mm-text)'),
  });
  const saveDisabled = !changed || Boolean(problem) || !draftDate;

  return (
    <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: 'var(--mm-surface-sunken)', border: '1px solid var(--mm-border)' }}>
      <fieldset disabled={locked} style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}>
        <legend style={{ padding: 0, margin: '0 0 8px', fontWeight: 800, fontSize: 13, color: 'var(--mm-text)' }}>I&apos;m preparing for:</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ASSESSMENT_FRAMEWORKS.map((id) => (
            <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 999, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', fontSize: 13, fontWeight: 700, cursor: readOnly ? 'default' : 'pointer', minHeight: TAP, boxSizing: 'border-box' }}>
              <input
                type="checkbox"
                checked={goals.includes(id)}
                onChange={() => onToggleGoal(id)}
                disabled={readOnly}
                style={{ width: 18, height: 18 }}
              />
              {FRAMEWORK_LABELS[id]}
            </label>
          ))}
        </div>
      </fieldset>
      <p style={{ margin: '8px 0 0', color: 'var(--mm-text-muted)', fontSize: 12 }}>
        {readOnly
          ? 'Teacher read-only view: these are the student’s current CCMR goals. Goals cannot be changed here.'
          : 'Choosing one moves it up your list. It never locks the others away.'}
      </p>

      {(goals.length > 0 || savedDate) && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--mm-border)' }}>
          {readOnly ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--mm-text)' }}>
              <strong>Test date:</strong>{' '}
              {described.test ? `${described.test.dateLabel} · ${described.test.testName}` : 'none set'}
            </p>
          ) : (
            <fieldset disabled={locked} style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}>
              <legend style={{ padding: 0, margin: '0 0 6px', fontWeight: 800, fontSize: 13, color: 'var(--mm-text)' }}>My test date (optional)</legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {goals.length > 1 && (
                  <select
                    aria-label="Which test is on this date"
                    value={framework}
                    onChange={(event) => setDraftFramework(event.target.value)}
                    style={{ ...controlStyle, flex: '0 1 auto' }}
                  >
                    {goals.map((id) => <option key={id} value={id}>{FRAMEWORK_LABELS[id]}</option>)}
                  </select>
                )}
                <input
                  type="date"
                  aria-label="Test date"
                  value={draftDate}
                  min={bounds.min}
                  max={bounds.max}
                  onChange={(event) => setDraftDate(event.target.value)}
                  style={{ ...controlStyle, flex: '1 1 150px', minWidth: 0, maxWidth: 220 }}
                />
                <button
                  type="button"
                  disabled={saveDisabled}
                  onClick={() => onChangeTest?.({ testDate: draftDate, testFramework: framework })}
                  style={buttonStyle(true, saveDisabled)}
                >
                  Save date
                </button>
                {savedDate && (
                  <button type="button" onClick={() => onChangeTest?.({ testDate: null })} style={buttonStyle(false)}>
                    Remove date
                  </button>
                )}
              </div>
              {problem && <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--mm-error-text)' }}>{problem}</p>}
              <p style={{ margin: '6px 0 0', color: 'var(--mm-text-muted)', fontSize: 12, lineHeight: 1.5 }}>
                When your weekly Path includes test practice, it leans toward this test in the four weeks before it.
              </p>
            </fieldset>
          )}
          {described.lines.length > 0 && (
            <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 4 }}>
              {described.lines.map((line) => (
                <li key={line.framework} style={{ fontSize: 12.5, fontWeight: line.isTest ? 850 : 700, color: line.isTest ? 'var(--mm-primary-text)' : 'var(--mm-text)' }}>
                  {line.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p role="status" aria-live="polite" style={{ margin: status ? '8px 0 0' : 0, fontSize: 12, fontWeight: 700, color: statusIsError ? 'var(--mm-error-text)' : 'var(--mm-text-muted)' }}>
        {status}
      </p>
    </div>
  );
}

function SkillRow({ item, onPractise, showFramework = false, readOnly = false }) {
  const [showReference, setShowReference] = useState(false);
  const style = STATUS_STYLE[item.status] || STATUS_STYLE[READINESS.READY];
  const primary = item.references?.[0] || null;
  const stage = item.practiceStage || resolveAssessmentPracticeStage(item.evidence);
  return (
    <div
      style={{
        display: 'block', width: '100%', textAlign: 'left', minHeight: 60,
        padding: '12px 14px', borderRadius: 12, marginBottom: 8,
        border: `2px solid ${style.border}`, background: style.background,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4, color: toneTextColor(style.chip) }}>
            {showFramework ? `${FRAMEWORK_LABELS[item.framework]} · ${style.label}` : style.label}
          </span>
          <span style={{ display: 'block', fontWeight: 800, color: 'var(--mm-text-strong)', fontSize: 15, margin: '3px 0' }}>{item.label}</span>
          <span style={{ display: 'block', color: 'var(--mm-text-muted)', fontSize: 12, lineHeight: 1.5 }}>
            {explainAssessmentRecommendation(item)}
          </span>
          {primary && (
            <span style={{ display: 'block', color: 'var(--mm-accent-text)', fontSize: 11.5, lineHeight: 1.45, marginTop: 6, fontWeight: 850 }}>
              {referenceLabel(primary)}
            </span>
          )}
          <span style={{ display: 'block', color: 'var(--mm-text)', fontSize: 11, marginTop: 5, fontWeight: 700 }}>
            Course: {item.coreMastery == null ? 'no evidence yet' : `${Math.round(item.coreMastery * 100)}%`}
            {' · '}
            {item.assessmentProficiency == null || item.evidenceBasis !== 'direct'
              ? 'this format: not practised yet'
              : `this format: ${Math.round(item.assessmentProficiency * 100)}%${item.provisional ? ' (early)' : ''}`}
          </span>
          <span style={{ display: 'block', color: item.status === READINESS.MAINTENANCE ? 'var(--mm-success-text)' : 'var(--mm-accent-text)', fontSize: 11.5, marginTop: 5, fontWeight: 900 }}>
            {stage.label} · {stage.actionLabel}
          </span>
        </div>
        {item.status === READINESS.NOT_AVAILABLE ? (
          <span style={{ minHeight: 38, display: 'inline-flex', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'var(--mm-surface-control)', color: 'var(--mm-text-muted)', fontWeight: 850, fontSize: 12 }}>
            Not available
          </span>
        ) : readOnly ? (
          <span style={{ minHeight: 38, display: 'inline-flex', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'var(--mm-surface-control)', color: 'var(--mm-text-muted)', fontWeight: 850, fontSize: 12 }}>
            Student can practise this
          </span>
        ) : (
          <button type="button" onClick={() => onPractise?.(item)} style={{ minHeight: TAP, padding: '8px 12px', border: 0, borderRadius: 8, background: item.status === READINESS.MAINTENANCE ? '#137333' : '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>
            {stage.actionLabel}
          </button>
        )}
      </div>
      {item.references?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={() => setShowReference((value) => !value)} style={{ minHeight: TAP, display: 'inline-flex', alignItems: 'center', padding: 0, border: 0, background: 'transparent', color: 'var(--mm-primary-text)', fontSize: 11.5, fontWeight: 850, cursor: 'pointer' }}>
            {showReference ? 'Hide official standard connection' : 'Dig deeper into the standard connection'}
          </button>
          {showReference && <div style={{ marginTop: 8 }}><CcmrReferenceList references={item.references} /></div>}
        </div>
      )}
    </div>
  );
}

function PathwayCard({ framework, summary, active, onSelect }) {
  const profile = getAssessmentProfile(framework);
  return (
    <button
      type="button"
      onClick={() => onSelect(framework)}
      style={{
        textAlign: 'left', padding: '14px 16px', borderRadius: 12, minHeight: 96,
        border: `2px solid ${active ? '#1a73e8' : 'var(--mm-border)'}`,
        background: active ? 'var(--mm-primary-soft)' : 'var(--mm-surface)', cursor: 'pointer',
      }}
    >
      <span style={{ display: 'block', fontWeight: 900, fontSize: 16, color: 'var(--mm-text-strong)' }}>{profile?.displayName || FRAMEWORK_LABELS[framework]}</span>
      <span style={{ display: 'block', color: 'var(--mm-text-muted)', fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
        {summary.readySkills} skill{summary.readySkills === 1 ? '' : 's'} ready
        {' · '}
        {summary.practisedSkills} practised
        {summary.challengeReadySkills ? ` · ${summary.challengeReadySkills} challenge-ready` : ''}
        {summary.maintainedSkills ? ` · ${summary.maintainedSkills} challenge complete` : ''}
      </span>
      {summary.transferGaps > 0 && (
        <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 999, color: 'var(--mm-error-text)', background: 'var(--mm-error-bg)' }}>
          {summary.transferGaps} to transfer
        </span>
      )}
    </button>
  );
}

export default function CCMRHub({
  pathOptions = null,
  assessmentEvidence = {},
  directIndex = null,
  coverage = undefined,
  goals = [],
  // The student's saved CCMR plan (goals, test date) and where saving it
  // stands. Both optional: without them the hub still lists and ranks.
  plan = null,
  planStatus = null,
  teacherPriorities = [],
  onChangeGoals,
  onChangeTest,
  onPractise,
  onReturnToCourse,
  readOnly = false,
  // Injectable for a deterministic browser harness; the live screen reads the clock.
  now = undefined,
}) {
  const [framework, setFramework] = useState(null);
  // Which part of the test the student is looking at. The wheel is a way in to
  // the skill lists below, not a second place where recommendations live.
  const [domainId, setDomainId] = useState(null);
  const [search, setSearch] = useState('');

  const byFramework = useMemo(() => {
    const result = {};
    ASSESSMENT_FRAMEWORKS.forEach((id) => {
      result[id] = getAssessmentRecommendations({
        framework: id, pathOptions, assessmentEvidence, directIndex, coverage, goals, teacherPriorities,
      });
    });
    return result;
  }, [pathOptions, assessmentEvidence, directIndex, coverage, goals, teacherPriorities]);

  // A framework with nothing eligible is not shown at all. That is the honest
  // consequence of the coverage audit: if no skill this student can reach is
  // aligned to the ASVAB, there is no ASVAB pathway for them today.
  const offered = ASSESSMENT_FRAMEWORKS.filter((id) => byFramework[id].summary.readySkills > 0);
  const active = framework && offered.includes(framework) ? byFramework[framework] : null;
  const activeDomainTitle = domainId
    ? (active?.profile?.domains || []).find((entry) => entry.id === domainId)?.title || 'this part of the test'
    : null;

  const searchResults = useMemo(() => {
    const query = search.trim();
    if (!query) return [];
    const seen = new Set();
    const results = [];
    ASSESSMENT_FRAMEWORKS.forEach((frameworkId) => {
      const recommendation = byFramework[frameworkId];
      ['recommended', 'strengthen', 'available', 'challenge', 'unavailable'].forEach((bucket) => {
        (recommendation?.[bucket] || []).forEach((item) => {
          const key = `${frameworkId}:${item.skillId}`;
          if (seen.has(key) || !item.references?.length) return;
          if (!matchesAssessmentReferenceSearch({ ...item, framework: frameworkId }, query)) return;
          seen.add(key);
          results.push(item);
        });
      });
    });
    return results
      .sort((a, b) => (b.score || 0) - (a.score || 0) || a.label.localeCompare(b.label))
      .slice(0, 40);
  }, [search, byFramework]);

  const toggleGoal = (id) => {
    if (readOnly) return;
    const next = goals.includes(id) ? goals.filter((entry) => entry !== id) : [...goals, id];
    onChangeGoals?.(next);
  };

  if (!pathOptions) {
    return (
      <section style={{ padding: 16, border: '1px solid var(--mm-border)', borderRadius: 12, background: 'var(--mm-surface)', textAlign: 'left' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 18, color: 'var(--mm-primary-text)' }}>College, Career &amp; Military Readiness</h2>
        <p style={{ margin: 0, color: 'var(--mm-text-muted)', lineHeight: 1.6 }}>
          MathMaster is still resolving your course path, so there is nothing to recommend here yet.
        </p>
      </section>
    );
  }

  return (
    <section style={{ textAlign: 'left' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 20, color: 'var(--mm-primary-text)' }}>College, Career &amp; Military Readiness</h2>
      <p style={{ margin: '0 0 16px', color: 'var(--mm-text-muted)', fontSize: 13, lineHeight: 1.6 }}>
        The same mathematics you are already learning, in the formats these assessments use.
        Your course path is still your main path — this is here when you want it.
      </p>

      <CcmrPlanPanel
        goals={goals}
        plan={plan}
        planStatus={planStatus}
        readOnly={readOnly}
        now={now ?? Date.now()}
        onToggleGoal={toggleGoal}
        onChangeTest={readOnly ? null : onChangeTest}
      />

      <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: 'var(--mm-surface)', border: '1px solid var(--mm-border)' }}>
        <label htmlFor="ccmr-standard-search" style={{ display: 'block', marginBottom: 6, fontWeight: 850, fontSize: 13, color: 'var(--mm-text)' }}>Find practice by CCMR standard or skill</label>
        <input
          id="ccmr-standard-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Try ACT F 502, recursive sequence, SAT nonlinear functions, TSIA2 Algebraic Reasoning, or ASVAB MK"
          style={{ width: '100%', minHeight: TAP, boxSizing: 'border-box', padding: '9px 11px', border: '1px solid var(--mm-border)', borderRadius: 9, font: 'inherit' }}
        />
        <p style={{ margin: '7px 0 0', color: 'var(--mm-text-muted)', fontSize: 11.5, lineHeight: 1.5 }}>
          Search uses the official identifier each assessment actually publishes. ACT has numbered CCRS standards; Digital SAT and TSIA2 use official skill names; ASVAB uses AR/MK subtest codes.
        </p>
      </div>

      {search.trim() && (
        <section style={{ marginBottom: 18, padding: 14, borderRadius: 12, background: 'var(--mm-surface-tint)', border: '1px solid var(--mm-tint-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 10 }}>
            <strong style={{ color: 'var(--mm-primary-text)' }}>Practice matches</strong>
            <span style={{ color: 'var(--mm-text-muted)', fontSize: 12 }}>{searchResults.length} matching course skill{searchResults.length === 1 ? '' : 's'}</span>
          </div>
          {searchResults.length
            ? searchResults.map((item) => <SkillRow key={`search:${item.framework}:${item.skillId}`} item={item} onPractise={onPractise} showFramework readOnly={readOnly} />)
            : <p style={{ margin: 0, color: 'var(--mm-text-muted)', fontSize: 13, lineHeight: 1.6 }}>No course skill matches that standard or skill. Try a broader term or another assessment identifier.</p>}
        </section>
      )}

      {!offered.length ? (
        <p style={{ padding: 16, borderRadius: 12, background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', color: 'var(--mm-text-muted)', lineHeight: 1.6, margin: 0 }}>
          None of the skills you are ready for are matched to these assessments yet. This will fill in
          as your class moves through the year.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 10, marginBottom: 18 }}>
          {offered.map((id) => (
            <PathwayCard
              key={id}
              framework={id}
              summary={byFramework[id].summary}
              active={framework === id}
              onSelect={(next) => { setFramework(next); setDomainId(null); }}
            />
          ))}
        </div>
      )}

      {active && (
        <div style={{ border: '1px solid var(--mm-border)', borderRadius: 12, background: 'var(--mm-surface)', padding: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: 'var(--mm-primary-text)' }}>{active.profile?.displayName} Math</h3>
            {/* §17 — never trapped in one pathway. */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {offered.filter((id) => id !== framework).map((id) => (
                <button key={id} type="button" onClick={() => { setFramework(id); setDomainId(null); }} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 800, fontSize: 12, cursor: 'pointer', minHeight: TAP }}>
                  Switch to {FRAMEWORK_LABELS[id]}
                </button>
              ))}
              <button type="button" onClick={() => onReturnToCourse?.()} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 800, fontSize: 12, cursor: 'pointer', minHeight: TAP }}>
                Back to course path
              </button>
            </div>
          </div>

          {active.profile && (
            <p style={{ margin: '0 0 14px', color: 'var(--mm-text-muted)', fontSize: 12, lineHeight: 1.55 }}>
              {active.profile.totalQuestions} questions
              {active.profile.secondsPerQuestion ? ` · about ${active.profile.secondsPerQuestion}s each` : ' · untimed'}
              {' · '}
              {active.profile.calculatorPolicy === 'none' ? 'no calculator' : 'calculator allowed'}
            </p>
          )}

          {/* The wheel: this assessment's own reporting domains, coloured by
              how well the student is TRANSFERRING into this format. Clicking
              one filters the same lists below rather than opening a second,
              parallel set of recommendations. */}
          <div style={{ marginBottom: 18 }}>
            <CCMRReadinessWheel
              recommendations={active}
              selectedDomainId={domainId}
              onSelectDomain={(next) => setDomainId((current) => (current === next ? null : next))}
            />
          </div>

          {domainId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--mm-text)', fontWeight: 800 }}>
                Showing {activeDomainTitle} only
              </span>
              <button type="button" onClick={() => setDomainId(null)} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 800, fontSize: 12, cursor: 'pointer', minHeight: TAP }}>
                Show every part of the test
              </button>
            </div>
          )}

          {BUCKET_TITLES.map(([bucket, title]) => {
            const items = domainId
              ? active[bucket].filter((item) => item.domainId === domainId)
              : active[bucket];
            return items.length ? (
              <div key={bucket} style={{ marginBottom: 14 }}>
                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--mm-text-muted)' }}>{title}</p>
                {items.map((item) => (
                  <SkillRow key={item.skillId} item={item} onPractise={onPractise} readOnly={readOnly} />
                ))}
              </div>
            ) : null;
          })}

          {domainId && !BUCKET_TITLES.some(([bucket]) => active[bucket].some((item) => item.domainId === domainId)) && (
            <p style={{ margin: 0, color: 'var(--mm-text-muted)', fontSize: 13, lineHeight: 1.6 }}>
              Nothing in {activeDomainTitle} is matched to your skills yet. It will fill in as your class moves
              through the year.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
