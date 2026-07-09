import { useRef, type TouchEvent as ReactTouchEvent } from 'react';

// Horizontal swipe → previous / next sub-tab, touch only (see MOBILE.md). Deliberately
// conservative so it never fights normal gestures: it fires only on a clear, mostly-horizontal
// one-finger swipe, and bails when a horizontally scrollable descendant (the Trends matrix, the
// Items / salary tables) could consume the swipe instead. Spread the returned handlers on the
// element wrapping the swipeable content.
export function useSwipeNav(onPrev: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number; target: EventTarget | null } | null>(null);

  const onTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length !== 1) { start.current = null; return; }
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, target: e.target };
  };

  const onTouchEnd = (e: ReactTouchEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    // A clear horizontal swipe: far enough, and more horizontal than vertical by a wide margin
    // (so a diagonal scroll never trips it).
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (scrollableInDirection(s.target, dx < 0)) return;
    if (dx < 0) onNext();
    else onPrev();
  };

  return { onTouchStart, onTouchEnd };
}

// Walk up from the touch target: true if some ancestor can still scroll horizontally in the
// swipe's direction, meaning the swipe should scroll that element rather than switch tabs.
function scrollableInDirection(target: EventTarget | null, swipingLeft: boolean): boolean {
  let node = target instanceof Element ? target : null;
  while (node) {
    if (node.scrollWidth > node.clientWidth + 4) {
      const maxScroll = node.scrollWidth - node.clientWidth;
      // Swiping left (dx < 0) pushes content right → scrollLeft increases.
      if (swipingLeft ? node.scrollLeft < maxScroll - 1 : node.scrollLeft > 1) return true;
    }
    node = node.parentElement;
  }
  return false;
}
