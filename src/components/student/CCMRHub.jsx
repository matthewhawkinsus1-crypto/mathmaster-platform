import { useMemo, useState } from 'react';
import {
  ASSESSMENT_FRAMEWORKS, FRAMEWORK_LABELS, READINESS,
  explainAssessmentRecommendation, getAssessmentRecommendations,
} from '../../platform/ccmr/assessmentPathways';
import { getAssessmentProfile } from '../../platform/ccmr/assessmentProfiles';
import { matchesAssessmentReferenceSearch, referenceLabel } from '../../platform/ccmr/assessmentStandardReferences.js';
import CcmrReferenceList from '../common/CcmrReferenceList.jsx';
import CCMRReadinessWheel from './CCMRReadinessWheel.jsx';

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
  [READINESS.TRANSFER_GAP]: { label: 'Know the math, not the format', border: '#a50e0e', background: '#fce8e6', chip: '#a50e0e' },
  [READINESS.STRENGTHEN]: { label: 'Strengthen', border: '#f9ab00', background: '#fef7e0', chip: '#7a4f00' },
  [READINESS.NOT_PRACTICED]: { label: 'Not practised yet', border: '#1a73e8', background: '#e8f0fe', chip: '#174ea6' },
  [READINESS.READY]: { label: 'Ready', border: '#dadce0', background: '#fff', chip: '#3c4043' },
  [READINESS.STRONG]: { label: 'Strong', border: '#137333', background: '#e6f4ea', chip: '#137333' },
  [READINESS.NOT_AVAILABLE]: { label: 'Not open yet', border: '#bdc1c6', background: '#f8f9fa', chip: '#5f6368' },
};

const BUCKET_TITLES = [
  ['recommended', 'Recommended'],
  ['strengthen', 'Strengthen'],
  ['available', 'Ready'],
  ['challenge', 'Going well'],
];

function SkillRow({ item, onPractise, showFramework = false, readOnly = false }) {
  const [showReference, setShowReference] = useState(false);
  const style = STATUS_STYLE[item.status] || STATUS_STYLE[READINESS.READY];
  const primary = item.references?.[0] || null;
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
          <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4, color: style.chip }}>
            {showFramework ? `${FRAMEWORK_LABELS[item.framework]} · ${style.label}` : style.label}
          </span>
          <span style={{ display: 'block', fontWeight: 800, color: '#202124', fontSize: 15, margin: '3px 0' }}>{item.label}</span>
          <span style={{ display: 'block', color: '#5f6368', fontSize: 12, lineHeight: 1.5 }}>
            {explainAssessmentRecommendation(item)}
          </span>
          {primary && (
            <span style={{ display: 'block', color: '#5b21b6', fontSize: 11.5, lineHeight: 1.45, marginTop: 6, fontWeight: 850 }}>
              {referenceLabel(primary)}
            </span>
          )}
          <span style={{ display: 'block', color: '#3c4043', fontSize: 11, marginTop: 5, fontWeight: 700 }}>
            Course: {item.coreMastery == null ? 'no evidence yet' : `${Math.round(item.coreMastery * 100)}%`}
            {' · '}
            {item.assessmentProficiency == null || item.evidenceBasis !== 'direct'
              ? 'this format: not practised yet'
              : `this format: ${Math.round(item.assessmentProficiency * 100)}%${item.provisional ? ' (early)' : ''}`}
          </span>
        </div>
        {item.status === READINESS.NOT_AVAILABLE ? (
          <span style={{ minHeight: 38, display: 'inline-flex', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: '#f1f3f4', color: '#5f6368', fontWeight: 850, fontSize: 12 }}>
            Not open yet
          </span>
        ) : readOnly ? (
          <span style={{ minHeight: 38, display: 'inline-flex', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: '#f1f3f4', color: '#5f6368', fontWeight: 850, fontSize: 12 }}>
            Student can practise this
          </span>
        ) : (
          <button type="button" onClick={() => onPractise?.(item)} style={{ minHeight: 38, padding: '8px 12px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>
            Start {showFramework ? FRAMEWORK_LABELS[item.framework] : 'practice'}
          </button>
        )}
      </div>
      {item.references?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={() => setShowReference((value) => !value)} style={{ padding: 0, border: 0, background: 'transparent', color: '#174ea6', fontSize: 11.5, fontWeight: 850, cursor: 'pointer' }}>
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
        border: `2px solid ${active ? '#1a73e8' : '#dadce0'}`,
        background: active ? '#e8f0fe' : '#fff', cursor: 'pointer',
      }}
    >
      <span style={{ display: 'block', fontWeight: 900, fontSize: 16, color: '#202124' }}>{profile?.displayName || FRAMEWORK_LABELS[framework]}</span>
      <span style={{ display: 'block', color: '#5f6368', fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
        {summary.readySkills} skill{summary.readySkills === 1 ? '' : 's'} ready
        {' · '}
        {summary.practisedSkills} practised
      </span>
      {summary.transferGaps > 0 && (
        <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 999, color: '#a50e0e', background: '#fce8e6' }}>
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
  goals = [],
  teacherPriorities = [],
  onChangeGoals,
  onPractise,
  onReturnToCourse,
  readOnly = false,
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
        framework: id, pathOptions, assessmentEvidence, directIndex, goals, teacherPriorities,
      });
    });
    return result;
  }, [pathOptions, assessmentEvidence, directIndex, goals, teacherPriorities]);

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
      <section style={{ padding: 16, border: '1px solid #dadce0', borderRadius: 12, background: '#fff', textAlign: 'left' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 18, color: '#174ea6' }}>College, Career &amp; Military Readiness</h2>
        <p style={{ margin: 0, color: '#5f6368', lineHeight: 1.6 }}>
          MathMaster is still resolving your course path, so there is nothing to recommend here yet.
        </p>
      </section>
    );
  }

  return (
    <section style={{ textAlign: 'left' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 20, color: '#174ea6' }}>College, Career &amp; Military Readiness</h2>
      <p style={{ margin: '0 0 16px', color: '#5f6368', fontSize: 13, lineHeight: 1.6 }}>
        The same mathematics you are already learning, in the formats these assessments use.
        Your course path is still your main path — this is here when you want it.
      </p>

      <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: '#f8f9fa', border: '1px solid #dadce0' }}>
        <p style={{ margin: '0 0 8px', fontWeight: 800, fontSize: 13, color: '#3c4043' }}>I&apos;m preparing for:</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ASSESSMENT_FRAMEWORKS.map((id) => (
            <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px', borderRadius: 999, border: '1px solid #c9ced6', background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 40 }}>
              <input
                type="checkbox"
                checked={goals.includes(id)}
                onChange={() => toggleGoal(id)}
                disabled={readOnly}
                style={{ width: 18, height: 18 }}
              />
              {FRAMEWORK_LABELS[id]}
            </label>
          ))}
        </div>
        <p style={{ margin: '8px 0 0', color: '#5f6368', fontSize: 12 }}>
          {readOnly
            ? 'Teacher read-only view: these are the student’s current CCMR goals. Goals cannot be changed here.'
            : 'Choosing one moves it up your list. It never locks the others away.'}
        </p>
      </div>

      <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: '#fff', border: '1px solid #dadce0' }}>
        <label htmlFor="ccmr-standard-search" style={{ display: 'block', marginBottom: 6, fontWeight: 850, fontSize: 13, color: '#3c4043' }}>Find practice by CCMR standard or skill</label>
        <input
          id="ccmr-standard-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Try ACT F 502, recursive sequence, SAT nonlinear functions, TSIA2 Algebraic Reasoning, or ASVAB MK"
          style={{ width: '100%', minHeight: 42, padding: '9px 11px', border: '1px solid #c9ced6', borderRadius: 9, font: 'inherit' }}
        />
        <p style={{ margin: '7px 0 0', color: '#5f6368', fontSize: 11.5, lineHeight: 1.5 }}>
          Search uses the official identifier each assessment actually publishes. ACT has numbered CCRS standards; Digital SAT and TSIA2 use official skill names; ASVAB uses AR/MK subtest codes.
        </p>
      </div>

      {search.trim() && (
        <section style={{ marginBottom: 18, padding: 14, borderRadius: 12, background: '#f8fbff', border: '1px solid #d9e2f1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 10 }}>
            <strong style={{ color: '#174ea6' }}>Practice matches</strong>
            <span style={{ color: '#5f6368', fontSize: 12 }}>{searchResults.length} matching course skill{searchResults.length === 1 ? '' : 's'}</span>
          </div>
          {searchResults.length
            ? searchResults.map((item) => <SkillRow key={`search:${item.framework}:${item.skillId}`} item={item} onPractise={onPractise} showFramework readOnly={readOnly} />)
            : <p style={{ margin: 0, color: '#5f6368', fontSize: 13, lineHeight: 1.6 }}>No course skill matches that standard or skill. Try a broader term or another assessment identifier.</p>}
        </section>
      )}

      {!offered.length ? (
        <p style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #dadce0', color: '#5f6368', lineHeight: 1.6, margin: 0 }}>
          None of the skills you are ready for are matched to these assessments yet. This will fill in
          as your class moves through the year.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 18 }}>
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
        <div style={{ border: '1px solid #dadce0', borderRadius: 12, background: '#fff', padding: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: '#174ea6' }}>{active.profile?.displayName} Math</h3>
            {/* §17 — never trapped in one pathway. */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {offered.filter((id) => id !== framework).map((id) => (
                <button key={id} type="button" onClick={() => { setFramework(id); setDomainId(null); }} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid #c5d5ef', background: '#fff', color: '#174ea6', fontWeight: 800, fontSize: 12, cursor: 'pointer', minHeight: 36 }}>
                  Switch to {FRAMEWORK_LABELS[id]}
                </button>
              ))}
              <button type="button" onClick={() => onReturnToCourse?.()} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid #c9ced6', background: '#fff', color: '#3c4043', fontWeight: 800, fontSize: 12, cursor: 'pointer', minHeight: 36 }}>
                Back to course path
              </button>
            </div>
          </div>

          {active.profile && (
            <p style={{ margin: '0 0 14px', color: '#5f6368', fontSize: 12, lineHeight: 1.55 }}>
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
              <span style={{ fontSize: 12, color: '#3c4043', fontWeight: 800 }}>
                Showing {activeDomainTitle} only
              </span>
              <button type="button" onClick={() => setDomainId(null)} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #c9ced6', background: '#fff', color: '#3c4043', fontWeight: 800, fontSize: 12, cursor: 'pointer', minHeight: 34 }}>
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
                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4, color: '#5f6368' }}>{title}</p>
                {items.map((item) => (
                  <SkillRow key={item.skillId} item={item} onPractise={onPractise} readOnly={readOnly} />
                ))}
              </div>
            ) : null;
          })}

          {domainId && !BUCKET_TITLES.some(([bucket]) => active[bucket].some((item) => item.domainId === domainId)) && (
            <p style={{ margin: 0, color: '#5f6368', fontSize: 13, lineHeight: 1.6 }}>
              Nothing in {activeDomainTitle} is matched to your skills yet. It will fill in as your class moves
              through the year.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
