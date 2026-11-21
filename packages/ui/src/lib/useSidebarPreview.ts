import { useEffect, useRef, useState, type PointerEvent } from 'react';

export function useSidebarPreview(enabled: boolean) {
  const [preview, setPreview] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function cancelTimer() {
    clearTimeout(timer.current);
    timer.current = undefined;
  }

  useEffect(() => {
    if (!enabled) setPreview(false);
    return cancelTimer;
  }, [enabled]);

  function begin(event: PointerEvent) {
    if (!enabled || event.pointerType !== 'mouse') return;
    cancelTimer();
    timer.current = setTimeout(() => setPreview(true), 150);
  }

  function keep(event: PointerEvent) {
    if (event.pointerType === 'mouse') cancelTimer();
  }

  function leave(event: PointerEvent) {
    if (!enabled || event.pointerType !== 'mouse') return;
    cancelTimer();
    timer.current = setTimeout(() => setPreview(false), 180);
  }

  function reset() {
    cancelTimer();
    setPreview(false);
  }

  return { open: enabled && preview, begin, keep, leave, reset };
}
