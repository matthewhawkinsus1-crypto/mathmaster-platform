import { TEKS_STRANDS } from '../mastery/strandConfig.js';
import { predictExamScoresFromMastery } from '../assessment/examScorePredictor.js';
import { EXAM_TYPES } from '../assessment/examDomainRegistry.js';
import { toDisplayCode } from '../../utils/teksUtils.js';

export const USER_ROLES = Object.freeze({
  DISTRICT_ADMIN: 'district_admin',
  PRINCIPAL: 'principal',
  TEACHER: 'teacher',
  PARENT: 'parent',
  STUDENT: 'student',
});

export const READINESS_MIN_COVERAGE_PERCENT = 40;

const statusFromLegacyPerformance = (entry = {}) => {
  const key = entry.performance?.key;
  if (key === 'masters') return 'Mastered';
  if (key === 'meets') return 'Secure';
  if (key === 'approaches') return 'Developing';
  if (key === 'didNotMeet') return 'Needs Attention';
  return 'Not Enough Evidence';
};

export const masteryMapForStudent = (student = {}) => {
  const direct = student.masteryProfilesByTEKS || student.profiles;
  if (direct && typeof direct === 'object') return direct;
  const legacy = student.teks || student.masteryProfile?.teks || {};
  return Object.fromEntries(Object.entries(legacy).map(([code, entry]) => [code, {
    ...entry,
    mastery: entry.mastery || { estimate: Number.isFinite(Number(entry.score)) ? Number(entry.score) : null, status: statusFromLegacyPerformance(entry), confidence: entry.confidence || 'Low' },
  }]));
};

const supportForStudent = (student = {}) => student.supportProfile || student.profile || student;
const retentionConcern = (student, mastery) => Object.entries(mastery).some(([code, profile]) => {
  const schedules = student.retentionSchedulesByTEKS || student.retentionSchedules || {};
  const schedule = schedules[code] || schedules[toDisplayCode(code)] || {};
  return profile?.signals?.retention === 'concern' || schedule.status === 'concern';
});

const studentAverage = (mastery) => {
  const values = Object.values(mastery).map((profile) => Number(profile?.mastery?.estimate)).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
};

const rateReport = (predictions, examType) => {
  const eligible = predictions.filter((prediction) => prediction?.[examType]?.isReady != null && Number(prediction[examType].coveragePercent || 0) >= READINESS_MIN_COVERAGE_PERCENT);
  const ready = eligible.filter((prediction) => prediction[examType].isReady === true).length;
  return { readyCount: ready, sampleSize: eligible.length, excludedForLimitedEvidence: predictions.length - eligible.length, readyRate: eligible.length ? Math.round(ready / eligible.length * 100) : null };
};

export const buildTeacherTierGroupings = (studentProfiles = []) => {
  const groups = { tier1: [], tier2: [], tier3: [] };
  studentProfiles.forEach((student) => {
    const mastery = masteryMapForStudent(student);
    const needsAttention = Object.values(mastery).filter((profile) => profile?.mastery?.status === 'Needs Attention' || Number(profile?.mastery?.estimate) < 50).length;
    const hasRetentionConcern = retentionConcern(student, mastery);
    const row = { id: student.studentId || student.id, name: student.studentName || student.displayName || student.studentId || student.id, focusCount: needsAttention, retentionConcern: hasRetentionConcern };
    if (needsAttention >= 4) groups.tier3.push(row);
    else if (needsAttention >= 1 || hasRetentionConcern) groups.tier2.push(row);
    else groups.tier1.push(row);
  });
  return groups;
};

export const calculateMultiStakeholderAnalytics = ({ role = USER_ROLES.TEACHER, studentProfiles = [] } = {}) => {
  const students = Array.isArray(studentProfiles) ? studentProfiles : [];
  const totalStudents = students.length;
  const distribution = { mastered: 0, secure: 0, developing: 0, needsAttention: 0, insufficientEvidence: 0, retentionConcernsCount: 0 };
  const strandBuckets = Object.fromEntries(Object.values(TEKS_STRANDS).map((strand) => [strand.id, { title: strand.title, sum: 0, count: 0 }]));
  const predictions = [];
  let spedCount = 0; let section504Count = 0; let ebCount = 0; let supportedUniqueCount = 0; let modifiedUniqueCount = 0;

  students.forEach((student) => {
    const mastery = masteryMapForStudent(student);
    predictions.push(predictExamScoresFromMastery(mastery));
    const avg = studentAverage(mastery);
    const retention = retentionConcern(student, mastery);
    if (retention) distribution.retentionConcernsCount += 1;
    if (avg == null) distribution.insufficientEvidence += 1;
    else if (avg >= 85) distribution.mastered += 1;
    else if (avg >= 70) distribution.secure += 1;
    else if (avg >= 50) distribution.developing += 1;
    else distribution.needsAttention += 1;

    Object.entries(mastery).forEach(([rawCode, profile]) => {
      const estimate = Number(profile?.mastery?.estimate);
      if (!Number.isFinite(estimate)) return;
      const code = toDisplayCode(rawCode);
      const strand = Object.values(TEKS_STRANDS).find((entry) => entry.codes.includes(code));
      if (!strand) return;
      strandBuckets[strand.id].sum += estimate;
      strandBuckets[strand.id].count += 1;
    });

    const support = supportForStudent(student);
    const programs = support.programEligibility || student.programEligibility || {};
    const sped = Boolean(programs.sped || support.sped);
    const section504 = Boolean(programs.section504 || support.section504);
    const eb = Boolean(programs.emergentBilingual || programs.eb || support.emergentBilingual);
    const accommodations = Array.isArray(support.accommodations) ? support.accommodations : [];
    const modifications = Array.isArray(support.modifications) ? support.modifications : [];
    if (sped) spedCount += 1;
    if (section504) section504Count += 1;
    if (eb) ebCount += 1;
    if (sped || section504 || eb || Boolean(support.inclusionStatus) || accommodations.length || modifications.length) supportedUniqueCount += 1;
    if (modifications.length) modifiedUniqueCount += 1;
  });

  const strandAverages = Object.fromEntries(Object.entries(strandBuckets).map(([id, bucket]) => [id, { title: bucket.title, estimate: bucket.count ? Math.round(bucket.sum / bucket.count) : null, evidenceCount: bucket.count }]));
  const sat = rateReport(predictions, EXAM_TYPES.DIGITAL_SAT);
  const act = rateReport(predictions, EXAM_TYPES.ACT);
  const tsia2 = rateReport(predictions, EXAM_TYPES.TSIA2);
  const percentage = (count) => totalStudents ? Math.round(count / totalStudents * 100) : 0;
  const report = {
    role,
    totalStudents,
    masteryDistribution: { ...distribution, percentages: Object.fromEntries(['mastered', 'secure', 'developing', 'needsAttention', 'insufficientEvidence'].map((key) => [key, percentage(distribution[key])])) },
    strandAverages,
    collegeReadiness: { digitalSAT: sat, act, tsia2, minimumEvidenceCoveragePercent: READINESS_MIN_COVERAGE_PERCENT, note: 'Rates use only students with sufficient domain coverage; projections are instructional, not official exam scores.' },
    specialPrograms: { spedCount, section504Count, ebCount, supportedUniqueCount, supportedPercentage: percentage(supportedUniqueCount), modifiedUniqueCount, modifiedPercentage: percentage(modifiedUniqueCount) },
  };
  if (role === USER_ROLES.TEACHER) report.tierGroupings = buildTeacherTierGroupings(students);
  return report;
};

export default calculateMultiStakeholderAnalytics;
