import { useEffect, useState } from 'react';

// Scroll-direction visibility for the sticky mobile control bar (see MOBILE.md). Per the chosen
// behaviour, scrolling *down* (away from the top) reveals the bar and scrolling *up* (toward the
// top) hides it; near the top it's always shown so the controls are there when you arrive. Returns
// whether the bar should currently be hidden. Reads are rAF-throttled and passive.
export function useHideOnScrollUp(threshold = 80): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const update = () => {
      const y = Math.max(0, window.scrollY);
      if (y < threshold) setHidden(false);
      else if (Math.abs(y - lastY) > 4) setHidden(y < lastY);
      lastY = y;
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return hidden;
}
