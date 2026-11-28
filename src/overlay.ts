let overlayCount = 0;

export function registerOverlay(): () => void {
  overlayCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    overlayCount = Math.max(0, overlayCount - 1);
  };
}

export function isOverlayOpen(): boolean {
  return overlayCount > 0;
}
