import React from 'react';

export default function ClassPointsCelebrations({ announcements = [] }) {
  if (!announcements.length) return null;
  return (
    <section aria-labelledby="class-celebrations-heading" style={{ marginBottom: 18, padding: '18px 22px', borderRadius: 14, background: '#fff8df', border: '1px solid #f6c344', textAlign: 'left' }}>
      <h2 id="class-celebrations-heading" style={{ margin: '0 0 9px', color: '#5f4400', fontSize: 18 }}>Class celebrations</h2>
      <ul style={{ margin: 0, paddingLeft: 21, color: '#5f4400', display: 'grid', gap: 6 }}>
        {announcements.map((announcement, index) => (
          <li key={`${index}-${announcement.publicStudentLabel}-${announcement.createdAt || ''}`}><strong>{announcement.publicStudentLabel}</strong> earned +{Math.abs(Number(announcement.amount) || 0)} — {announcement.reasonLabel}</li>
        ))}
      </ul>
    </section>
  );
}
