import { classroomSectionPostPreviews } from '../classroomSectionPublishingUi';

const formatDueAt = (value) => {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const gradingLabel = (mode) => {
  if (mode === 'engagement') return 'engagement';
  if (mode === 'accuracyWithRecovery') return 'accuracy with recovery';
  if (mode === 'accuracy') return 'accuracy';
  return 'overall grade';
};

export default function ClassroomForceRepublishPreview({
  assignment,
  selectedKeys = ['whole'],
  classroomTitle = '',
  instructions = '',
  selectedCourseNames = [],
}) {
  if (!assignment) return null;

  const previews = classroomSectionPostPreviews({
    assignment,
    selectedKeys,
    classroomTitle,
    instructions,
  });
  const destinationText = selectedCourseNames.length
    ? selectedCourseNames.join(', ')
    : 'Choose at least one Classroom destination above.';

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--mm-warning-text)', textTransform: 'uppercase', letterSpacing: '.03em' }}>
        Force-post preview
      </div>
      <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.45, color: 'var(--mm-warning-text)' }}>
        MathMaster will create {previews.length} new graded post{previews.length === 1 ? '' : 's'} in each selected Classroom. These are the exact section versions that will become the new grade-passback destinations.
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        {previews.map((preview) => (
          <div
            key={preview.sectionKey}
            style={{
              border: '1px solid #e0b44c',
              borderRadius: 9,
              background: 'var(--mm-warning-subtle)',
              padding: '10px 12px',
              color: 'var(--mm-text)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--mm-warning-text)' }}>{preview.sectionLabel}</div>
                <div style={{ fontSize: 14, fontWeight: 850, marginTop: 2 }}>{preview.title}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
                {preview.points} pts · {gradingLabel(preview.gradingMode)}
              </div>
            </div>
            <div style={{ marginTop: 7, fontSize: 12, lineHeight: 1.45 }}>
              <strong>Student instructions:</strong> {preview.instructions}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--mm-text-muted)' }}>
              <strong>Includes:</strong> {preview.questionCount} MathMaster question{preview.questionCount === 1 ? '' : 's'}
              {preview.includedSectionTitles.length ? ` · ${preview.includedSectionTitles.join(', ')}` : ''}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--mm-text-muted)' }}>
              <strong>Due:</strong> {formatDueAt(preview.dueAt)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--mm-warning-text)', lineHeight: 1.45 }}>
        <strong>Destination{selectedCourseNames.length === 1 ? '' : 's'}:</strong> {destinationText}
      </div>
    </div>
  );
}
