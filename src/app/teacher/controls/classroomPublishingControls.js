/*
 * POSTING AN ASSIGNMENT TO GOOGLE CLASSROOM, AND REPAIRING A POST.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by name. It holds no state and runs no effects: App keeps the busy flags and hands their setters in. It reaches App through the teacher kit (teacherKit.js), so it loads for a teacher and never with a student's Home.
 */
import { db } from '../../../firebase';
import {
  listClassroomCourseMappings, publishAssignmentToClassrooms, publishClassroomMaterial,
  repairClassroomAssignmentPublications, storeLessonNotesPdf,
} from '../../../classroomApi';
import { blobToBase64, generateLessonNotesPdfBlob } from '../../../platform/resources/pdfLoaders.js';

export function createClassroomPublishingControls(toastError, toastInfo, toastSuccess, toastWarning, user, requireTeacherKit) {
  /**
   * Publish one already-saved MathMaster assignment to every Google Classroom
   * course mapped to one of its assigned class periods.
   *
   * MathMaster assignment creation is authoritative. Classroom is a downstream
   * publication target, so a Classroom failure never rolls back the assignment.
   */
  const autoPublishAssignmentPackageToClassroom = async (assignment) => {
    const { automaticClassroomTopicName, classroomPostingMode, mappedCourseIdsForAssignment, shouldAutoPublishClassroomPackage, teacherClassroomTopicStyle } = requireTeacherKit();
    if (!shouldAutoPublishClassroomPackage(assignment)) {
      return { status: 'skipped', reason: 'not-auto-publishable', published: 0, failed: 0 };
    }

    const mappingResult = await listClassroomCourseMappings();
    const mappings = Array.isArray(mappingResult?.mappings) ? mappingResult.mappings : [];
    const courseIds = mappedCourseIdsForAssignment(assignment, mappings);
    if (!courseIds.length) {
      return {
        status: 'needs-mapping',
        reason: 'No Google Classroom course is mapped to the assignment’s MathMaster class period.',
        published: 0,
        failed: 0,
      };
    }

    const classroom = assignment.classroomPackage || {};
    // One name for both posts, so the resources and the assignment land in the
    // same topic — renamed "Week of …" when the teacher chose week topics. The
    // style is the teacher's saved choice, so a second device names topics the
    // same way (TT07); with it unreadable, this browser's own choice stands.
    const topicStyle = await teacherClassroomTopicStyle({ db, uid: user?.uid });
    const topicName = automaticClassroomTopicName(assignment, { style: topicStyle });
    const notesPdf = assignment.lessonResources?.notesPdf || null;
    const resourceLinks = Array.isArray(classroom.additionalLinks)
      ? classroom.additionalLinks
        .map((link) => ({ title: String(link?.title || '').trim(), url: String(link?.url || '').trim() }))
        .filter((link) => link.title && /^https?:\/\//i.test(link.url))
      : [];

    const hasAuthoredNotes = notesPdf?.enabled === true
      && Array.isArray(notesPdf?.sections)
      && notesPdf.sections.length > 0;
    if (notesPdf?.enabled && !hasAuthoredNotes) {
      console.warn('Lesson notes are enabled but contain no authored sections; skipping the notes PDF so an empty handout can never reach Google Classroom.');
    }
    if (hasAuthoredNotes) {
      let notesUrl = notesPdf?.asset?.url || null;
      if (!notesUrl) {
        const generated = await generateLessonNotesPdfBlob({ assignment, notesPdf });
        const stored = await storeLessonNotesPdf({
          assignmentId: assignment.id,
          fileName: notesPdf.fileName,
          title: notesPdf.title,
          pageCount: generated.pageCount,
          base64: await blobToBase64(generated.blob),
        });
        notesUrl = stored?.url || null;
      }
      if (notesUrl) {
        resourceLinks.unshift({
          title: notesPdf.title || `${assignment.title} — Student Notes`,
          url: notesUrl,
        });
      }
    }

    const dedupedLinks = [
      ...new Map(resourceLinks.map((item) => [item.url, item])).values(),
    ];
    const postingMode = classroomPostingMode(assignment);

    if (
      classroom?.resourcesPost?.enabled !== false
      && postingMode === 'separateMaterial'
      && dedupedLinks.length
    ) {
      const materialResult = await publishClassroomMaterial({
        courseIds,
        materialKey: `assignment:${assignment.id}:resources`,
        title: classroom?.resourcesPost?.title || `${assignment.title} — Notes & Resources`,
        description: classroom?.resourcesPost?.description || `Reference materials for ${assignment.title}.`,
        topicName,
        materials: dedupedLinks,
      });
      const failedMaterials = (materialResult?.results || []).filter((item) => item.status === 'failed');
      if (failedMaterials.length) {
        console.warn('Some Classroom resource posts failed:', failedMaterials);
      }
    }

    const response = await publishAssignmentToClassrooms({
      courseIds,
      assignmentId: assignment.id,
      classroomTitle: classroom?.assignmentPost?.title || assignment.title,
      maxPoints: Number(classroom?.assignmentPost?.maxPoints) || 100,
      gradePassbackEnabled: classroom?.gradePassback?.enabled !== false,
      topicName,
      instructions: classroom?.assignmentPost?.instructions
        || `Complete “${assignment.title}” in MathMaster.`,
      materials: (
        classroom?.resourcesPost?.enabled !== false
        && postingMode === 'attachToAssignment'
      ) ? dedupedLinks : [],
    });

    const summary = response?.summary || {};
    const published = Number(summary.published || 0) + Number(summary.alreadyPublished || 0);
    const failed = Number(summary.failed || 0);
    return {
      status: failed ? (published ? 'partial' : 'failed') : 'published',
      published,
      failed,
      courseIds,
      results: response?.results || [],
    };
  };

  /**
   * The students this signed-in user may see.
   *
   * A teacher's roster is the students in the classes they are teacher of
   * record for — not the whole school. The scope is applied here, once, so
   * every teacher surface downstream (gradebook, standards, analytics, exams,
   * Path inspection) inherits it rather than each re-deriving it and
   * disagreeing. The root administrator sees everyone.
   */
  const handleRepairClassroomAssignmentPost = async (assignment) => {
    if (!assignment?.id) return;
    try {
      const response = await repairClassroomAssignmentPublications({
        assignmentId: assignment.id,
      });
      const summary = response?.summary || {};
      const checked = Number(summary.checked || 0);
      const reposted = Number(summary.reposted || 0);
      const healthy = Number(summary.healthy || 0);
      const failed = Number(summary.failed || 0);
      const queuedGrades = Number(summary.queuedGrades || 0);
      const ignoredPriorDestinations = Number(summary.ignoredPriorDestinations || 0);
      const repostedCourses = (response?.results || [])
        .filter((item) => item.status === 'reposted')
        .map((item) => item.courseName || item.courseId)
        .filter(Boolean);
      const healthyCourses = (response?.results || [])
        .filter((item) => item.status === 'healthy')
        .map((item) => item.courseName || item.courseId)
        .filter(Boolean);

      if (!checked) {
        toastWarning(
          'No current Classroom destination found',
          'MathMaster could not find a Google Classroom course mapped to the class currently assigned this work. Open Google Classroom Manager and verify the class-to-course mapping.',
        );
        return;
      }
      if (reposted > 0) {
        toastSuccess(
          'Google Classroom assignment reposted',
          assignment.title + ': recreated ' + reposted + ' missing Classroom post' + (reposted === 1 ? '' : 's')
            + (repostedCourses.length ? ' in ' + repostedCourses.join(', ') : '')
            + ' and queued ' + queuedGrades + ' linked student grade record' + (queuedGrades === 1 ? '' : 's')
            + ' for passback review. Existing MathMaster work was preserved.'
            + (ignoredPriorDestinations > 0
              ? ' MathMaster ignored ' + ignoredPriorDestinations + ' older publication record' + (ignoredPriorDestinations === 1 ? '' : 's') + ' from other course mappings.'
              : ''),
        );
      } else if (healthy > 0 && failed === 0) {
        toastInfo(
          'Current Classroom post is healthy',
          assignment.title + ': Google Classroom confirmed the current mapped assignment post'
            + (healthy === 1 ? '' : 's')
            + (healthyCourses.length ? ' in ' + healthyCourses.join(', ') : '')
            + ' ' + (healthy === 1 ? 'is' : 'are') + ' still available. Nothing was duplicated. If you still cannot see the post, choose Force New Classroom Post from this assignment menu and select the exact Google Classroom.'
            + (ignoredPriorDestinations > 0
              ? ' MathMaster ignored ' + ignoredPriorDestinations + ' older publication record' + (ignoredPriorDestinations === 1 ? '' : 's') + ' from other course mappings.'
              : ''),
        );
      }
      if (failed > 0) {
        const details = (response?.results || [])
          .filter((item) => ['failed', 'changed'].includes(item.status))
          .map((item) => (item.courseName || item.courseId) + ': ' + (item.error || 'repair failed'))
          .join(' | ');
        toastError(
          'Classroom repost needs attention',
          details || (failed + ' Classroom destination' + (failed === 1 ? '' : 's') + ' could not be repaired.'),
        );
      }
    } catch (error) {
      console.error(error);
      toastError('Could not check/repost Classroom assignment', error.message);
    }
  };
  return [autoPublishAssignmentPackageToClassroom, handleRepairClassroomAssignmentPost];
}
