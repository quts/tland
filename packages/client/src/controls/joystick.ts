/**
 * Virtual joystick, bottom-left.
 *
 * Built from DOM elements rather than drawn into the canvas, so it sits
 * naturally inside `env(safe-area-inset-*)` and stays crisp at any pixel
 * ratio. It reports a unit-ish vector the scene samples once per frame.
 */
const DEAD_ZONE = 0.14;

export interface JoystickVector {
  x: number;
  y: number;
}

export class Joystick {
  private readonly root: HTMLElement;
  private readonly knob: HTMLElement;
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private radius = 44;
  private readonly value: JoystickVector = { x: 0, y: 0 };

  constructor(root: HTMLElement) {
    this.root = root;
    const knob = root.querySelector<HTMLElement>('.joystick-knob');
    if (knob === null) throw new Error('joystick is missing its knob');
    this.knob = knob;

    root.addEventListener('pointerdown', this.onPointerDown);
    root.addEventListener('pointermove', this.onPointerMove);
    root.addEventListener('pointerup', this.onPointerEnd);
    root.addEventListener('pointercancel', this.onPointerEnd);
    // Belt and braces alongside `touch-action: none` in the stylesheet.
    root.addEventListener('touchstart', (event) => event.preventDefault(), {
      passive: false,
    });
  }

  /** Current direction. Zero when the joystick is not being held. */
  get vector(): Readonly<JoystickVector> {
    return this.value;
  }

  get active(): boolean {
    return this.pointerId !== null;
  }

  dispose(): void {
    this.root.removeEventListener('pointerdown', this.onPointerDown);
    this.root.removeEventListener('pointermove', this.onPointerMove);
    this.root.removeEventListener('pointerup', this.onPointerEnd);
    this.root.removeEventListener('pointercancel', this.onPointerEnd);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.pointerId !== null) return;
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.root.setPointerCapture(event.pointerId);
    this.root.classList.add('is-active');

    const bounds = this.root.getBoundingClientRect();
    this.originX = bounds.left + bounds.width / 2;
    this.originY = bounds.top + bounds.height / 2;
    this.radius = bounds.width / 2 - 10;
    this.update(event.clientX, event.clientY);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    this.update(event.clientX, event.clientY);
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.root.classList.remove('is-active');
    this.value.x = 0;
    this.value.y = 0;
    this.knob.style.transform = 'translate(-50%, -50%)';
  };

  private update(clientX: number, clientY: number): void {
    const dx = clientX - this.originX;
    const dy = clientY - this.originY;
    const distance = Math.hypot(dx, dy);

    // Clamp the knob to the ring, but keep reporting direction past the edge.
    const clamped = Math.min(distance, this.radius);
    const nx = distance === 0 ? 0 : (dx / distance) * (clamped / this.radius);
    const ny = distance === 0 ? 0 : (dy / distance) * (clamped / this.radius);

    const magnitude = Math.hypot(nx, ny);
    if (magnitude < DEAD_ZONE) {
      this.value.x = 0;
      this.value.y = 0;
    } else {
      // Rescale past the dead zone so the slowest usable speed is still smooth.
      const scaled = (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE);
      this.value.x = (nx / magnitude) * scaled;
      this.value.y = (ny / magnitude) * scaled;
    }

    const knobX = distance === 0 ? 0 : (dx / distance) * clamped;
    const knobY = distance === 0 ? 0 : (dy / distance) * clamped;
    this.knob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
  }
}
