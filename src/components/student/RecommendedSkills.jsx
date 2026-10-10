import { useEffect, useMemo, useState } from 'react';
import { describeSkill } from '../../platform/path/skillGraph';
import { buildStudentPathOptions } from '../../platform/path/studentPathOptions';
import { curateStudentPanel, resolveChoiceState } from '../../platform/path/studentPanel';
import { fetchPathCoverage } from '../../platform/path/pathCoverageService.js';
import { practisableOptions } from '../../platform/path/recommendedCoverage.js';
import { toneTextColor } from '../../theme/themeColorRoles.js';

// "Recommended for You" — the student's independent path.
//
// This sits BELOW the assigned work on the dashboard, never above it. Teacher
// assignments are the classroom contract; this is what a student does with
// their own time, and the ordering on screen has to say so.
//
// My Math Path is autonomous by default. Teacher pacing is an optional
// override; when it is absent the shared path builder derives timing from the
// district calendar or the class's open assignment TEKS.

const SLOT_STYLE = {
  best: { border: '#1a73e8', background: 'var(--mm-primary-soft)', chip: '#174ea6', mark: '★' },
  strengthen: { border: '#f9ab00', background: 'var(--mm-warning-bg)', chip: '#7a4f00', mark: '↑' },
  choice: { border: 'var(--mm-border)', background: 'var(--mm-surface)', chip: '#3c4043', mark: '◇' },
  challenge: { border: '#137333', background: 'var(--mm-success-bg)', chip: '#137333', mark: '◆' },
  required: { border: '#4a148c', background: 'var(--mm-accent-soft)', chip: '#4a148c', mark: '●' },
};

function SkillCard({ card, label, onChoose, disabled }) {
  if (!card) return null;
  const style = SLOT_STYLE[card.slot] || SLOT_STYLE.choice;
  const evidence = Array.isArray(card.evidence) ? card.evidence : [];
  return (
    <button
      type="button"
      onClick={() => onChoose?.(card)}
      disabled={disabled}
      style={{
        textAlign: 'left', width: '100%', minHeight: 64,
        padding: '13px 15px', borderRadius: 12,
        border: `2px solid ${style.border}`, background: style.background,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
        display: 'block',
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', color: toneTextColor(style.chip), letterSpacing: 0.4 }}>
        <span aria-hidden="true">{style.mark}</span> {label}
      </span>
      <span style={{ display: 'block', fontWeight: 800, color: 'var(--mm-text-strong)', margin: '4px 0 2px', fontSize: 15 }}>
        {card.description || card.title}
      </span>
      {/* WHY, WITH THE EVIDENCE NAMED. The engine's list restates the verdict
          with what drove it — the score and the questions behind it, the class
          unit, what it builds on — so it replaces the one-line reason rather
          than repeating it. A card with no evidence keeps the reason. */}
      {evidence.length ? (
        <span data-recommendation-evidence style={{ display: 'block', color: 'var(--mm-text-muted)', fontSize: 13, lineHeight: 1.5 }}>
          {evidence.map((item) => (
            <span key={`${item.kind}:${item.text}`} style={{ display: 'block' }}>
              <span aria-hidden="true">· </span>{item.text}
            </span>
          ))}
        </span>
      ) : (
        <span style={{ display: 'block', color: 'var(--mm-text-muted)', fontSize: 13, lineHeight: 1.5 }}>{card.reason}</span>
      )}
    </button>
  );
}

export default function RecommendedSkills({
  student,
  assignments = [],
  courseId = 'algebra1',
  pacing = null,
  pathOptions = null,
  teacherOverrides = [],
  requiredSkillIds = [],
  onChooseSkill,
  // The course's coverage index; read here when not given (tests pass one).
  coverage: coverageOverride = undefined,
}) {
  const [showAll, setShowAll] = useState(false);
  // undefined while loading; null when there is no index (fails closed).
  const [loadedCoverage, setLoadedCoverage] = useState(undefined);
  useEffect(() => {
    if (coverageOverride !== undefined) return undefined;
    let cancelled = false;
    setLoadedCoverage(undefined);
    fetchPathCoverage(courseId).then((index) => { if (!cancelled) setLoadedCoverage(index || null); });
    return () => { cancelled = true; };
  }, [courseId, coverageOverride]);
  const coverage = coverageOverride !== undefined ? coverageOverride : loadedCoverage;

  // Prefer the options the caller already evaluated: My Math Path uses the
  // same object, and two evaluations could drift apart between renders. Only
  // skills a student can practise are offered (recommendedCoverage.js).
  const options = useMemo(() => {
    if (coverage === undefined) return null;
    return practisableOptions(pathOptions || buildStudentPathOptions({
      student, assignments, courseId, pacing, teacherOverrides, requiredSkillIds,
    }), coverage);
  }, [coverage, pathOptions, student, assignments, courseId, pacing, teacherOverrides, requiredSkillIds]);

  const panel = useMemo(() => (options ? curateStudentPanel(options) : null), [options]);

  if (!panel || panel.isEmpty) return null;

  const { choiceAllowed, reason } = resolveChoiceState(panel);
  const allSkills = options
    ? [...options.recommended, ...options.priority, ...options.available, ...options.extension]
    : [];

  return (
    <section style={{ marginTop: 28, textAlign: 'left' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 18, color: 'var(--mm-text-strong)' }}>Recommended for you</h3>
      <p style={{ margin: '0 0 14px', color: 'var(--mm-text-muted)', fontSize: 13, lineHeight: 1.55 }}>
        {panel.confidence.message}
        {panel.confidence.level === 'low' && ' MathMaster gets better at this as you work.'}
      </p>

      {!choiceAllowed && (
        <div role="status" style={{ padding: '11px 14px', marginBottom: 14, borderRadius: 10, background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)', fontWeight: 700, fontSize: 13, lineHeight: 1.5 }}>
          {reason}
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {panel.required.map((card) => (
          <SkillCard key={card.skillId} card={card} label="Assigned by your teacher" onChoose={onChooseSkill} />
        ))}
        <SkillCard card={panel.best} label="Best next step" onChoose={onChooseSkill} disabled={!choiceAllowed} />
        <SkillCard card={panel.strengthen} label="Strengthen" onChoose={onChooseSkill} disabled={!choiceAllowed} />
        {panel.choices.map((card) => (
          <SkillCard key={card.skillId} card={card} label="Your choice" onChoose={onChooseSkill} disabled={!choiceAllowed} />
        ))}
        <SkillCard card={panel.challenge} label="Challenge" onChoose={onChooseSkill} disabled={!choiceAllowed} />
      </div>

      {panel.moreCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          style={{ marginTop: 12, minHeight: 44, padding: '9px 14px', borderRadius: 8, border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 800, cursor: 'pointer' }}
          aria-expanded={showAll}
        >
          {showAll ? 'Show fewer' : `See all ${allSkills.length} available skills`}
        </button>
      )}

      {showAll && (
        <ul style={{ marginTop: 12, paddingLeft: 20, lineHeight: 1.7, fontSize: 14 }}>
          {allSkills.map((row) => (
            <li key={row.skillId}>
              <button
                type="button"
                onClick={() => onChooseSkill?.({ skillId: row.skillId, title: describeSkill(row.skillId).studentLabel, slot: 'all' })}
                disabled={!choiceAllowed}
                style={{ border: 0, background: 'none', padding: 0, color: 'var(--mm-primary)', fontWeight: 700, cursor: choiceAllowed ? 'pointer' : 'not-allowed', textAlign: 'left' }}
              >
                {/* `label` is code-prefixed ("A.5A — Solve linear…"), which is
                    the teacher/report form. The student list shows the name of
                    the mathematics. */}
                {describeSkill(row.skillId).studentLabel || describeSkill(row.skillId).description}
              </button>
            </li>
          ))}
        </ul>
      )}

      {panel.pacingIsProvisional && (
        // Honest rather than hidden: the student is not shown jargon, but the
        // claim "this matches what your class is learning" is softened while
        // the underlying calendar is a placeholder.
        <p style={{ marginTop: 12, color: 'var(--mm-text-subtle)', fontSize: 12, lineHeight: 1.5 }}>
          Your teacher is still setting up the course calendar, so these suggestions are a starting point.
        </p>
      )}
    </section>
  );
}
