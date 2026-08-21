import React, { useMemo } from 'react';
import { getTexasStandard, normalizeTeksCode } from '../../texasStandards';
import { toDisplayCode } from '../../utils/teksUtils.js';
import { FRAMEWORK_LABELS, getSkillCrosswalk } from '../../platform/ccmr/assessmentCrosswalk.js';

// Which standard a question is, and which tests it counts toward.
//
// MathMaster deliberately keeps raw TEKS identifiers out of the prose a
// fifteen-year-old reads about their own afternoon — "A.2(B)" is a reporting
// code, not a skill. But that is an argument about SENTENCES, not about
// metadata, and it left two real gaps:
//
//   - A student practising for the SAT was given a question with nothing on
//     screen saying which standard it was, or that it was CCMR practice at all.
//   - A CCMR-aligned question inside an ordinary assignment looked exactly like
//     every other question, so nobody could tell it was doing double duty.
//
// So the code lives here, in a chip beside the question rather than in a
// sentence inside it, next to the thing a student actually cares about: this
// one counts for the SAT.
//
// It states nothing it cannot source. The framework list comes from the
// authored per-standard crosswalk (teksExamCrosswalk.js); a standard nobody has
// mapped shows its code and no assessments, rather than a guess.

const CHIP = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 9px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '.02em',
  lineHeight: 1.6,
};

const STANDARD_CHIP = { ...CHIP, background: '#eef3fb', color: '#174ea6' };
const CCMR_CHIP = { ...CHIP, background: '#f3ecfd', color: '#5b21b6' };
const ACTIVE_CHIP = { ...CHIP, background: '#5b21b6', color: '#fff' };

/**
 * @param code       a TEKS code or canonical skill id
 * @param framework  the assessment being practised for, when there is one
 * @param showName   include the standard's short description
 */
export default function StandardBadge({
  code,
  framework = null,
  showName = false,
  style = {},
}) {
  const resolved = useMemo(() => {
    const normalized = normalizeTeksCode(String(code || '').replace(/^texas:/i, ''));
    if (!normalized) return null;
    const standard = getTexasStandard(normalized);
    const crosswalk = getSkillCrosswalk(normalized);
    const frameworks = Object.keys(crosswalk.frameworks || {});
    return {
      display: toDisplayCode(normalized) || normalized,
      description: standard?.description || '',
      frameworks,
      domainTitle: framework ? crosswalk.frameworks?.[framework]?.domainTitle || '' : '',
    };
  }, [code, framework]);

  if (!resolved) return null;

  // The assessment being practised for leads, and the others follow — a student
  // in an SAT session should see the SAT first.
  const others = resolved.frameworks.filter((entry) => entry !== framework);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, ...style }}>
      <span style={STANDARD_CHIP}>TEKS {resolved.display}</span>
      {showName && resolved.description && (
        <span style={{ fontSize: 12, color: '#5f6368', lineHeight: 1.5 }}>{resolved.description}</span>
      )}
      {framework && resolved.frameworks.includes(framework) && (
        <span style={ACTIVE_CHIP}>
          {FRAMEWORK_LABELS[framework] || framework}
          {resolved.domainTitle ? ` · ${resolved.domainTitle}` : ''}
        </span>
      )}
      {others.length > 0 && (
        <span style={CCMR_CHIP}>
          {framework ? 'Also counts for ' : 'College & career ready · '}
          {others.map((entry) => FRAMEWORK_LABELS[entry] || entry).join(' · ')}
        </span>
      )}
    </div>
  );
}

/** Whether a standard is aligned to any college/career/military assessment. */
export const standardIsCcmrAligned = (code) => {
  const normalized = normalizeTeksCode(String(code || '').replace(/^texas:/i, ''));
  if (!normalized) return false;
  return Object.keys(getSkillCrosswalk(normalized).frameworks || {}).length > 0;
};
