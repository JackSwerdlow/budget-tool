// Input-capability helpers. The app renders one shared UI across a mouse desktop and a touch
// phone (see MOBILE.md); behaviours that differ by input branch on these — not on screen width —
// so a narrow desktop window keeps its mouse behaviour, while Chrome DevTools device mode (which
// reports a coarse pointer) exercises the touch path. Per-event decisions should prefer the
// event's own `pointerType`; these are for mount/render-time choices.

// True when the primary pointer is touch-like (phone / tablet / device-mode emulation).
export function coarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
}
