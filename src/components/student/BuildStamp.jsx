import React from 'react';
import { formatBuildStamp } from '../../platform/runtime/buildInfo.js';

// Which build is this device actually running?
//
// A missing button on one student's phone is either a defect or a cached
// bundle from before the fix shipped, and until this existed the only way to
// tell them apart was to deploy again and look again. One short commit id in
// the footer answers it in a screenshot.
//
// Small, grey, and at the bottom. It is for the adult debugging the problem,
// not for the student, and it must never compete with the work on the page.
export default function BuildStamp({ align = 'center', style = null }) {
  const stamp = formatBuildStamp();
  return (
    <p
      data-mathmaster-build={stamp.shortSha}
      title={stamp.detail}
      style={{
        margin: '26px 0 0', fontSize: 11, color: '#9aa0a6',
        textAlign: align, letterSpacing: '.03em', ...style,
      }}
    >
      {stamp.label}
    </p>
  );
}
