import React from 'react';
import { activeClassPointAnnouncements } from '../../platform/classPointsClient.js';

export default function ClassPointsCelebrations({ announcements = [], nowValue = Date.now() }) {
  // Re-filter on every render as well as at subscription time so an
  // announcement that expires while the dashboard stays open cannot linger.
  const visibleAnnouncements = activeClassPointAnnouncements(announcements, nowValue);
  if (!visibleAnnouncements.length) return null;
  return (
    <section aria-labelledby="class-celebrations-heading" style={{ marginBottom: 18, padding: '18px 22px', borderRadius: 14, background: '#fff8df', border: '1px solid #f6c344', textAlign: 'left' }}>
      <h2 id="class-celebrations-heading" style={{ margin: '0 0 9px', color: '#5f4400', fontSize: 18 }}>Class celebrations</h2>
      <ul style={{ margin: 0, paddingLeft: 21, color: '#5f4400', display: 'grid', gap: 6 }}>
        {visibleAnnouncements.map((announcement, index) => (
          <li key={`${index}-${announcement.publicStudentLabel}-${announcement.createdAt || ''}`}><strong>{announcement.publicStudentLabel}</strong> earned +{Math.abs(Number(announcement.amount) || 0)} — {announcement.reasonLabel}</li>
        ))}
      </ul>
    </section>
  );
}
