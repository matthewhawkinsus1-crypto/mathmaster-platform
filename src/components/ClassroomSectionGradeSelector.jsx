import {
  CLASSROOM_SECTION_OPTIONS,
  availableClassroomSectionKeys,
  nextClassroomSectionSelection,
} from '../classroomSectionPublishingUi';

export default function ClassroomSectionGradeSelector({
  assignment,
  selectedKeys = ['whole'],
  onChange,
}) {
  const availableKeys = availableClassroomSectionKeys(assignment);
  const options = CLASSROOM_SECTION_OPTIONS.filter((option) => availableKeys.includes(option.key));

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {options.map((option) => {
          const selected = selectedKeys.includes(option.key);
          return (
            <label
              key={option.key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 10px',
                border: selected ? '2px solid #2563eb' : '1px solid #cbd5e1',
                borderRadius: 8,
                background: selected ? '#eff6ff' : '#fff',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onChange?.(nextClassroomSectionSelection(selectedKeys, option.key))}
              />
              <span style={{ fontWeight: 650 }}>{option.label}</span>
            </label>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
        Whole assignment creates one overall Classroom grade. Choose individual sections to create separate
        grade slots. Only sections with included questions appear.
      </div>
    </div>
  );
}
