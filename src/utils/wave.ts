/**
 * The maths behind the circular download indicator.
 *
 * Kept apart from the component so it can be tested directly: the ring must be
 * perfectly plain below 10% and above 90%, and genuinely wavy in between, with
 * the amplitude ramping in and out so the change is a morph rather than a jump.
 */

export const RING_CENTRE = 32;
export const RING_RADIUS = 26;
export const AMP_MAX = 2.6;
export const WAVE_FREQ = 7;
const POINTS = 160;

/** The wave amplitude at a given progress (0..1). Zero at both ends. */
export function amplitudeFor(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  if (progress <= 0.10 || progress >= 0.90) return 0;
  const rampIn = Math.min(1, (progress - 0.10) / 0.12);
  const rampOut = Math.min(1, (0.90 - progress) / 0.12);
  return AMP_MAX * Math.min(rampIn, rampOut);
}

/**
 * An SVG path for the progress arc. With amplitude 0 it is an exact circular
 * arc; with amplitude > 0 the radius is displaced by a sine along its length,
 * and `phase` advances over time so the wave travels.
 */
export function wavyArcPath(progress: number, phase: number, amplitude: number): string {
  const p = Math.max(0, Math.min(1, progress));
  const sweep = p * Math.PI * 2;
  if (sweep <= 0.0001) return '';
  const steps = Math.max(8, Math.round(POINTS * Math.max(0.06, p)));
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = -Math.PI / 2 + sweep * t;
    const r = RING_RADIUS + amplitude * Math.sin(WAVE_FREQ * angle + phase);
    const x = RING_CENTRE + r * Math.cos(angle);
    const y = RING_CENTRE + r * Math.sin(angle);
    d += i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

/** Distance of the first point from the ring centre — used to prove flatness. */
export function firstPointRadius(progress: number, phase: number, amplitude: number): number | null {
  const d = wavyArcPath(progress, phase, amplitude);
  if (!d) return null;
  const m = /^M ([-\d.]+) ([-\d.]+)/.exec(d);
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  return Math.hypot(x - RING_CENTRE, y - RING_CENTRE);
}
