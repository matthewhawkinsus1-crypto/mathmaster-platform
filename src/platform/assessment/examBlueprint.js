import { EXAM_DOMAIN_REGISTRY, mapTEKSToExamDomains } from './examDomainRegistry.js';
import { toDisplayCode } from '../../utils/teksUtils.js';

const questionDomain = (question, examType) => {
  const explicit = Array.isArray(question?.examDomains) ? question.examDomains.find((entry) => entry?.examType === examType) : null;
  if (explicit?.domainId) return explicit.domainId;
  const alignments = question?.teks || question?.alignmentKeys || question?.standards?.primary || [];
  for (const value of Array.isArray(alignments) ? alignments : [alignments]) {
    const code = toDisplayCode(value?.code || value);
    const mapping = mapTEKSToExamDomains(code)[examType];
    if (mapping?.domainId) return mapping.domainId;
  }
  return null;
};

export const calculateDomainQuotas = (examType, totalQuestions) => {
  const domains = EXAM_DOMAIN_REGISTRY[examType] || [];
  const total = Math.max(1, Math.round(Number(totalQuestions) || 1));
  const raw = domains.map((domain) => ({ domainId: domain.id, exact: domain.weight * total, count: Math.floor(domain.weight * total) }));
  let remaining = total - raw.reduce((sum, item) => sum + item.count, 0);
  raw.sort((left, right) => (right.exact - right.count) - (left.exact - left.count) || left.domainId.localeCompare(right.domainId));
  for (let index = 0; remaining > 0 && raw.length; index = (index + 1) % raw.length, remaining -= 1) raw[index].count += 1;
  return Object.fromEntries(raw.map((item) => [item.domainId, item.count]));
};

export const buildExamBlueprint = ({ examType, questionBank = [], totalQuestions = 20 } = {}) => {
  const quotas = calculateDomainQuotas(examType, totalQuestions);
  const used = new Set();
  const selected = [];
  Object.entries(quotas).forEach(([domainId, count]) => {
    questionBank.filter((question) => questionDomain(question, examType) === domainId).slice().sort((a, b) => String(a.questionId || a.id || '').localeCompare(String(b.questionId || b.id || ''))).slice(0, count).forEach((question) => {
      const id = String(question.questionId || question.id || selected.length);
      if (!used.has(id)) { used.add(id); selected.push({ question, domainId }); }
    });
  });
  if (selected.length < totalQuestions) {
    questionBank.slice().sort((a, b) => String(a.questionId || a.id || '').localeCompare(String(b.questionId || b.id || ''))).forEach((question) => {
      if (selected.length >= totalQuestions) return;
      const id = String(question.questionId || question.id || selected.length);
      if (!used.has(id)) { used.add(id); selected.push({ question, domainId: questionDomain(question, examType) }); }
    });
  }
  return { examType, requestedQuestions: Number(totalQuestions), selectedQuestions: selected, quotas, complete: selected.length >= Number(totalQuestions), shortage: Math.max(0, Number(totalQuestions) - selected.length) };
};

