import { useMemo } from 'react';
import { describeSkill } from '../../platform/path/skillGraph';
import { ASSESSMENT_FRAMEWORKS, FRAMEWORK_LABELS, READINESS, getAssessmentPathOptions } from '../../platform/ccmr/assessmentPathways';
import { getSkillCrosswalk, resolveAlignment } from '../../platform/ccmr/assessmentCrosswalk';
import { getEvidence } from '../../platform/ccmr/assessmentEvidence';
import { getAssessmentStandardReferences } from '../../platform/ccmr/assessmentStandardReferences.js';
import CcmrReferenceList from '../common/CcmrReferenceList.jsx';

// §28 teacher skill inspector, and §29 simulator controls, in one component.
//
// They are the same screen: "what does this skill connect to, and what would
// happen if the student's evidence looked like X". Splitting them would mean
// two places to keep in step with the crosswalk, and they would drift.
//
// Passing `onSimulate` turns the read-only inspector into the simulator's
// control panel. Everything else is identical, which is the point — a teacher
// debugging in the simulator is looking at the same facts they see on a real
// student.

const STATUS_COLOR = {
  [READINESS.TRANSFER_GAP]: '#a50e0e',
  [READINESS.STRENGTHEN]: '#7a4f00',
  [READINESS.STRONG]: '#137333',
  [READINESS.NOT_PRACTICED]: '#174ea6',
  [READINESS.READY]: '#3c4043',
  [READINESS.NOT_AVAILABLE]: '#5f6368',
};

const STATUS_TEXT = {
  [READINESS.TRANSFER_GAP]: 'TRANSFER GAP',
  [READINESS.STRENGTHEN]: 'Strengthen',
  [READINESS.STRONG]: 'Strong',
  [READINESS.NOT_PRACTICED]: 'Not practised',
  [READINESS.READY]: 'Ready',
  [READINESS.NOT_AVAILABLE]: 'Not available',
};

// Enough spread to reach every classification without a slider.
const SIMULATE_LEVELS = [
  { id: 'clear', label: 'Clear', value: null },
  { id: 'weak', label: 'Weak (40%)', value: 0.4 },
  { id: 'mid', label: 'Mixed (70%)', value: 0.7 },
  { id: 'strong', label: 'Strong (90%)', value: 0.9 },
];

export default function AssessmentSkillInspector({
  skillId,
  pathOptions = null,
  assessmentEvidence = {},
  directIndex = null,
  goals = [],
  teacherPriorities = [],
  onSimulate = null,
}) {
  const options = useMemo(() => (skillId ? getAssessmentPathOptions({
    skillId, pathOptions, assessmentEvidence, directIndex, goals, teacherPriorities,
  }) : null), [skillId, pathOptions, assessmentEvidence, directIndex, goals, teacherPriorities]);

  const crosswalk = useMemo(() => (skillId ? getSkillCrosswalk(skillId) : null), [skillId]);

  if (!skillId || !options) {
    return <p style={{ color: '#5f6368', fontSize: 13, margin: 0 }}>Choose a skill to see its assessment connections.</p>;
  }

  return (
    <div>
      <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 13 }}>Core skill</p>
      <p style={{ margin: '0 0 14px', color: '#3c4043', fontSize: 13, lineHeight: 1.5 }}>
        {describeSkill(skillId).label}
        <br />
        <span style={{ color: '#5f6368', fontSize: 12 }}>
          Core mastery: {options.coreMastery == null ? 'no evidence yet' : `${Math.round(options.coreMastery * 100)}%`}
          {' · '}
          Core path status: {options.coreStatus || 'unknown'}
          {options.coreReady ? '' : ' · not mathematically ready'}
        </span>
      </p>

      <p style={{ margin: '0 0 8px', fontWeight: 800, fontSize: 13 }}>Assessment connections</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {ASSESSMENT_FRAMEWORKS.map((framework) => {
          const alignment = resolveAlignment({ skillId, framework, directIndex });
          const pathway = options.pathways.find((entry) => entry.framework === framework);
          const evidence = getEvidence(assessmentEvidence, skillId, framework);
          const color = STATUS_COLOR[pathway?.status] || '#5f6368';
          const references = alignment ? getAssessmentStandardReferences(skillId, framework) : [];

          return (
            <div key={framework} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #dadce0', background: alignment ? '#fff' : '#f8f9fa' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14 }}>{FRAMEWORK_LABELS[framework]}</strong>
                <span style={{ fontSize: 10, fontWeight: 900, padding: '1px 8px', borderRadius: 999, color, border: `1px solid ${color}33`, background: `${color}14` }}>
                  {STATUS_TEXT[pathway?.status] || 'Not available'}
                </span>
              </div>
              <div style={{ color: '#5f6368', fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
                {alignment ? (
                  <>
                    Crosswalk: Yes{alignment.domainTitle ? ` (${alignment.domainTitle})` : ''}
                    {' · '}
                    Direct items available: {alignment.directCapable ? 'Yes' : 'No'}
                    <br />
                    Evidence: {evidence?.directItemsAttempted
                      ? `${evidence.directItemsAttempted} direct item${evidence.directItemsAttempted === 1 ? '' : 's'} · ${Math.round((evidence.proficiency ?? 0) * 100)}%`
                      : evidence?.crosswalkItemsAttempted
                        ? `${evidence.crosswalkItemsAttempted} crosswalk item${evidence.crosswalkItemsAttempted === 1 ? '' : 's'} · course performance only`
                        : 'none'}
                  </>
                ) : (
                  <>Crosswalk: No — this skill is not matched to this assessment, so no pathway is offered.</>
                )}
              </div>

              {alignment && references.length > 0 && (
                <div style={{ marginTop: 9 }}>
                  <div style={{ marginBottom: 6, color: '#3c4043', fontSize: 11.5, fontWeight: 850 }}>
                    Official assessment reference{references.length === 1 ? '' : 's'} shown to students
                  </div>
                  <CcmrReferenceList references={references} compact={false} />
                </div>
              )}

              {onSimulate && alignment && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {SIMULATE_LEVELS.map((level) => (
                    <button
                      key={level.id}
                      type="button"
                      onClick={() => onSimulate({ skillId, framework, proficiency: level.value })}
                      style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #c5d5ef', background: '#fff', color: '#174ea6', fontWeight: 800, fontSize: 11, cursor: 'pointer', minHeight: 32 }}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              )}

              {pathway?.reasonCodes?.length ? (
                <p style={{ margin: '6px 0 0', color: '#80868b', fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-word' }}>
                  {pathway.reasonCodes.join(', ')}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {crosswalk && !Object.keys(crosswalk.frameworks).length && (
        <p style={{ margin: '12px 0 0', color: '#7a4f00', fontSize: 12, lineHeight: 1.55, padding: '9px 11px', background: '#fef7e0', borderRadius: 8 }}>
          This skill has no assessment crosswalk at all. That is a content-authoring gap, not a
          student problem — it appears in the CCMR coverage audit.
        </p>
      )}
    </div>
  );
}
