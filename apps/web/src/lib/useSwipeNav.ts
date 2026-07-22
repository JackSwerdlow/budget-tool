import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

// Horizontal swipe → previous / next sub-tab, touch only (see MOBILE.md). Uses pointer events
// (what the rest of the app uses, and what Chrome device mode fires reliably). Deliberately
// conservative so it never fights other gestures: it acts only on a clear, mostly-horizontal
// one-finger swipe, and stands aside when the swipe began on something that consumes horizontal
// drag itself — a horizontally scrollable element (the Trends matrix, the Items/salary tables).
// Spread the returned handlers on the element wrapping the swipeable content.
//
// It fires on **pointermove**, as soon as the gesture is unambiguously horizontal, rather than
// waiting for pointerup. On a real device the up event often never comes: a real swipe always has
// some vertical component, the browser starts scrolling on it, and a scrolling browser fires
// `pointercancel` instead — which is why the first version never triggered on the phone at all.
// Deciding mid-gesture also means the tab has already changed by the time the finger lifts.
//
// Charts no longer opt out via `data-noswipe`: their scrub is behind a press-and-hold now
// (useScrubGesture), so a quick horizontal flick over a chart is unambiguously a swipe, and the
// two gestures can't both claim the same drag.

// Far enough to be deliberate, and clearly more horizontal than vertical. Kept modest because the
// window to decide is short — the browser may cancel the pointer the moment it starts scrolling,
// and a swipe that needed 60px of travel often never got there.
const MIN_DISTANCE_PX = 48;
const HORIZONTAL_DOMINANCE = 1.5;

export function useSwipeNav(onPrev: () => void, onNext: () => void) {
  const start = useRef<
    { x: number; y: number; dx: number; dy: number; target: EventTarget | null; fired: boolean } | null
  >(null);

  // Acts on the running delta, so it can be re-checked when the browser cuts the gesture short.
  const tryFire = () => {
    const s = start.current;
    if (!s || s.fired) return;
    if (Math.abs(s.dx) < MIN_DISTANCE_PX || Math.abs(s.dx) < Math.abs(s.dy) * HORIZONTAL_DOMINANCE) return;
    if (consumesHorizontalDrag(s.target, s.dx < 0)) { start.current = null; return; }
    s.fired = true; // one tab change per gesture, however far the finger keeps going
    if (s.dx < 0) onNext();
    else onPrev();
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'touch') { start.current = null; return; }
    start.current = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, target: e.target, fired: false };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const s = start.current;
    if (!s || s.fired || e.pointerType !== 'touch') return;
    s.dx = e.clientX - s.x;
    s.dy = e.clientY - s.y;
    tryFire();
  };

  // A cancel means the browser took the gesture for scrolling. If the drag already looked like a
  // swipe by then, honour it — otherwise a swipe is lost purely because the page moved slightly
  // under it. A genuine scroll fails the dominance test on its vertical travel, so it won't fire.
  const onPointerCancel = () => {
    tryFire();
    start.current = null;
  };

  const onPointerUp = () => { start.current = null; };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}

// Walk up from the start target: true if the swipe should be left to that element — an ancestor
// that can still scroll horizontally in the swipe's direction, or one that opts out via
// `data-noswipe`.
function consumesHorizontalDrag(target: EventTarget | null, swipingLeft: boolean): boolean {
  let node = target instanceof Element ? target : null;
  while (node) {
    if (node.hasAttribute('data-noswipe')) return true;
    if (scrollsHorizontally(node, swipingLeft)) return true;
    node = node.parentElement;
  }
  return false;
}

// Content wider than its box is **not** the same as a scrollable box. Plenty of ordinary elements
// report `scrollWidth > clientWidth` while `overflow-x: visible` means they never scroll — the
// sticky control bar's `-mx-3` bleed is one, and because an unscrolled element is always "able to
// scroll right", it silently ate every right-to-left swipe on the page while leaving left-to-right
// working. So check that the element is a real scroller before believing it.
function scrollsHorizontally(node: Element, swipingLeft: boolean): boolean {
  if (node.scrollWidth <= node.clientWidth + 4) return false;
  const overflowX = getComputedStyle(node).overflowX;
  if (overflowX !== 'auto' && overflowX !== 'scroll') return false;
  const maxScroll = node.scrollWidth - node.clientWidth;
  // Swiping left (dx < 0) pushes content right → scrollLeft increases.
  return swipingLeft ? node.scrollLeft < maxScroll - 1 : node.scrollLeft > 1;
}
