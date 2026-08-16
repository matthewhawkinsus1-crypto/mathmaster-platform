import { useEffect, useState } from 'react';
import { readRuntimeMobileInteraction } from './mobileInteractionFoundation.js';

export default function useMobileInteractionMode() {
  const [mode, setMode] = useState(readRuntimeMobileInteraction);

  useEffect(() => {
    const update = () => setMode(readRuntimeMobileInteraction());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);

  return mode;
}
