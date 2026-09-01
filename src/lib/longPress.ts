/**
 * attachLongPress
 * Wires long-press detection on a DOM element for both mouse and touch.
 * - Fires `onFire` if the pointer stays pressed for `delay` ms without moving more than `moveTolerance` px.
 * - Any click that happens immediately after a long-press fire (within ~400ms) is suppressed
 *   via `wasJustLongPressed()` so callers can early-return in their click handler.
 */
export function attachLongPress(
  el: HTMLElement,
  onFire: () => void,
  opts: { delay?: number; moveTolerance?: number } = {},
): { cleanup: () => void; wasJustLongPressed: () => boolean } {
  const delay = opts.delay ?? 500;
  const moveTolerance = opts.moveTolerance ?? 10;

  let timer: number | null = null;
  let startX = 0;
  let startY = 0;
  let firedAt = 0;

  const clear = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  const onDown = (e: PointerEvent) => {
    // Only respond to primary button on mouse; all touch/pen presses OK.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    clear();
    timer = window.setTimeout(() => {
      timer = null;
      firedAt = Date.now();
      try { navigator.vibrate?.(20); } catch { /* ignore */ }
      onFire();
    }, delay);
  };

  const onMove = (e: PointerEvent) => {
    if (timer === null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (dx * dx + dy * dy > moveTolerance * moveTolerance) clear();
  };

  const onUp = () => clear();

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointerleave', onUp);
  el.addEventListener('pointercancel', onUp);

  return {
    cleanup: () => {
      clear();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onUp);
      el.removeEventListener('pointercancel', onUp);
    },
    wasJustLongPressed: () => Date.now() - firedAt < 400,
  };
}
