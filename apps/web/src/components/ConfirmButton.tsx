import { type ReactNode, useEffect, useRef, useState } from 'react';

// Two-click destructive action: first click arms (shows the confirm label, on-brand red),
// second click confirms. Auto-disarms on blur or after a few seconds. Replaces the native
// window.confirm() dialog so destructive actions stay inside the app's visual language.
export function ConfirmButton({
  onConfirm,
  idleLabel,
  confirmLabel = 'Confirm?',
  idleClassName = '',
  confirmClassName = '',
  ariaLabel,
  title,
}: {
  onConfirm: () => void;
  idleLabel: ReactNode;
  confirmLabel?: ReactNode;
  idleClassName?: string;
  confirmClassName?: string;
  ariaLabel?: string;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function disarm() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setArmed(false);
  }

  function onClick() {
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    disarm();
    onConfirm();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onBlur={disarm}
      aria-label={ariaLabel}
      title={title}
      className={armed ? confirmClassName : idleClassName}
    >
      {armed ? confirmLabel : idleLabel}
    </button>
  );
}
