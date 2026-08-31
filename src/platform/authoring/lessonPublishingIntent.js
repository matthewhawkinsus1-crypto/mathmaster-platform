const clean = (value) => String(value ?? '').trim();
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const slugFile = (value, fallback = 'MathMaster_Notes.pdf') => {
  const cleaned = clean(value)
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = cleaned || fallback.replace(/\.pdf$/i, '');
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
};

export const topicNameFromFolder = (folder, title = 'Lesson') => {
  const parts = clean(folder).split('/').map(clean).filter(Boolean);
  if (parts.length >= 3) return `${parts[1]} • ${parts[2]}`;
  if (parts.length === 2) return parts[1];
  return clean(title) || 'Lesson';
};

const normalizeResourceMode = (value) => {
  const token = clean(value).toLowerCase();
  if (['attach', 'assignment', 'attachtoassignment', 'insideassignment'].includes(token)) return 'attachToAssignment';
  if (['none', 'off', 'disabled'].includes(token)) return 'none';
  return 'separateMaterial';
};

const normalizeSection = (section, index) => {
  const source = isObject(section) ? section : { content: section };
  const content = asArray(source.content ?? source.body ?? source.text)
    .map((entry) => clean(entry))
    .filter(Boolean);
  const equations = asArray(source.equations ?? source.math ?? source.formulas)
    .map((entry) => clean(entry))
    .filter(Boolean);
  const bullets = asArray(source.bullets ?? source.points)
    .map((entry) => clean(entry))
    .filter(Boolean);
  const worked = isObject(source.workedExample) ? {
    title: clean(source.workedExample.title || 'Worked Example'),
    problem: clean(source.workedExample.problem),
    steps: asArray(source.workedExample.steps).map((entry) => clean(entry)).filter(Boolean),
    answer: clean(source.workedExample.answer),
    answerLatex: clean(source.workedExample.answerLatex),
  } : null;
  return {
    id: clean(source.id) || `section-${index + 1}`,
    heading: clean(source.heading || source.title),
    content,
    bullets,
    equations,
    workedExample: worked && (worked.problem || worked.steps.length || worked.answer || worked.answerLatex) ? worked : null,
    callout: clean(source.callout),
  };
};

export const normalizeNotesPdfIntent = (raw, assignment = {}) => {
  const source = isObject(raw) ? raw : {};
  const title = clean(source.title) || `${clean(assignment.title) || 'Lesson'} — Student Notes`;
  const targetPages = Number(source.targetPages) === 1 ? 1 : 2;
  const sections = asArray(source.sections).map(normalizeSection).filter((section) => (
    section.heading || section.content.length || section.bullets.length || section.equations.length || section.workedExample || section.callout
  ));
  const hasAuthoredContent = sections.length > 0;
  return {
    // Missing notes metadata means "no notes", not "publish a placeholder".
    // Authored sections may opt an older V5 package in even if it omitted the
    // explicit enabled flag, but an empty object can never create a blank PDF.
    enabled: source.enabled === true || (source.enabled == null && hasAuthoredContent),
    title,
    fileName: slugFile(source.fileName || title),
    targetPages,
    subtitle: clean(source.subtitle),
    learningGoal: clean(source.learningGoal || source.objective),
    includeAnswerKey: false,
    sections,
    footer: clean(source.footer) || 'MathMaster • Student Notes',
  };
};

export const normalizeClassroomIntent = (raw, assignment = {}, notesPdf = null) => {
  const source = isObject(raw) ? raw : {};
  const assignmentPost = isObject(source.assignmentPost) ? source.assignmentPost : {};
  const resourcesPost = isObject(source.resourcesPost) ? source.resourcesPost : {};
  const gradePassback = isObject(source.gradePassback) ? source.gradePassback : {};
  const topic = isObject(source.topic) ? source.topic : {};
  const assignmentTitle = clean(assignmentPost.title) || clean(assignment.title) || 'MathMaster Lesson';
  const topicName = clean(topic.name) || topicNameFromFolder(assignment.folder, assignmentTitle);
  const resourcesEnabled = resourcesPost.enabled !== false && notesPdf?.enabled !== false;
  return {
    enabled: source.enabled !== false,
    topic: {
      name: topicName,
      createIfMissing: topic.createIfMissing !== false,
    },
    assignmentPost: {
      title: assignmentTitle,
      instructions: clean(assignmentPost.instructions)
        || `Complete “${assignmentTitle}” in MathMaster. Open the MathMaster link, complete every assigned section, and submit your work there.`,
      maxPoints: 100,
      attachMathMasterLink: assignmentPost.attachMathMasterLink !== false,
      publishMode: ['draft', 'scheduled', 'whenassigned'].includes(clean(assignmentPost.publishMode).toLowerCase())
        ? clean(assignmentPost.publishMode).toLowerCase()
        : 'whenAssigned',
    },
    resourcesPost: {
      enabled: resourcesEnabled,
      postingMode: normalizeResourceMode(resourcesPost.postingMode),
      title: clean(resourcesPost.title) || `${assignmentTitle} — Notes & Resources`,
      description: clean(resourcesPost.description)
        || `Use these notes and reference materials during ${assignmentTitle} and for review.`,
    },
    gradePassback: {
      enabled: gradePassback.enabled !== false,
      when: 'finalized',
      mode: 'assignedGrade',
    },
    additionalLinks: asArray(source.additionalLinks)
      .filter(isObject)
      .map((link) => ({ title: clean(link.title), url: clean(link.url) }))
      .filter((link) => link.title && /^https?:\/\//i.test(link.url))
      .slice(0, 10),
  };
};

export const normalizeLessonPublishingIntentV5 = (input = {}, assignment = {}, repairs = []) => {
  const resourceSource = isObject(input.lessonResources) ? input.lessonResources : {};
  const rawNotes = resourceSource.notesPdf || resourceSource.notes || {};
  const notesPdf = normalizeNotesPdfIntent(rawNotes, assignment);
  const classroom = normalizeClassroomIntent(input.classroom, assignment, notesPdf);

  if (!isObject(input.classroom)) repairs.push('generated Google Classroom publishing metadata from the assignment title/folder');
  if (!isObject(rawNotes) || !Array.isArray(rawNotes.sections)) {
    repairs.push('created the lesson-notes PDF plan; author structured notes sections for a richer student handout');
  }

  return {
    classroomPackage: classroom,
    lessonResources: {
      notesPdf,
    },
  };
};

export const validateLessonPublishingIntent = ({ classroomPackage, lessonResources } = {}) => {
  const errors = [];
  const warnings = [];
  const notes = lessonResources?.notesPdf;
  if (notes?.enabled) {
    if (![1, 2].includes(Number(notes.targetPages))) errors.push('notesPdf.targetPages must be 1 or 2.');
    if (!Array.isArray(notes.sections) || notes.sections.length === 0) {
      errors.push('The notes PDF is enabled but has no authored sections. Author the student notes before publishing, or turn lesson notes off.');
    }
    const wordEstimate = (notes.sections || []).reduce((total, section) => {
      const text = [section.heading, ...(section.content || []), ...(section.bullets || []), section.callout,
        ...(section.equations || []), section.workedExample?.problem, ...(section.workedExample?.steps || []), section.workedExample?.answer]
        .filter(Boolean).join(' ');
      return total + text.split(/\s+/).filter(Boolean).length;
    }, 0);
    const softLimit = Number(notes.targetPages) === 1 ? 360 : 760;
    if (wordEstimate > softLimit) warnings.push(`The notes PDF is about ${wordEstimate} words; shorten it to keep the handout near ${notes.targetPages} page(s).`);
  }
  if (classroomPackage?.enabled && !clean(classroomPackage?.topic?.name)) errors.push('Classroom topic name is missing.');
  return { errors, warnings };
};
