import { useEffect, useRef } from 'react';

// Run a handler on Escape while `active` — for dismissing transient panels/forms.
// Document-level on purpose: Escape should dismiss even while an input has focus.
export function useEscape(onEscape: () => void, active: boolean) {
  const handler = useRef(onEscape);
  handler.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handler.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);
}
