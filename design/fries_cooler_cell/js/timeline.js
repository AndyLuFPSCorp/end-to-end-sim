// Cell layout and the one-cycle timeline. Three.js world: metres, +Y up,
// camera-facing side is +Z. The conveyor is on the left (-X), the Nova-5 in the
// middle and the cooler box on the right (+X).
import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const CYCLE = 22;

export const ROBOT_BASE = [0, 0.40, 0];
export const COOLER_POS = [0.50, 0.56, 0];
export const BIN_POS = [0.50, 0, 0];

export const BELT = {
  x: -0.70, width: 0.30, top: 0.72, zStart: -1.15, zEnd: 0.35,
  travel: 0.95, window: [0, 2.8],
};
export const PILE = {x: -0.77, z: 0, rx: 0.034, rz: 0.04, count: 24};

export const LID = {open: [6.0, 7.2], close: [12.0, 13.2], angle: 100 * DEG};
export const DOOR = {open: [15.5, 16.3], close: [18.0, 18.8], angle: 95 * DEG};
export const CAPTURE = [3.8, 5.8];
export const RELEASE = [9.0, 10.6];
export const BIN_FADE = [20.0, 21.5];

export const PHASES = [
  [0, 'Conveyor delivers fries'],
  [2.8, 'Nova-5 scoops fries off the belt'],
  [5.8, 'Carry to cooler · air cylinder opens lid'],
  [9.0, 'Dump fries into the cooler'],
  [10.6, 'Retract · lid closes'],
  [13.2, 'Holding · RTD monitoring temperature'],
  [15.5, 'Bottom door opens · fries to disposal'],
  [18.8, 'Door closed · disposal emptied'],
];

export const smooth = x => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
};
export const windowEase = (t, [a, b]) => smooth((t - a) / (b - a));
export const phaseAt = t => PHASES.reduce((name, [start, label]) => (t >= start ? label : name), PHASES[0][1]);

export const beltTravel = t => BELT.travel * windowEase(t, BELT.window);
export const lidAngle = t => LID.angle * (windowEase(t, LID.open) - windowEase(t, LID.close));
export const doorAngle = t => DOOR.angle * (windowEase(t, DOOR.open) - windowEase(t, DOOR.close));

// Scoop TCP pose: bowl-bottom centre, `dir` is the horizontal direction the
// scoop's open front points to, `tilt` lifts the front lip and `roll` turns
// the bowl about its forward axis (pours over a side wall).
function pose(x, y, z, dir, tiltDeg, rollDeg = 0) {
  const f0 = new THREE.Vector3(dir[0], 0, dir[1]).normalize();
  const u0 = new THREE.Vector3(0, 1, 0);
  const tilt = tiltDeg * DEG;
  const f = f0.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(u0, Math.sin(tilt));
  const lifted = u0.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(f0, -Math.sin(tilt));
  const roll = rollDeg * DEG;
  const u = lifted.clone().multiplyScalar(Math.cos(roll)).addScaledVector(f.clone().cross(lifted), Math.sin(roll));
  const m = new THREE.Matrix4().makeBasis(f, u, f.clone().cross(u));
  return m.setPosition(x, y, z);
}

const OUT_LEFT = [-1, 0], OUT_FRONT = [0, 1], OUT_RIGHT = [1, 0];
const beltY = BELT.top + 0.0035;
export const POSES = {
  ready: pose(-0.55, 0.90, 0, OUT_LEFT, 0),
  pre: pose(-0.53, beltY, 0, OUT_LEFT, -3),
  push: pose(-0.775, beltY, 0, OUT_LEFT, -3),
  scooped: pose(-0.73, 0.78, 0, OUT_LEFT, 20),
  lift: pose(-0.58, 0.98, 0, OUT_LEFT, 15),
  front: pose(0.0, 1.05, 0.52, OUT_FRONT, 12),
  above: pose(0.46, 0.98, 0, OUT_RIGHT, 10),
  // Roll the bowl 110° so fries tip over its front-side (+Z) wall.
  dump: pose(0.48, 0.92, -0.02, OUT_RIGHT, 5, 110),
  after: pose(0.45, 1.00, 0, OUT_RIGHT, 0),
  back: pose(0.0, 1.03, 0.52, OUT_FRONT, 0),
};

// Robot motion: each segment eases over its time window. 'line' moves follow
// a straight Cartesian path (scooping, pouring); 'joint' moves interpolate in
// joint space through the listed waypoints (transfers); one pose is a hold.
export const ROBOT_SEGMENTS = [
  {t: [0, 3.0], poses: ['ready']},
  {t: [3.0, 3.8], mode: 'line', poses: ['ready', 'pre']},
  {t: [3.8, 5.0], mode: 'line', poses: ['pre', 'push']},
  {t: [5.0, 5.8], mode: 'line', poses: ['push', 'scooped']},
  {t: [5.8, 6.6], mode: 'line', poses: ['scooped', 'lift']},
  {t: [6.6, 9.0], mode: 'joint', poses: ['front', 'above']},
  {t: [9.0, 10.0], mode: 'line', poses: ['above', 'dump']},
  {t: [10.0, 10.6], poses: ['dump']},
  {t: [10.6, 11.4], mode: 'line', poses: ['dump', 'after']},
  {t: [11.4, 14.0], mode: 'joint', poses: ['back', 'ready']},
  {t: [14.0, CYCLE], poses: ['ready']},
];
