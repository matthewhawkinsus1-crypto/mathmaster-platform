import { ACTIVITY_ROLES, getEffectiveActivityPolicy } from '../policies/activityPolicies.js';
import { generateStableId, stableStringify } from '../../utils/idUtils.js';

export const PUBLICATION_STRATEGIES = Object.freeze({
  HYBRID: 'hybrid',
  BUNDLE: 'bundle',
  SPLIT: 'split',
});

const VALID_STRATEGIES = new Set(Object.values(PUBLICATION_STRATEGIES));
const ASSESSMENT_ROLES = new Set([ACTIVITY_ROLES.QUIZ, ACTIVITY_ROLES.TEST]);

const assignmentV5PublicationView = (assignmentV5) => {
  if (!assignmentV5 || typeof assignmentV5 !== 'object' || Array.isArray(assignmentV5)) return null;
  const sections = Array.isArray(assignmentV5.sections) ? assignmentV5.sections : [];
  const bundleId = String(
    assignmentV5.assignment?.assignmentKey
    || assignmentV5.assignment?.id
    || generateStableId(
      'assignment-v5',
      assignmentV5.assignment?.courseId || '',
      assignmentV5.assignment?.title || '',
      stableStringify(sections.map((section) => ({ id: section.id, role: section.role, title: section.title }))),
    ),
  );
  return {
    bundleId,
    lessonMetadata: { title: assignmentV5.assignment?.title || 'Untitled Assignment' },
    activities: sections.map((section, index) => ({
      ...section,
      activityId: String(section.id || `section-${index + 1}`),
      sectionId: String(section.id || `section-${index + 1}`),
    })),
    sourceKind: 'assignmentV5',
  };
};


const datesRepresentSameMoment = (left, right) => {
  if (!left || !right) return left === right;
  const leftMs = new Date(left).getTime();
  const rightMs = new Date(right).getTime();
  if (Number.isFinite(leftMs) && Number.isFinite(rightMs)) return leftMs === rightMs;
  return String(left) === String(right);
};

const postForActivities = ({ lessonBundle, kind, activities, dueDate, title, description }) => {
  if (!activities.length) return null;
  const roles = [...new Set(activities.map((activity) => activity.role))];
  const singleRolePolicy = roles.length === 1 ? getEffectiveActivityPolicy(roles[0]) : null;
  return {
    postId: generateStableId('post', lessonBundle.bundleId, kind, ...activities.map((activity) => activity.activityId)),
    kind,
    title,
    description,
    dueDate: dueDate || null,
    maxPoints: singleRolePolicy?.grading?.pointsPossible ?? 100,
    gradingMode: singleRolePolicy?.grading?.mode || 'composite',
    activities,
    sourceActivityIds: activities.map((activity) => activity.activityId),
    activityChain: activities.map((activity) => activity.role),
    isComposite: activities.length > 1 || roles.length > 1,
  };
};

const lessonTitle = (lessonBundle) => lessonBundle?.lessonMetadata?.title || 'Untitled Lesson';

const separateAssessmentPosts = (lessonBundle, activities, mainDueDate) => activities
  .filter((activity) => ASSESSMENT_ROLES.has(activity.role))
  .map((activity) => postForActivities({
    lessonBundle,
    kind: activity.role,
    activities: [activity],
    dueDate: mainDueDate,
    title: `${lessonTitle(lessonBundle)} — ${activity.title}`,
    description: `Complete ${activity.title} independently in MathMaster.`,
  }));

export const planClassroomPublication = ({
  assignmentV5 = null,
  lessonBundle = null,
  strategy = PUBLICATION_STRATEGIES.HYBRID,
  mainDueDate,
  homeworkDueDate = null,
  includeWarmupInClassroom = false,
} = {}) => {
  const publicationSource = assignmentV5PublicationView(assignmentV5) || lessonBundle;
  if (!publicationSource || typeof publicationSource !== 'object') throw new TypeError('assignmentV5 is required for assignment publication planning.');
  if (!VALID_STRATEGIES.has(strategy)) throw new Error(`Unsupported publication strategy: ${strategy}.`);
  const activities = Array.isArray(publicationSource.activities) ? publicationSource.activities : [];
  const title = lessonTitle(publicationSource);
  const posts = [];
  const warmups = activities.filter((activity) => activity.role === ACTIVITY_ROLES.WARMUP);
  const practices = activities.filter((activity) => activity.role === ACTIVITY_ROLES.PRACTICE);
  const sameDayPractices = practices.filter(() => !homeworkDueDate || datesRepresentSameMoment(homeworkDueDate, mainDueDate));
  const homeworkPractices = practices.filter(() => homeworkDueDate && !datesRepresentSameMoment(homeworkDueDate, mainDueDate));
  const assessments = separateAssessmentPosts(publicationSource, activities, mainDueDate);

  // Warm-Ups never enter an accuracy/composite post. Their engagement grade has
  // a separate 5-point contract and normally syncs as a weekly combined grade.
  if (includeWarmupInClassroom && warmups.length) {
    posts.push(postForActivities({
      lessonBundle: publicationSource,
      kind: 'warmup',
      activities: warmups,
      dueDate: mainDueDate,
      title: `${title} — Warm-Up`,
      description: 'Complete the MathMaster warm-up. Accuracy remains diagnostic; this post records engagement.',
    }));
  }

  if (strategy === PUBLICATION_STRATEGIES.HYBRID) {
    const lessonWork = activities.filter((activity) => (
      activity.role === ACTIVITY_ROLES.CLASSWORK
      || (activity.role === ACTIVITY_ROLES.PRACTICE && sameDayPractices.includes(activity))
    ));
    const lessonPost = postForActivities({
      lessonBundle: publicationSource,
      kind: 'lesson-work',
      activities: lessonWork,
      dueDate: mainDueDate,
      title: `${title} — Lesson Work`,
      description: "Complete today's guided lesson work in MathMaster.",
    });
    if (lessonPost) posts.push(lessonPost);

    activities.filter((activity) => activity.role === ACTIVITY_ROLES.DOL).forEach((activity) => {
      posts.push(postForActivities({
        lessonBundle: publicationSource,
        kind: `dol-${activity.activityId}`,
        activities: [activity],
        dueDate: mainDueDate,
        title: `${title} — ${activity.title || 'Exit Ticket (DOL)'}`,
        description: 'Complete your independent daily mastery check in MathMaster.',
      }));
    });
  } else if (strategy === PUBLICATION_STRATEGIES.BUNDLE) {
    const bundleable = activities.filter((activity) => (
      !ASSESSMENT_ROLES.has(activity.role)
      && activity.role !== ACTIVITY_ROLES.WARMUP
      && !(activity.role === ACTIVITY_ROLES.PRACTICE && homeworkPractices.includes(activity))
    ));
    const bundlePost = postForActivities({
      lessonBundle: publicationSource,
      kind: 'bundle',
      activities: bundleable,
      dueDate: mainDueDate,
      title,
      description: "Complete today's lesson in MathMaster.",
    });
    if (bundlePost) posts.push(bundlePost);
  } else {
    activities
      .filter((activity) => activity.role !== ACTIVITY_ROLES.WARMUP && !ASSESSMENT_ROLES.has(activity.role))
      .forEach((activity) => {
        const isHomework = activity.role === ACTIVITY_ROLES.PRACTICE && homeworkPractices.includes(activity);
        posts.push(postForActivities({
          lessonBundle,
          kind: `split-${activity.activityId}`,
          activities: [activity],
          dueDate: isHomework ? homeworkDueDate : mainDueDate,
          title: `${title} — ${activity.title}`,
          description: `Complete ${activity.title} in MathMaster.`,
        }));
      });
  }

  if (homeworkPractices.length && strategy !== PUBLICATION_STRATEGIES.SPLIT) {
    posts.push(postForActivities({
      lessonBundle: publicationSource,
      kind: 'homework',
      activities: homeworkPractices,
      dueDate: homeworkDueDate,
      title: `${title} — Homework`,
      description: 'Complete independent practice in MathMaster.',
    }));
  }

  posts.push(...assessments);
  return {
    sourceKind: assignmentV5 ? 'assignmentV5' : 'lessonBundle',
    strategy,
    plannedPosts: posts.filter(Boolean),
    omittedWarmupCount: includeWarmupInClassroom ? 0 : warmups.length,
    summary: `${posts.length} Google Classroom post${posts.length === 1 ? '' : 's'} planned.`,
  };
};
