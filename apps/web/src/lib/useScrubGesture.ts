import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

// Press-and-hold chart scrubbing for touch (see MOBILE.md) — the Trading-212 shape: a quick tap
// does nothing (taps stay free for drill/expand), a hold *arms* the scrub, and only then does
// dragging move the crosshair. Arming is what makes it safe to take the drag away from the page:
// until the hold completes the browser owns the gesture, so a flick still scrolls or swipes.
//
// Why this exists at all: the first mobile pass read the finger straight off `onPointerMove`, so
// the browser claimed the drag for scrolling and fired `pointercancel` instead of the moves —
// the scrub "dropped out" and needed re-pressing. Two things fix that, and both need the arming
// step above: `setPointerCapture` (moves keep coming even once the finger leaves the chart) and
// suppressing scroll (`SCRUB_SURFACE` below, plus a non-passive `touchmove` preventDefault while
// armed — pan-y alone still lets a vertical drag scroll the page out from under the scrub).
//
// Position is reported as a **fraction of the surface width**, not per-element: the caller maps
// it to whatever it draws (a day, a month index), so the whole chart width is one continuous
// track rather than a row of separate hit targets.

// Charts opt in with this class: `touch-pan-y` leaves vertical page scroll to the browser while
// claiming horizontal drags for the app (so a horizontal flick can be a tab swipe and never
// arrives as a `pointercancel`), and `select-none` stops a long press starting text selection.
export const SCRUB_SURFACE = 'touch-pan-y select-none';

// Long enough not to fire on a tap or a flick, short enough not to feel stuck.
const HOLD_MS = 340;
// Drift allowed during the hold before it's read as a scroll/swipe instead. The sub-tab pager's
// own drag threshold is deliberately set above this (see App.tsx), so the pager cannot have
// started moving by the time a scrub arms — there is nothing to snap back.
const HOLD_SLOP_PX = 10;

// Whether *any* chart currently holds an armed scrub. A module-level flag rather than context
// because there is only ever one touch to arbitrate, and the reader is the sub-tab pager, which
// has no relationship to the chart that armed it. The pager checks this on pointermove to hand the
// gesture over for the rest of the touch — the web equivalent of Android's
// requestDisallowInterceptTouchEvent.
let armedCount = 0;
export function isScrubArmed(): boolean {
  return armedCount > 0;
}

export type ScrubHandlers = {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
};

// `onScrub` receives 0–1 across the surface's width (clamped); `onRelease` fires once when the
// finger lifts, for snapping back to the idle default. Both are read from a ref, so a caller
// needn't memoise them.
export function useScrubGesture(
  surfaceRef: RefObject<Element | null>,
  onScrub: (fraction: number) => void,
  onRelease: () => void,
): { armed: boolean; handlers: ScrubHandlers } {
  const [armed, setArmed] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const startPt = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const callbacks = useRef({ onScrub, onRelease });
  callbacks.current = { onScrub, onRelease };

  const fractionAt = (clientX: number): number => {
    const r = surfaceRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };

  const cancelHold = () => {
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  // While armed, block the page scroll the browser would still do vertically (touch-pan-y).
  // Non-passive and on the surface itself, so it only ever affects this chart. The finger has
  // been held still to get here, so no scroll is in flight to fight with.
  useEffect(() => {
    if (!armed) return;
    armedCount += 1;
    const el = surfaceRef.current;
    const block = (e: Event) => e.preventDefault();
    el?.addEventListener('touchmove', block, { passive: false });
    return () => {
      armedCount -= 1;
      el?.removeEventListener('touchmove', block);
    };
  }, [armed, surfaceRef]);

  useEffect(() => cancelHold, []);

  const end = (e: ReactPointerEvent) => {
    cancelHold();
    startPt.current = null;
    if (!armed) return;
    setArmed(false);
    // Guarded: releasing a capture we don't hold throws (a cancel can arrive after the browser
    // has already taken it back).
    const el = e.currentTarget as Element;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    callbacks.current.onRelease();
  };

  return {
    armed,
    handlers: {
      onPointerDown: (e) => {
        if (e.pointerType !== 'touch') return;
        cancelHold();
        startPt.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
        const surface = e.currentTarget;
        const x = e.clientX;
        holdTimer.current = window.setTimeout(() => {
          holdTimer.current = null;
          if (!startPt.current) return;
          setArmed(true);
          // Capture so the scrub survives the finger wandering off the chart (or onto the
          // strip above it) — without it the moves stop arriving mid-drag.
          surface.setPointerCapture?.(startPt.current.pointerId);
          callbacks.current.onScrub(fractionAt(x));
        }, HOLD_MS);
      },
      onPointerMove: (e) => {
        if (e.pointerType !== 'touch') return;
        if (armed) {
          // Captured moves still bubble, and a scrub is a long horizontal drag — exactly what
          // the sub-tab swipe upstream is watching for. Claim the move so it can't do both.
          e.stopPropagation();
          callbacks.current.onScrub(fractionAt(e.clientX));
          return;
        }
        // Moved before the hold completed → the user is scrolling or swiping, not scrubbing.
        const s = startPt.current;
        if (!s) return;
        if (Math.abs(e.clientX - s.x) > HOLD_SLOP_PX || Math.abs(e.clientY - s.y) > HOLD_SLOP_PX) {
          cancelHold();
          startPt.current = null;
        }
      },
      onPointerUp: end,
      onPointerCancel: end,
    },
  };
}
