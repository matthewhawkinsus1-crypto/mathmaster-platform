import { useMemo, useState } from 'react';
import { getAssessmentPathOptions, READINESS } from '../../platform/ccmr/assessmentPathways';
import { referenceLabel } from '../../platform/ccmr/assessmentStandardReferences.js';
import CcmrReferenceList from '../common/CcmrReferenceList.jsx';
import { resolveAssessmentPracticeStage } from '../../platform/ccmr/assessmentFidelity.js';

// "Practice This Skill As…" is now gated by the active secure bank, not by a
// crosswalk alone. A legitimate mathematical connection can still be shown in
// the CCMR explorer, but this menu only offers a door the server can open.

const STATUS_NOTE = {
  [READINESS.TRANSFER_GAP]: { text: 'Worth a look', color: '#a50e0e', background: '#fce8e6' },
  [READINESS.STRENGTHEN]: { text: 'Keep working', color: '#7a4f00', background: '#fef7e0' },
  [READINESS.STRONG]: { text: 'Going well', color: '#137333', background: '#e6f4ea' },
  [READINESS.CHALLENGE_READY]: { text: 'Challenge ready', color: '#5b21b6', background: '#f3ecfd' },
  [READINESS.MAINTENANCE]: { text: 'Challenge complete', color: '#137333', background: '#e6f4ea' },
  [READINESS.NOT_PRACTICED]: { text: 'New', color: '#174ea6', background: '#e8f0fe' },
  [READINESS.READY]: { text: 'Ready', color: '#3c4043', background: '#f1f3f4' },
};

export default function PracticeAsMenu({
  skillId,
  pathOptions = null,
  assessmentEvidence = {},
  directIndex = null,
  coverage = undefined,
  goals = [],
  teacherPriorities = [],
  activeFramework = 'course',
  onChoose,
}) {
  const [expandedFramework, setExpandedFramework] = useState(null);
  const options = useMemo(() => getAssessmentPathOptions({
    skillId, pathOptions, assessmentEvidence, directIndex, coverage, goals, teacherPriorities,
  }), [skillId, pathOptions, assessmentEvidence, directIndex, coverage, goals, teacherPriorities]);

  const available = options.availablePathways;
  if (!available.length) return null;

  const choose = (framework) => onChoose?.({ skillId, framework });

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4, color: '#5f6368' }}>
        {options.masteredAndBranchable ? 'Apply your mastery' : 'Practice this skill as…'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
        <button
          type="button"
          onClick={() => choose('course')}
          style={{
            textAlign: 'left', padding: '11px 13px', borderRadius: 10, minHeight: 70,
            border: `2px solid ${activeFramework === 'course' ? '#1a73e8' : '#dadce0'}`,
            background: activeFramework === 'course' ? '#e8f0fe' : '#fff', cursor: 'pointer',
          }}
        >
          <span style={{ display: 'block', fontWeight: 800, color: '#202124', fontSize: 14 }}>Course Practice</span>
          <span style={{ display: 'block', color: '#5f6368', fontSize: 12, marginTop: 2 }}>The usual way this skill appears in class.</span>
        </button>

        {available.map((pathway) => {
          const note = STATUS_NOTE[pathway.status] || STATUS_NOTE[READINESS.READY];
          const primary = pathway.references?.[0] || null;
          const expanded = expandedFramework === pathway.framework;
          const stage = pathway.practiceStage || resolveAssessmentPracticeStage(pathway.evidence);
          return (
            <div key={pathway.framework} style={{ border: `2px solid ${activeFramework === pathway.framework ? '#1a73e8' : '#dadce0'}`, borderRadius: 10, background: activeFramework === pathway.framework ? '#e8f0fe' : '#fff', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => choose(pathway.framework)}
                style={{ width: '100%', textAlign: 'left', padding: '11px 13px', minHeight: 76, border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, color: '#202124', fontSize: 14 }}>{pathway.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 900, padding: '1px 7px', borderRadius: 999, color: note.color, background: note.background }}>
                    {note.text}
                  </span>
                </span>
                <span style={{ display: 'block', color: '#5f6368', fontSize: 12, marginTop: 2 }}>{pathway.blurb}</span>
                {primary && (
                  <span style={{ display: 'block', color: '#5b21b6', fontSize: 11.5, marginTop: 5, fontWeight: 850 }}>
                    {referenceLabel(primary)}
                  </span>
                )}
                <span style={{ display: 'block', color: '#3c4043', fontSize: 11, marginTop: 4, fontWeight: 700 }}>
                  {pathway.practised && pathway.proficiency != null
                    ? `${Math.round(pathway.proficiency * 100)}% in this format`
                    : 'Not practised in this format yet'}
                </span>
                <span style={{ display: 'block', color: pathway.status === READINESS.MAINTENANCE ? '#137333' : '#5b21b6', fontSize: 11, marginTop: 4, fontWeight: 850 }}>
                  {stage.actionLabel}
                </span>
              </button>
              {pathway.references?.length > 0 && (
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    type="button"
                    onClick={() => setExpandedFramework(expanded ? null : pathway.framework)}
                    style={{ padding: 0, border: 0, background: 'transparent', color: '#174ea6', fontSize: 11.5, fontWeight: 850, cursor: 'pointer' }}
                  >
                    {expanded ? 'Hide standard connection' : 'See standard connection'}
                  </button>
                  {expanded && <div style={{ marginTop: 7 }}><CcmrReferenceList references={pathway.references} compact={false} /></div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
