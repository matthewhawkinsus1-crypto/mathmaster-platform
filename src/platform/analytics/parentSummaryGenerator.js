import { predictExamScoresFromMastery } from '../assessment/examScorePredictor.js';
import { toDisplayCode } from '../../utils/teksUtils.js';
import { buildStudentLearningProfile, diagnoseGaps } from '../profile/studentLearningProfile.js';
import { courseLabel } from '../../../functions/shared/classModel.mjs';

const preferredLanguage = ({ language, studentProfile, programEligibility }) => {
  const raw = language || studentProfile?.translationLanguage || studentProfile?.supportProfile?.translationLanguage || programEligibility?.ebLanguage || 'en';
  return String(raw).toLowerCase().startsWith('es') ? 'es' : 'en';
};

const scoredSkills = (masteryProfilesByTEKS) => Object.entries(masteryProfilesByTEKS || {})
  .map(([code, profile]) => ({ code: toDisplayCode(code), score: Number(profile?.mastery?.estimate), status: profile?.mastery?.status || 'Not Enough Evidence' }))
  .filter((item) => Number.isFinite(item.score));

export const generateParentSummaryReport = ({ studentName = 'Student', courseId = 'algebra1', masteryProfilesByTEKS = {}, retentionSchedulesByTEKS = {}, evidenceEvents = [], completion = null, learningProfile = null, language = null, studentProfile = null, programEligibility = null } = {}) => {
  const locale = preferredLanguage({ language, studentProfile, programEligibility });
  const skills = scoredSkills(masteryProfilesByTEKS);
  const mastered = skills.filter((item) => ['Mastered', 'Secure'].includes(item.status) || item.score >= 70).length;
  const needsWork = skills.filter((item) => item.status === 'Needs Attention' || item.score < 50).length;
  const strongest = [...skills].sort((a, b) => b.score - a.score)[0] || null;
  const focus = [...skills].sort((a, b) => a.score - b.score)[0] || null;
  const retentionConcerns = Object.values(retentionSchedulesByTEKS || {}).filter((schedule) => schedule?.status === 'concern').length;
  const predictions = predictExamScoresFromMastery(masteryProfilesByTEKS);
  const tsia = predictions.tsia2;
  const hasEvidence = skills.length > 0;
  const resolvedLearningProfile = learningProfile || buildStudentLearningProfile({
    courseId,
    masteryProfilesByTeks: masteryProfilesByTEKS,
    evidenceEvents,
    retentionSchedules: retentionSchedulesByTEKS,
    completion,
  });
  const gapDiagnostics = diagnoseGaps(resolvedLearningProfile);
  const courseName = courseLabel(courseId);
  const sharedProfileFields = {
    courseId,
    courseName,
    learningProfile: resolvedLearningProfile,
    instructionalBand: resolvedLearningProfile.instructionalBand,
    instructionalBandLabel: resolvedLearningProfile.instructionalBandLabel,
    performanceProjection: resolvedLearningProfile.performanceProjection,
    performanceProjectionLabel: resolvedLearningProfile.performanceProjectionLabel,
    engagement: resolvedLearningProfile.engagement,
    engagementLabel: resolvedLearningProfile.engagementLabel,
    dokProfile: resolvedLearningProfile.dokProfile,
    difficultyProfile: resolvedLearningProfile.difficultyProfile,
    ccmrTransfer: resolvedLearningProfile.ccmrTransfer,
    gapDiagnostics,
  };

  if (locale === 'es') return {
    ...sharedProfileFields,
    language: 'es', studentName,
    headline: hasEvidence ? `${studentName} tiene evidencia sólida en ${mastered} tema(s) de ${courseName}.` : `Todavía estamos reuniendo evidencia de matemáticas para ${studentName}.`,
    overallAssessment: !hasEvidence ? 'Aún no hay suficiente evidencia para describir el progreso con confianza.' : needsWork ? `${studentName} se beneficiaría de práctica enfocada en ${needsWork} habilidad(es).` : `${studentName} está construyendo un desempeño consistente en las habilidades observadas.`,
    strengthsText: strongest ? `Fortaleza observada: ${strongest.code} (${Math.round(strongest.score)}% de dominio estimado).` : 'Todavía no hay suficiente evidencia para identificar una fortaleza específica.',
    focusText: focus ? `Próximo enfoque: ${focus.code} (${Math.round(focus.score)}% de dominio estimado).` : 'Seguiremos reuniendo evidencia para elegir el próximo enfoque.',
    retentionText: retentionConcerns ? `${retentionConcerns} habilidad(es) necesitan una revisión de retención.` : 'No hay alertas de retención activas en los datos disponibles.',
    actionableHomeAdvice: `Sugerencia: anime a ${studentName} a explicar en voz alta cómo resolvió un problema y a completar una sesión corta de My Math Path.`,
    collegeReadinessNote: tsia.estimatedScore == null ? 'TSIA2: todavía no hay suficiente evidencia para una proyección.' : `TSIA2: proyección instructiva ${tsia.scoreRange}; cobertura ${tsia.coveragePercent}%. No es una puntuación oficial.`,
  };
  return {
    ...sharedProfileFields,
    language: 'en', studentName,
    headline: hasEvidence ? `${studentName} has solid evidence in ${mastered} ${courseName} topic(s).` : `MathMaster is still gathering math evidence for ${studentName}.`,
    overallAssessment: !hasEvidence ? 'There is not enough evidence yet to describe progress confidently.' : needsWork ? `${studentName} would benefit from targeted review in ${needsWork} skill(s).` : `${studentName} is building consistent performance across the skills observed so far.`,
    strengthsText: strongest ? `Observed strength: ${strongest.code} (${Math.round(strongest.score)}% estimated mastery).` : 'There is not enough evidence yet to name a specific strength.',
    focusText: focus ? `Next focus: ${focus.code} (${Math.round(focus.score)}% estimated mastery).` : 'We will keep gathering evidence to choose the next focus.',
    retentionText: retentionConcerns ? `${retentionConcerns} skill(s) are due for retention follow-up.` : 'No active retention concerns appear in the available data.',
    actionableHomeAdvice: `Home practice idea: ask ${studentName} to explain one solution out loud and complete a short My Math Path session.`,
    collegeReadinessNote: tsia.estimatedScore == null ? 'TSIA2: not enough evidence for an instructional projection yet.' : `TSIA2 instructional projection: ${tsia.scoreRange}; ${tsia.coveragePercent}% domain coverage. This is not an official score.`,
  };
};

export default generateParentSummaryReport;
