/*
 * The one line a teacher reads about why this student got this question.
 *
 * Shared because the deadline finalizer writes evidence on the SERVER from its
 * own grading result, and evidence carries this sentence. A second copy in
 * functions/ would drift from what the results screen shows.
 */
export const REASON_TEXT = Object.freeze({
  assessment_rigor_is_the_same_for_every_student: 'Assessment — same rigor for every student.',
  shared_question: 'Shared question — everyone saw this exact item.',
  same_task_different_numbers: 'Same task, different numbers.',
  adaptation_turned_off_for_this_question: 'Adaptation is off for this question.',
  not_enough_evidence_to_adapt_yet: 'Not enough evidence about this student yet — they got what you assigned.',
  this_student_is_already_at_the_assigned_level: 'This student is already working at the assigned level.',
  not_yet_holding_at_any_complexity: 'Not yet holding at any complexity — pitched to the most accessible version you allowed.',
  pitched_to_this_student_s_working_complexity: 'Pitched to the complexity this student is currently holding.',
  recent_miss_at_higher_complexity_on_this_standard: 'Recent miss on this standard at a higher complexity — retried lower before concluding anything.',
  reasoning_evidence_supports_more_depth: 'Strong reasoning evidence — same complexity, more demanding thinking.',
});

/**
 * One line a teacher can read on a results screen.
 *
 * "If two students receive different adaptive Practice, the teacher must be
 * able to see why." Not a log line, and not a score: a sentence.
 */
export const describeAdaptation = (target) => {
  if (!target) return '';
  const text = REASON_TEXT[target.reason] || String(target.reason || '').replace(/_/g, ' ');
  if (!target.adapted) return text;
  return `Assigned DOK ${target.assignedDok} · Band ${target.assignedBand} → received DOK ${target.dok} · Band ${target.difficultyBand}. ${text}`;
};

/**
 * The record stored alongside a delivered question, so the reason survives long
 * after the session that produced it.
 */
