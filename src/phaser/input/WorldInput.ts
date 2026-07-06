export interface MovementVector {
  x: number;
  y: number;
}

const touchMovement: MovementVector = { x: 0, y: 0 };

export function setTouchMovement(x: number, y: number): void {
  touchMovement.x = Math.max(-1, Math.min(1, x));
  touchMovement.y = Math.max(-1, Math.min(1, y));
}

export function getTouchMovement(): MovementVector {
  return touchMovement;
}

export function resetTouchMovement(): void {
  setTouchMovement(0, 0);
}
