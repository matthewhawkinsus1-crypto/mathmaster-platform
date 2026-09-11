export const WORK_VIEW_MOBILE_MAX = 720;

export function resolveWorkViewLayout({ width, height, visualHeight = height }) {
  const safeWidth = Math.max(0, Number(width) || 0);
  const safeHeight = Math.max(0, Number(visualHeight) || Number(height) || 0);
  const mobile = safeWidth <= WORK_VIEW_MOBILE_MAX;
  return {
    mode: mobile ? 'mobile' : 'desktop',
    orientation: safeWidth > safeHeight ? 'landscape' : 'portrait',
    usableHeight: safeHeight,
    controlsPlacement: mobile ? 'bottom' : 'side',
  };
}

export function readWorkViewViewport(windowObject = typeof window !== 'undefined' ? window : null) {
  if (!windowObject) return resolveWorkViewLayout({ width:1024, height:768 });
  return resolveWorkViewLayout({
    width: windowObject.visualViewport?.width || windowObject.innerWidth,
    height: windowObject.innerHeight,
    visualHeight: windowObject.visualViewport?.height || windowObject.innerHeight,
  });
}
