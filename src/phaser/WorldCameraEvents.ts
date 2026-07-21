export const WORLD_CAMERA_FOCUS_EVENT = "dark-dimensions:focus-world-camera";

export interface WorldCameraFocusDetail {
  x: number;
  y: number;
}

export function focusWorldCamera(x: number, y: number): void {
  document.dispatchEvent(
    new CustomEvent<WorldCameraFocusDetail>(WORLD_CAMERA_FOCUS_EVENT, {
      detail: { x, y },
    }),
  );
}
