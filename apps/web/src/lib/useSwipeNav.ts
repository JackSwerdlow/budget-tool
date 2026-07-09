import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

// Horizontal swipe → previous / next sub-tab, touch only (see MOBILE.md). Uses pointer events
// (what the rest of the app uses, and what Chrome device mode fires reliably). Deliberately
// conservative so it never fights other gestures: it acts only on a clear, mostly-horizontal
// one-finger swipe, and stands aside when the swipe began on something that consumes horizontal
// drag itself — a horizontally scrollable element (the Trends matrix, the Items/salary tables)
// or a chart scrub surface (marked `data-noswipe`, since press-&-scrub is also a horizontal drag).
// Spread the returned handlers on the element wrapping the swipeable content.
export function useSwipeNav(onPrev: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number; target: EventTarget | null } | null>(null);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'touch') { start.current = null; return; }
    start.current = { x: e.clientX, y: e.clientY, target: e.target };
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || e.pointerType !== 'touch') return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    // A clear horizontal swipe: far enough, and much more horizontal than vertical.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (consumesHorizontalDrag(s.target, dx < 0)) return;
    if (dx < 0) onNext();
    else onPrev();
  };

  return { onPointerDown, onPointerUp };
}

// Walk up from the start target: true if the swipe should be left to that element — an ancestor
// that can still scroll horizontally in the swipe's direction, or one that opts out via
// `data-noswipe` (a chart's scrub surface).
function consumesHorizontalDrag(target: EventTarget | null, swipingLeft: boolean): boolean {
  let node = target instanceof Element ? target : null;
  while (node) {
    if (node.hasAttribute('data-noswipe')) return true;
    if (node.scrollWidth > node.clientWidth + 4) {
      const maxScroll = node.scrollWidth - node.clientWidth;
      // Swiping left (dx < 0) pushes content right → scrollLeft increases.
      if (swipingLeft ? node.scrollLeft < maxScroll - 1 : node.scrollLeft > 1) return true;
    }
    node = node.parentElement;
  }
  return false;
}
