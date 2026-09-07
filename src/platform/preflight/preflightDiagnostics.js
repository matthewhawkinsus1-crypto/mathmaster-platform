const clean = (value) => String(value ?? '').trim();

const normalizeForCode = (message) => clean(message)
  .replace(/\bSection\s+\d+\s+Question\s+\d+\b/gi, 'Section # Question #')
  .replace(/\bQuestion\s+\d+\b/gi, 'Question #')
  .replace(/\b\d+(?:\.\d+)?\b/g, '#')
  .replace(/\s+/g, ' ')
  .toLowerCase();

// Small deterministic FNV-1a hash. Diagnostic codes should remain stable when
// the same validator finding moves to another question/section or the numeric
// bounds in the message change.
const stableHash = (value) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const questionCount = (section) => (
  Array.isArray(section?.questions) ? section.questions.length : 0
);

const flatIndexForSectionQuestion = (sections, sectionIndex, localQuestionIndex) => {
  if (sectionIndex < 0 || sectionIndex >= sections.length) return null;
  if (localQuestionIndex < 0 || localQuestionIndex >= questionCount(sections[sectionIndex])) return null;
  return sections.slice(0, sectionIndex).reduce((total, section) => total + questionCount(section), 0) + localQuestionIndex;
};

const contextAtFlatIndex = (sections, flatIndex) => {
  if (!Number.isInteger(flatIndex) || flatIndex < 0) return null;
  let cursor = 0;
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    const count = questionCount(section);
    if (flatIndex < cursor + count) {
      const localQuestionIndex = flatIndex - cursor;
      return {
        flatIndex,
        sectionIndex,
        localQuestionIndex,
        section,
        question: section.questions[localQuestionIndex],
      };
    }
    cursor += count;
  }
  return null;
};

export const resolveDiagnosticQuestionContext = (message, sections = []) => {
  const safeSections = Array.isArray(sections) ? sections : [];
  const text = clean(message);
  const sectionMatch = text.match(/\bSection\s+(\d+)\s+Question\s+(\d+)\b/i);
  if (sectionMatch) {
    const sectionIndex = Number(sectionMatch[1]) - 1;
    const localQuestionIndex = Number(sectionMatch[2]) - 1;
    const flatIndex = flatIndexForSectionQuestion(safeSections, sectionIndex, localQuestionIndex);
    return flatIndex == null ? null : contextAtFlatIndex(safeSections, flatIndex);
  }

  const questionMatch = text.match(/\bQuestion\s+(\d+)\b/i);
  if (!questionMatch) return null;
  return contextAtFlatIndex(safeSections, Number(questionMatch[1]) - 1);
};

const stripQuestionPrefix = (message) => clean(message)
  .replace(/^\s*Section\s+\d+\s+Question\s+\d+\s*[:—-]?\s*/i, '')
  .replace(/^\s*Question\s+\d+\s*[:—-]?\s*/i, '')
  .trim();

const candidateField = (message) => {
  const remainder = stripQuestionPrefix(message);
  const match = remainder.match(/^([A-Za-z][A-Za-z0-9_.\[\]-]*)\b/);
  if (!match) return '';
  const candidate = match[1];
  return new Set(['is', 'must', 'cannot', 'should', 'requires', 'has', 'uses']).has(candidate.toLowerCase())
    ? ''
    : candidate;
};

const fieldPathFor = (message, context) => {
  const field = candidateField(message);
  if (!field) return '';
  if (!context) return field;
  return `sections[${context.sectionIndex}].questions[${context.localQuestionIndex}].${field}`;
};

export const buildPreflightDiagnostic = ({
  message,
  severity = 'blocking',
  source = 'preflight',
  sections = [],
  identitySections = null,
  componentId = null,
  issueKind = 'assignmentIssue',
} = {}) => {
  const text = clean(message);
  if (!text) return null;
  const safeSections = Array.isArray(sections) ? sections : [];
  const context = resolveDiagnosticQuestionContext(text, safeSections);
  const identityContext = context && Array.isArray(identitySections)
    ? contextAtFlatIndex(identitySections, context.flatIndex)
    : null;
  const question = context?.question || identityContext?.question || null;
  const identityQuestion = identityContext?.question || question;
  const section = context?.section || identityContext?.section || null;
  const identitySection = identityContext?.section || section;
  const normalizedSource = clean(source) || 'preflight';

  return {
    severity: String(severity || 'blocking').toLowerCase() === 'warning' ? 'warning' : 'blocking',
    source: normalizedSource,
    code: `${normalizedSource}.${stableHash(normalizeForCode(text))}`,
    message: text,
    repairRequirement: stripQuestionPrefix(text) || text,
    questionIndex: context?.flatIndex ?? null,
    questionNumber: context ? context.flatIndex + 1 : null,
    questionId: clean(identityQuestion?.questionId || question?.questionId) || null,
    sectionId: clean(identitySection?.id || identitySection?.sectionId || section?.id || section?.sectionId) || null,
    fieldPath: fieldPathFor(text, context),
    componentId: clean(componentId) || null,
    issueKind: ['assignmentIssue', 'platformIssue', 'unclear'].includes(issueKind) ? issueKind : 'unclear',
  };
};

export const buildPreflightDiagnostics = ({
  groups = [],
  sections = [],
  identitySections = null,
} = {}) => {
  const diagnostics = [];
  (Array.isArray(groups) ? groups : []).forEach((group) => {
    (Array.isArray(group?.messages) ? group.messages : []).forEach((message) => {
      const diagnostic = buildPreflightDiagnostic({
        message,
        severity: group.severity,
        source: group.source,
        sections,
        identitySections,
        componentId: group.componentId,
        issueKind: group.issueKind,
      });
      if (diagnostic) diagnostics.push(diagnostic);
    });
  });

  const seen = new Set();
  return diagnostics.filter((entry) => {
    const key = [entry.severity, entry.source, entry.message, entry.questionId || entry.questionIndex || '', entry.sectionId || ''].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export default buildPreflightDiagnostics;
