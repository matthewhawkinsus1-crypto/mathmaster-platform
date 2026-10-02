// One "Simplify" fraction question made three ways, shared by the harness
// (fractionTemplateGradingMain.jsx) and the gate (fractionTemplateGrading.mjs)
// so that both draw exactly the same version for a seat.
//
//   family    an assignment-local Question Family (#414)
//   template  the same Path-style template on a slot without the opt-in
//   authored  a key the author wrote, 2/4: the author's own rule applies
export const ASSIGNMENT_ID = 'asg-fraction-template';

const simplifyTemplate = () => ({
  id: 'q-simplify',
  type: 'fraction',
  prompt: 'Simplify {{an}}/{{bn}}.',
  answer: '{{a}}/{{b}}',
  generator: {
    parameters: { a: { type: 'int', min: 1, max: 3 }, b: { type: 'int', min: 2, max: 6 }, k: { type: 'int', min: 2, max: 3 } },
    derived: { an: 'a*k', bn: 'b*k' },
    constraints: ['a < b'],
  },
});

export const questionFor = (kind) => {
  if (kind === 'family') return { ...simplifyTemplate(), questionFamily: { scope: 'assignment' } };
  if (kind === 'template') return simplifyTemplate();
  return { id: 'q-authored', type: 'fraction', prompt: 'Simplify 4/8.', answer: '2/4' };
};

// The App's generation key for one student's first question.
export const generationKeyFor = (seat) => `${ASSIGNMENT_ID}|student-${seat}|0|variant:0`;

export const familyContextFor = (kind) => (kind === 'family' ? { assignmentId: ASSIGNMENT_ID, storageIndex: 0, variant: 0 } : null);
