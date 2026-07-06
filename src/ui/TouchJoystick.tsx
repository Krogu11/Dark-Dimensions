import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  resetTouchMovement,
  setTouchMovement,
} from "../phaser/input/WorldInput";

const JOYSTICK_RADIUS = 42;

export function TouchJoystick() {
  const pointerId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  useEffect(() => resetTouchMovement, []);

  function update(event: PointerEvent<HTMLDivElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    const deltaX = event.clientX - (rect.left + rect.width / 2);
    const deltaY = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(deltaX, deltaY);
    const scale = distance > JOYSTICK_RADIUS
      ? JOYSTICK_RADIUS / distance
      : 1;
    const x = deltaX * scale;
    const y = deltaY * scale;
    setKnob({ x, y });
    setTouchMovement(x / JOYSTICK_RADIUS, y / JOYSTICK_RADIUS);
  }

  function release(): void {
    pointerId.current = null;
    setKnob({ x: 0, y: 0 });
    resetTouchMovement();
  }

  return (
    <div
      aria-label="Movement joystick"
      className="touch-joystick"
      role="application"
      onPointerDown={(event) => {
        event.preventDefault();
        pointerId.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event);
      }}
      onPointerMove={(event) => {
        if (pointerId.current === event.pointerId) update(event);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <span
        className="touch-joystick-knob"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}
