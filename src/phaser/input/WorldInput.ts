let pendingZoomDelta = 0;

export function requestWorldZoom(delta: number): void {
  pendingZoomDelta += Math.max(-1, Math.min(1, delta));
}

export function consumeWorldZoom(): number {
  const delta = pendingZoomDelta;
  pendingZoomDelta = 0;
  return delta;
}
