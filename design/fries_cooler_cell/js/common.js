// Shared cell layout and helpers. Three.js world: metres, +Y up, the default
// camera looks from +Z. Conveyor on the left (-X), Nova-5 in the middle,
// cooler on the right (+X). The belt runs towards +Z.
import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const ROBOT_BASE = [0, 0.40, 0];
export const BELT = {x: -0.55, width: 0.30, top: 0.72, zStart: -1.25, zEnd: 0.35};
// Overflow tote under the belt end: fries the robot does not take fall in here
// (in practice they would be recirculated).
export const TOTE = {position: [BELT.x, 0, BELT.zEnd + 0.1], halfX: 0.17, halfZ: 0.15, height: 0.30};
export const FRY_MASS = 0.0055; // kg, one 9 mm straight-cut frozen fry

export const smooth = x => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
};
export const windowEase = (t, [a, b]) => smooth((t - a) / (b - a));
export const phaseAt = (phases, t) => phases.reduce((name, [start, label]) => (t >= start ? label : name), phases[0][1]);

// Tool pose with its X axis along `x` (where the tool points) and its Z axis as
// close as possible to `zHint`.
export function framePose(position, x, zHint) {
  const X = new THREE.Vector3(...x).normalize();
  const Z = new THREE.Vector3(...zHint);
  Z.addScaledVector(X, -Z.dot(X)).normalize();
  const Y = Z.clone().cross(X);
  return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(...position);
}

// Seeded random numbers so every run (and every seek) is identical.
export function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
