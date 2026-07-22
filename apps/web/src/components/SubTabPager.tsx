import { useEffect, useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { isScrubArmed } from '../lib/useScrubGesture';

// Swipeable sub-tab panels (see MOBILE.md). Replaces a hand-rolled swipe detector that only ever
// fired over the charts — the one place whose `touch-action` reserved horizontal drags — and
// changed tab instantly, with nothing tracking the finger. Embla gives the paged behaviour every
// mobile app has: the panel follows your thumb, snaps back on a short drag, advances on a long one.
//
// **Phone only.** From `sm` up the carousel deactivates itself via Embla's own `breakpoints`, and
// the CSS below drops every panel but the selected one, so desktop keeps a plain page with one
// panel in normal flow. Mouse drags are vetoed too, so text selection still works if it ever runs.
//
// Panels are their own scroll containers rather than sharing the page scroll, which is how native
// pagers do it (iOS HIG / Material): each sub-tab keeps its own scroll position for free, and a
// drag between panels of different heights can't make the page lurch under the finger.

// Above the scrub's 10px arming slop on purpose (see useScrubGesture), mirroring Android's paging
// touch slop: the pager cannot have started moving by the time a hold arms a scrub, so handing the
// gesture over needs nothing put back.
const DRAG_THRESHOLD_PX = 16;

// Embla refuses to drag when the gesture starts on a form control (its internal focus-node list),
// so those keep their caret and selection behaviour. On a phone that leaves the amount field, the
// salary inputs and every taxonomy row unswipeable — a big share of Add, Salary and Manage. Native
// pagers don't behave that way: on Android a horizontal drag over an EditText still pages, because
// text selection there needs a long-press first. So recognise the swipe ourselves on exactly the
// nodes Embla skips (no double-handling, since it has already stood down for them).
const EMBLA_FOCUS_NODES = ['INPUT', 'SELECT', 'TEXTAREA'];
const SWIPE_MIN_DISTANCE_PX = 48;
const SWIPE_HORIZONTAL_DOMINANCE = 1.5;

export function SubTabPager({ index, onIndexChange, children }: {
  index: number;
  onIndexChange: (index: number) => void;
  children: ReactNode[];
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    dragThreshold: DRAG_THRESHOLD_PX,
    breakpoints: { '(min-width: 640px)': { active: false } },
  });

  useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => onIndexChange(emblaApi.selectedSnap());
    // Touch only, and never when the drag starts on something that owns horizontal drags itself
    // (the Trends matrix, the wide tables) — that element should scroll instead.
    const onPointerDown = (_api: unknown, e: { detail: TouchEvent | MouseEvent }) =>
      !(e.detail instanceof MouseEvent) && !startsOnHorizontalScroller(e.detail);
    // A press-and-hold on a chart has claimed the gesture: stand down for the rest of the touch.
    // This is the web form of Android's requestDisallowInterceptTouchEvent.
    const onPointerMove = () => !isScrubArmed();

    emblaApi.on('select', onSelect);
    emblaApi.on('pointerdown', onPointerDown);
    emblaApi.on('pointermove', onPointerMove);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('pointerdown', onPointerDown);
      emblaApi.off('pointermove', onPointerMove);
    };
  }, [emblaApi, onIndexChange]);

  // Tapping a sub-tab drives the same carousel, so the two stay in step whichever you use.
  useEffect(() => {
    if (emblaApi && emblaApi.selectedSnap() !== index) emblaApi.goTo(index);
  }, [emblaApi, index]);

  // Swipe fallback for the form controls Embla won't drag on (see EMBLA_FOCUS_NODES). Fires on
  // pointermove the moment the drag is clearly horizontal — the tab has changed before the finger
  // lifts, and a cancelled pointer can't lose it.
  const swipe = useRef<{ x: number; y: number; fired: boolean } | null>(null);
  const onPointerDown = (e: ReactPointerEvent) => {
    const el = e.target as Element | null;
    swipe.current =
      e.pointerType === 'touch' && el && EMBLA_FOCUS_NODES.includes(el.nodeName)
        ? { x: e.clientX, y: e.clientY, fired: false }
        : null;
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const s = swipe.current;
    if (!s || s.fired || !emblaApi) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_HORIZONTAL_DOMINANCE) return;
    s.fired = true; // one tab change per gesture
    if (dx < 0) emblaApi.goToNext();
    else emblaApi.goToPrev();
  };
  const endSwipe = () => { swipe.current = null; };

  return (
    <div
      ref={emblaRef}
      className="max-sm:h-full max-sm:overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endSwipe}
      onPointerCancel={endSwipe}
    >
      {/* The gap is load-bearing, not decoration: with slides exactly adjacent, a panel whose
          content reaches its own edge (the Month cards' borders do) lands precisely on the
          boundary, and sub-pixel rounding at the device's DPR then draws that 1px hairline down
          the neighbouring panel's edge. Separating them keeps any edge off the boundary. */}
      <div className="max-sm:flex max-sm:h-full max-sm:gap-6">
        {children.map((panel, i) => (
          <div
            key={i}
            // `inert` keeps the off-screen panels out of tab order and the accessibility tree —
            // they are mounted, just not reachable.
            inert={i !== index}
            // The insets live inside the scroller on purpose: pt keeps content off the control
            // bar's border without padding the pinned region (so it scrolls away), and pb clears
            // the fixed bottom tab bar, which overlays the panel's scroll area.
            className={`no-scrollbar max-sm:min-w-0 max-sm:flex-[0_0_100%] max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:pb-20 max-sm:pt-3 ${
              i === index ? '' : 'sm:hidden'
            }`}
          >
            {panel}
          </div>
        ))}
      </div>
    </div>
  );
}

// Walk up from the touch target: true if some ancestor is a real horizontal scroller with room
// left to scroll. Content wider than its box is not enough — plenty of elements report an
// oversized scrollWidth under `overflow-x: visible` and never scroll (the control bar's negative
// margin bleed is one), and treating those as scrollers silently eats swipes.
function startsOnHorizontalScroller(e: TouchEvent | MouseEvent): boolean {
  let node = e.target instanceof Element ? e.target : null;
  while (node) {
    if (node.scrollWidth > node.clientWidth + 4) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
    node = node.parentElement;
  }
  return false;
}
