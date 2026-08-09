import { useMemo, useState } from 'react';
import { describeSkill } from '../../platform/path/skillGraph';
import { buildStudentPathOptions } from '../../platform/path/studentPathOptions';
import { curateStudentPanel, resolveChoiceState } from '../../platform/path/studentPanel';

// "Recommended for You" — the student's independent path.
//
// This sits BELOW the assigned work on the dashboard, never above it. Teacher
// assignments are the classroom contract; this is what a student does with
// their own time, and the ordering on screen has to say so.
//
// The panel does not appear at all until the teacher has set a pacing position
// for the class. Before that the skill-to-window map is a placeholder, and
// recommending from a placeholder calendar would be worse than recommending
// nothing — a student would be told "your class is learning this" when nobody
// had said what the class was learning.

const SLOT_STYLE = {
  best: { border: '#1a73e8', background: '#e8f0fe', chip: '#174ea6', mark: '★' },
  strengthen: { border: '#f9ab00', background: '#fef7e0', chip: '#7a4f00', mark: '↑' },
  choice: { border: '#dadce0', background: '#fff', chip: '#3c4043', mark: '◇' },
  challenge: { border: '#137333', background: '#e6f4ea', chip: '#137333', mark: '◆' },
  required: { border: '#4a148c', background: '#f5edfc', chip: '#4a148c', mark: '●' },
};

function SkillCard({ card, label, onChoose, disabled }) {
  if (!card) return null;
  const style = SLOT_STYLE[card.slot] || SLOT_STYLE.choice;
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
      <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', color: style.chip, letterSpacing: 0.4 }}>
        <span aria-hidden="true">{style.mark}</span> {label}
      </span>
      <span style={{ display: 'block', fontWeight: 800, color: '#202124', margin: '4px 0 2px', fontSize: 15 }}>
        {card.description || card.title}
      </span>
      <span style={{ display: 'block', color: '#5f6368', fontSize: 13, lineHeight: 1.5 }}>{card.reason}</span>
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
}) {
  const [showAll, setShowAll] = useState(false);

  // Prefer the options the caller already evaluated: My Math Path uses the
  // same object, and two evaluations could drift apart between renders.
  const options = useMemo(() => (
    pathOptions || buildStudentPathOptions({
      student, assignments, courseId, pacing, teacherOverrides, requiredSkillIds,
    })
  ), [pathOptions, student, assignments, courseId, pacing, teacherOverrides, requiredSkillIds]);

  const panel = useMemo(() => (options ? curateStudentPanel(options) : null), [options]);

  // No pacing set by the teacher means no honest recommendation to make.
  if (!pacing || !panel || panel.isEmpty) return null;

  const { choiceAllowed, reason } = resolveChoiceState(panel);
  const allSkills = options
    ? [...options.recommended, ...options.priority, ...options.available, ...options.extension]
    : [];

  return (
    <section style={{ marginTop: 28, textAlign: 'left' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 18, color: '#202124' }}>Recommended for you</h3>
      <p style={{ margin: '0 0 14px', color: '#5f6368', fontSize: 13, lineHeight: 1.55 }}>
        {panel.confidence.message}
        {panel.confidence.level === 'low' && ' MathMaster gets better at this as you work.'}
      </p>

      {!choiceAllowed && (
        <div role="status" style={{ padding: '11px 14px', marginBottom: 14, borderRadius: 10, background: '#f5edfc', color: '#4a148c', fontWeight: 700, fontSize: 13, lineHeight: 1.5 }}>
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
          style={{ marginTop: 12, minHeight: 44, padding: '9px 14px', borderRadius: 8, border: '1px solid #c5d5ef', background: '#fff', color: '#174ea6', fontWeight: 800, cursor: 'pointer' }}
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
                onClick={() => onChooseSkill?.({ skillId: row.skillId, title: describeSkill(row.skillId).shortLabel, slot: 'all' })}
                disabled={!choiceAllowed}
                style={{ border: 0, background: 'none', padding: 0, color: '#1a73e8', fontWeight: 700, cursor: choiceAllowed ? 'pointer' : 'not-allowed', textAlign: 'left' }}
              >
                {describeSkill(row.skillId).label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {panel.pacingIsProvisional && (
        // Honest rather than hidden: the student is not shown jargon, but the
        // claim "this matches what your class is learning" is softened while
        // the underlying calendar is a placeholder.
        <p style={{ marginTop: 12, color: '#80868b', fontSize: 12, lineHeight: 1.5 }}>
          Your teacher is still setting up the course calendar, so these suggestions are a starting point.
        </p>
      )}
    </section>
  );
}
