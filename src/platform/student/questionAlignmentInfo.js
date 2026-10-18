import { getTexasStandard, normalizeTeksCode } from '../../texasStandards.js';
import { toDisplayCode } from '../../utils/teksUtils.js';
import { FRAMEWORK_LABELS, getSkillCrosswalk } from '../ccmr/assessmentCrosswalk.js';
import { EXAM_DOMAIN_REGISTRY } from '../assessment/examDomainRegistry.js';
import { studentLabelForTeks } from '../path/skillLabels.js';
import { getAssessmentStandardReferences } from '../ccmr/assessmentStandardReferences.js';
import { cleanFramework } from './questionAssessmentFramework.js';

// Moved to ./questionAssessmentFramework.js, which the assignment's question
// navigator imports without this module's standards references.
export { questionAssessmentFramework } from './questionAssessmentFramework.js';

export const buildQuestionAlignmentInfo = ({ code, framework = null, domainId = null, examStyle = false, assessmentSkillLabel = '' } = {}) => {
  const normalized = normalizeTeksCode(String(code || '').replace(/^texas:/i, ''));
  if (!normalized) return null;
  const standard = getTexasStandard(normalized);
  if (!standard) return null;

  const crosswalk = getSkillCrosswalk(normalized);
  const examFramework = examStyle ? cleanFramework(framework) : null;
  const connections = Object.entries(crosswalk.frameworks || {}).map(([id, entry]) => {
    const requestedDomain = id === examFramework && String(domainId || '').trim()
      ? String(domainId).trim()
      : null;
    const allowedDomainIds = Array.isArray(entry.domainIds) && entry.domainIds.length ? entry.domainIds : [entry.domainId].filter(Boolean);
    const activeDomainId = requestedDomain && allowedDomainIds.includes(requestedDomain) ? requestedDomain : (entry.domainId || '');
    const activeDomain = (EXAM_DOMAIN_REGISTRY[id] || []).find((candidate) => candidate.id === activeDomainId);
    const references = getAssessmentStandardReferences(normalized, id);
    const directSkill = id === examFramework ? String(assessmentSkillLabel || '').trim() : '';
    const normalizedDirectSkill = directSkill.toLowerCase();
    const orderedReferences = normalizedDirectSkill
      ? [...references].sort((left, right) => {
          const leftMatch = String(left?.title || '').trim().toLowerCase() === normalizedDirectSkill ? 1 : 0;
          const rightMatch = String(right?.title || '').trim().toLowerCase() === normalizedDirectSkill ? 1 : 0;
          return rightMatch - leftMatch;
        })
      : references;
    return {
      framework: id,
      label: FRAMEWORK_LABELS[id] || id,
      domainId: activeDomainId,
      domainTitle: activeDomain?.title || (activeDomainId === entry.domainId ? entry.domainTitle : '') || activeDomainId,
      coverage: entry.coverage || 'full',
      allowedAspects: Array.isArray(entry.allowedAspects) ? entry.allowedAspects : [],
      excludedAspects: Array.isArray(entry.excludedAspects) ? entry.excludedAspects : [],
      active: id === examFramework,
      references: orderedReferences,
    };
  });

  return {
    code: normalized,
    displayCode: toDisplayCode(normalized) || normalized,
    course: standard.course || '',
    strandLabel: standard.strandLabel || '',
    studentLabel: studentLabelForTeks(normalized) || standard.description || '',
    description: standard.description || '',
    classification: standard.classification || '',
    activeFramework: examFramework,
    activeFrameworkLabel: examFramework ? (FRAMEWORK_LABELS[examFramework] || examFramework) : '',
    activeSkillLabel: examFramework && String(assessmentSkillLabel || '').trim()
      ? String(assessmentSkillLabel).trim().replace(/^./, (character) => character.toUpperCase())
      : '',
    isExamStyle: Boolean(examFramework),
    connections,
  };
};
