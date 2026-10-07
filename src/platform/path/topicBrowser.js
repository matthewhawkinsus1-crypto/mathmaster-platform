// Every topic in the student's course, with every skill in it.
//
// The Path map is deliberately nearby: a handful of cards around where the
// student is standing (pathMap.js). That is the right default and the wrong
// only view — a student who wants to look ahead, revisit last month's unit or
// find "the slope one" had no way to see the rest of their course.
//
// This builds that view, and builds it from the same three sources every other
// Path screen reads, so it cannot disagree with them:
//
//   the engine rows (pathOptions)   -> the Path status, through the map's own
//                                      node builder: the same door, coverage
//                                      overlay, lock sentence and repair
//   the unified mastery profiles    -> the mastery status, by the shared rule
//                                      (the wheel's and the skill card's word)
//   the course's strands and units  -> the grouping: strandConfig topics, and
//                                      the district calendar's units where
//                                      the course has one
//
// It never ranks, classifies or decides anything. Pure: no React, no Firestore.

import { STATUS } from './recommendationEngine.js';
import { explainPacing, pathNodeForRow } from './pathMap.js';
import { describeSkill, teksCodeFromSkillId, teksSkillId } from './skillGraph.js';
import { districtUnitForSkill, getDistrictUnits, hasDistrictUnits } from './districtUnits.js';
import { describeCoursePathPass } from './pathPassPresentation.js';
import {
  MASTERY_STATUS_COLORS, getMasteryStrands, isMasteryCourse, masteryCourseLabel,
} from '../mastery/strandConfig.js';
import {
  MASTERY_STATUS, classifyMasteryStatus, masteryFactsFromProfile,
} from '../../../functions/shared/masteryRule.mjs';

export const TOPIC_GROUPING = Object.freeze({ UNIT: 'unit', TOPIC: 'topic' });

// The three Path states a student needs to tell apart. "Open" covers every
// status the map draws as a door, including Mastered (practise again).
export const PATH_STATE = Object.freeze({
  OPEN: 'open',
  FUTURE: 'future',
  LOCKED: 'locked',
  UNAVAILABLE: 'unavailable',
});

const ENGINE_BUCKETS = ['required', 'remediation', 'priority', 'recommended', 'available', 'extension', 'future', 'locked', 'mastered'];

const list = (value) => (Array.isArray(value) ? value : []);

export const pathStateForStatus = (status) => {
  if (status === STATUS.LOCKED) return PATH_STATE.LOCKED;
  if (status === STATUS.FUTURE) return PATH_STATE.FUTURE;
  return status ? PATH_STATE.OPEN : PATH_STATE.UNAVAILABLE;
};

/**
 * The mastery status for one unified profile, by the shared rule — re-derived
 * rather than trusted, exactly as the skill card's checklist does, so the two
 * can never show different words for the same evidence.
 */
export const masteryStatusForProfile = (profile) => (
  profile && typeof profile === 'object'
    ? classifyMasteryStatus(masteryFactsFromProfile(profile))
    : MASTERY_STATUS.NOT_ENOUGH_EVIDENCE
);

const normalizeText = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9%.]+/g, ' ')
  .trim();

/**
 * Search by name. Every word typed must appear somewhere in the skill's name,
 * its description, or the name of its topic or unit — so "slope" finds the
 * slope skills and "quadratic" finds the whole quadratic unit. The TEKS code is
 * deliberately not searched: students never see it, so they cannot type it.
 */
export const matchesTopicQuery = (skill, query) => {
  const terms = normalizeText(query).split(' ').filter(Boolean);
  if (!terms.length) return true;
  const haystack = normalizeText([skill?.title, skill?.description, skill?.topicTitle, skill?.unitTitle].filter(Boolean).join(' '));
  return terms.every((term) => haystack.includes(term));
};

// Why a skill is not a door, in one sentence, for each of the reasons a skill
// can be closed. A calendar fact, a mathematical one, a teacher's decision and
// a content gap must not read alike.
const whyNotLaunchable = (row, node) => {
  if (!row || !node) return 'This skill is not on your path yet. Your teacher can see your course setup.';
  if (node.contentPending) return node.reason;
  if (row.status === STATUS.FUTURE) return explainPacing(node);
  if (row.status === STATUS.LOCKED) return node.lockedExplanation;
  return null;
};

const buildSkill = ({ skillId, strand, strandNumber }, context) => {
  const {
    course, rowsBySkill, masteryProfilesByTEKS, skillProgressByTEKS, isCovered,
  } = context;
  const code = teksCodeFromSkillId(skillId);
  const row = rowsBySkill.get(skillId) || null;
  const described = describeSkill(skillId);
  const profile = code ? (masteryProfilesByTEKS?.[code] || null) : null;
  const node = row ? pathNodeForRow(row, { isCovered, profile }) : null;
  const unit = districtUnitForSkill(skillId, course);
  const masteryStatus = masteryStatusForProfile(profile);
  const pathStatus = row?.status || null;
  const launchable = Boolean(node?.selectable);
  const pass = describeCoursePathPass(skillProgressByTEKS?.[code] || {}, { mastered: pathStatus === STATUS.MASTERED });
  // The repair a blocked skill points at, offered only where the bank can
  // actually issue it — the same coverage question the skill's own door asks.
  const strengthen = node?.strengthen && (typeof isCovered !== 'function' || isCovered(node.strengthen.skillId))
    ? node.strengthen
    : null;

  return {
    skillId,
    // For keys and for launching. Never rendered: a student reads the name.
    code,
    title: node?.title || described.studentLabel || 'This skill',
    description: node?.description || described.description || '',
    topicId: strand?.id || 'other',
    topicTitle: strand?.title || 'Other skills in your course',
    topicNumber: strandNumber || null,
    topicColor: strand?.color || null,
    unitId: unit?.id || null,
    unitTitle: unit?.title || null,
    pathStatus,
    pathState: pathStateForStatus(pathStatus),
    statusLabel: node?.statusLabel || 'Not on your path yet',
    symbol: node?.symbol || '○',
    tone: node?.tone || '#5f6368',
    masteryStatus,
    masteryColor: MASTERY_STATUS_COLORS[masteryStatus] || MASTERY_STATUS_COLORS[MASTERY_STATUS.NOT_ENOUGH_EVIDENCE],
    launchable,
    blockedBy: launchable ? null : (node?.contentPending ? 'content' : (node?.blockedBy || (node ? null : 'unavailable'))),
    whyNot: launchable ? null : whyNotLaunchable(row, node),
    strengthen,
    reason: node?.reason || '',
    evidence: launchable ? list(node?.evidence) : [],
    classHere: row?.calendarTiming === 'current',
    calendarTiming: row?.calendarTiming || null,
    passCompletedLabel: pass.completedLabel || null,
    buttonLabel: pass.buttonLabel,
  };
};

// A unit's place in the class's year, read from its skills' own timing — the
// engine rows the map reads — never from a second clock.
const unitStanding = (unit, skills) => {
  const timings = skills.map((skill) => skill.calendarTiming).filter(Boolean);
  if (timings.includes('current') && !unit?.embedded) return 'Your class is working on this unit now';
  if (unit?.embedded) return 'Taught throughout the year';
  if (unit && !unit.scheduled) return 'Not on your class calendar yet';
  if (timings.includes('upcoming')) return 'Your class starts this unit soon';
  if (timings.length && timings.every((timing) => timing === 'review')) return 'Your class covered this unit earlier';
  if (timings.includes('future')) return 'Later in the course';
  return null;
};

const summarize = (skills) => ({
  total: skills.length,
  masteredCount: skills.filter((skill) => skill.masteryStatus === MASTERY_STATUS.MASTERED).length,
  openCount: skills.filter((skill) => skill.launchable).length,
  classHere: skills.some((skill) => skill.classHere),
});

/**
 * The browser model.
 *
 *   courseId              the student's course (pathOptions.courseId if absent)
 *   pathOptions           exactly what getStudentPathOptions returned
 *   masteryProfilesByTEKS the unified profiles (masteryData.masteryProfilesByTEKS)
 *   skillProgressByTEKS   server-owned practice rounds, for the button label
 *   isCovered             (skillId) => boolean, the map's coverage gate; null
 *                         while coverage is unknown, which closes no door
 *   groupBy               'unit' | 'topic'; defaults to the district units
 *                         where the course has a calendar, topics otherwise
 *   query                 search by name
 *
 * Returns null when there is no course to describe.
 */
export const buildTopicBrowser = ({
  courseId = null,
  pathOptions = null,
  masteryProfilesByTEKS = {},
  skillProgressByTEKS = {},
  isCovered = null,
  groupBy = null,
  query = '',
} = {}) => {
  const course = courseId || pathOptions?.courseId || null;
  if (!course) return null;

  const rowsBySkill = new Map();
  ENGINE_BUCKETS.forEach((bucket) => list(pathOptions?.[bucket]).forEach((row) => {
    if (row?.skillId && !rowsBySkill.has(row.skillId)) rowsBySkill.set(row.skillId, row);
  }));

  // Every skill exactly once: the course's strands in wheel order, then any
  // engine row no strand claims (a safety net — today the two sets are equal).
  const strands = isMasteryCourse(course) ? getMasteryStrands(course) : [];
  const seen = new Set();
  const entries = [];
  strands.forEach((strand, index) => strand.codes.forEach((code) => {
    const skillId = teksSkillId(code);
    if (seen.has(skillId)) return;
    seen.add(skillId);
    entries.push({ skillId, strand, strandNumber: index + 1 });
  }));
  rowsBySkill.forEach((row, skillId) => {
    if (seen.has(skillId)) return;
    seen.add(skillId);
    entries.push({ skillId, strand: null, strandNumber: null });
  });

  const context = {
    course, rowsBySkill, masteryProfilesByTEKS, skillProgressByTEKS, isCovered,
  };
  const allSkills = entries.map((entry) => buildSkill(entry, context));

  const canGroupByUnit = hasDistrictUnits(course);
  const requested = groupBy === TOPIC_GROUPING.UNIT || groupBy === TOPIC_GROUPING.TOPIC ? groupBy : null;
  const grouping = requested === TOPIC_GROUPING.UNIT && canGroupByUnit ? TOPIC_GROUPING.UNIT
    : requested === TOPIC_GROUPING.TOPIC ? TOPIC_GROUPING.TOPIC
      : (canGroupByUnit ? TOPIC_GROUPING.UNIT : TOPIC_GROUPING.TOPIC);

  const shells = grouping === TOPIC_GROUPING.UNIT
    ? getDistrictUnits(course).map((unit) => ({ id: unit.id, title: unit.title, kind: TOPIC_GROUPING.UNIT, number: unit.order, color: null, unit }))
    : strands.map((strand, index) => ({ id: strand.id, title: strand.title, kind: TOPIC_GROUPING.TOPIC, number: index + 1, color: strand.color, unit: null }));
  const keyOf = (skill) => (grouping === TOPIC_GROUPING.UNIT ? skill.unitId : skill.topicId);
  const known = new Set(shells.map((shell) => shell.id));
  const strays = allSkills.filter((skill) => !known.has(keyOf(skill)));
  if (strays.length) {
    shells.push({ id: 'other', title: 'Other skills in your course', kind: grouping, number: null, color: null, unit: null });
  }

  const matches = (skill) => matchesTopicQuery(skill, query);
  const searching = Boolean(normalizeText(query));
  const groups = shells.map((shell) => {
    const members = shell.id === 'other' ? strays : allSkills.filter((skill) => keyOf(skill) === shell.id);
    const visible = members.filter(matches);
    return {
      id: shell.id,
      title: shell.title,
      kind: shell.kind,
      number: shell.number,
      color: shell.color,
      standing: shell.kind === TOPIC_GROUPING.UNIT ? unitStanding(shell.unit, members) : null,
      ...summarize(members),
      skills: visible,
    };
  }).filter((group) => group.total > 0 && (!searching || group.skills.length > 0));

  return {
    courseId: course,
    courseLabel: masteryCourseLabel(course),
    grouping,
    canGroupByUnit,
    groupOptions: canGroupByUnit ? [TOPIC_GROUPING.UNIT, TOPIC_GROUPING.TOPIC] : [TOPIC_GROUPING.TOPIC],
    query: String(query || ''),
    searching,
    groups,
    totalSkills: allSkills.length,
    matchedSkills: groups.reduce((sum, group) => sum + group.skills.length, 0),
    masteredSkills: allSkills.filter((skill) => skill.masteryStatus === MASTERY_STATUS.MASTERED).length,
    openSkills: allSkills.filter((skill) => skill.launchable).length,
  };
};

export default buildTopicBrowser;
