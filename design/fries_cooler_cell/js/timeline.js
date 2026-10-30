// Cell layout and the one-cycle timeline. Three.js world: metres, +Y up,
// camera-facing side is +Z. The conveyor is on the left (-X), the Nova-5 in the
// middle and the cooler box on the right (+X). The belt runs towards +Z.
import * as THREE from 'three';

export const DEG = Math.PI / 180;
export const CYCLE = 26;

export const ROBOT_BASE = [0, 0.40, 0];
export const COOLER_POS = [0.50, 0.56, 0];
export const BIN_POS = [0.50, 0, 0];

export const BELT = {
  x: -0.55, width: 0.30, top: 0.72, zStart: -1.25, zEnd: 0.35,
  travel: 1.15, window: [2.0, 7.5],
};
// 1 kg scoop (≈2.8 L) in the tool frame: +X = open front (lip), +Y = bowl up,
// +Z = side. TCP = centre of the bowl floor. Dustpan style: it rests lip-down
// on the belt and the belt feeds fries in.
export const SCOOP = {
  length: 0.25, width: 0.14, back: 0.12, front: 0.05, wall: 0.003,
  reach: 0.185, drop: 0.06,
};

// 1 kg batch: ~180 frozen straight-cut fries of ~5.5 g, spread along the belt.
export const BATCH = {count: 180, fryMass: 0.0055, zFrom: -1.20, zTo: -0.30, halfWidth: 0.12};
// Scoop rests lip-down on the belt, facing upstream; guide plates funnel the
// stream into its 140 mm mouth.
export const LOAD_Z = 0.05;
export const FUNNEL = {zIn: -0.50, zOut: -0.09, halfIn: 0.14, halfOut: 0.065};

export const LID = {open: [8.6, 9.8], close: [15.4, 16.6], angle: 95 * DEG};
export const DOOR = {open: [18.5, 19.3], close: [21.0, 21.8], angle: 95 * DEG};
export const CAPTURE = [2.0, 7.8];
export const RELEASE = [11.8, 13.9];
export const BIN_FADE = [23.0, 24.5];

export const PHASES = [
  [0, 'Nova-5 sets the scoop on the belt'],
  [2.0, 'Belt feeds 1 kg of fries into the scoop'],
  [7.5, 'Tilt back and lift the full scoop'],
  [9.1, 'Carry to cooler · cylinder retracts, lid tips open'],
  [11.3, 'Pour over the scoop lip into the cooler'],
  [13.9, 'Retract · lid closes'],
  [16.6, 'Holding · RTD measuring the product'],
  [18.5, 'Bottom door (design TBD) · fries to disposal'],
  [21.8, 'Door closed · disposal emptied'],
];

export const smooth = x => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
};
export const windowEase = (t, [a, b]) => smooth((t - a) / (b - a));
export const phaseAt = t => PHASES.reduce((name, [start, label]) => (t >= start ? label : name), PHASES[0][1]);

// Belt runs at a constant 0.21 m/s (short ramps) while the scoop is loading.
export function beltTravel(t) {
  const [a, b] = BELT.window, ramp = 0.3;
  const v = BELT.travel / (b - a - ramp);
  if (t <= a) return 0;
  if (t >= b) return BELT.travel;
  if (t < a + ramp) return v * (t - a) ** 2 / (2 * ramp);
  if (t > b - ramp) return BELT.travel - v * (b - t) ** 2 / (2 * ramp);
  return v * (t - a - ramp / 2);
}
export const lidAngle = t => LID.angle * (windowEase(t, LID.open) - windowEase(t, LID.close));
export const doorAngle = t => DOOR.angle * (windowEase(t, DOOR.open) - windowEase(t, DOOR.close));

// Scoop TCP pose: bowl-floor centre, `dir` is the horizontal direction the
// scoop's open front (lip) points to, `tilt` lifts the lip (negative pours).
function pose(x, y, z, dir, tiltDeg) {
  const f0 = new THREE.Vector3(dir[0], 0, dir[1]).normalize();
  const u0 = new THREE.Vector3(0, 1, 0);
  const tilt = tiltDeg * DEG;
  const f = f0.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(u0, Math.sin(tilt));
  const u = u0.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(f0, -Math.sin(tilt));
  const m = new THREE.Matrix4().makeBasis(f, u, f.clone().cross(u));
  return m.setPosition(x, y, z);
}

// Pour pose pivoting about the lip at P: the lip stays over the opening while
// the back of the scoop rises.
function lipPose(P, dir, tiltDeg) {
  const m = pose(0, 0, 0, dir, tiltDeg);
  const f = new THREE.Vector3().setFromMatrixColumn(m, 0);
  const c = new THREE.Vector3(...P).addScaledVector(f, -SCOOP.length / 2);
  return m.setPosition(c);
}

const UPSTREAM = [0, -1], TO_COOLER = [1, 0];
// The lip points away from the robot (330°, slightly back) and pivots 60 mm
// above the cooler opening; the bowl hangs towards the robot, clear of the lid
// and its cylinder. A 55° tip is past the ~35-40° slide angle of frozen fries
// on stainless, and is the deepest tip the Nova-5 can follow continuously from
// its carrying configuration in this layout.
const POUR_DIR = [Math.cos(330 * DEG), Math.sin(330 * DEG)];
const POUR_DEPTH = -55;
const LIP = [COOLER_POS[0] - 0.03 * POUR_DIR[0], 0.84, COOLER_POS[2] - 0.03 * POUR_DIR[1]];
const lifted = dy => [LIP[0], LIP[1] + dy, LIP[2]];
const beltY = BELT.top + 0.0035;
export const POSES = {
  ready: pose(BELT.x, 0.95, LOAD_Z, UPSTREAM, 0),
  preload: pose(BELT.x, beltY + 0.03, LOAD_Z, UPSTREAM, 0),
  load: pose(BELT.x, beltY, LOAD_Z, UPSTREAM, 0),
  tilted: pose(BELT.x, beltY + 0.04, LOAD_Z + 0.02, UPSTREAM, 15),
  lift: pose(BELT.x + 0.05, 0.98, LOAD_Z + 0.05, UPSTREAM, 15),
  front: pose(0.0, 1.02, 0.45, TO_COOLER, 15),
  approach: lipPose(lifted(0.08), POUR_DIR, 10),
  pour0: lipPose(LIP, POUR_DIR, 10),
  pour1: lipPose(LIP, POUR_DIR, 10 + (POUR_DEPTH - 10) / 4),
  pour2: lipPose(LIP, POUR_DIR, 10 + (POUR_DEPTH - 10) / 2),
  pour3: lipPose(LIP, POUR_DIR, 10 + 3 * (POUR_DEPTH - 10) / 4),
  dump: lipPose(LIP, POUR_DIR, POUR_DEPTH),
  after: lipPose(lifted(0.12), POUR_DIR, 5),
  back: pose(0.0, 1.02, 0.45, TO_COOLER, 0),
};

// Robot motion: each segment eases over its time window. 'line' moves follow
// a straight Cartesian path (loading, pouring); 'joint' moves interpolate in
// joint space through the listed waypoints (transfers); one pose is a hold.
export const ROBOT_SEGMENTS = [
  {t: [0, 1.0], poses: ['ready']},
  {t: [1.0, 1.6], mode: 'line', poses: ['ready', 'preload']},
  {t: [1.6, 2.0], mode: 'line', poses: ['preload', 'load']},
  {t: [2.0, 7.6], poses: ['load']},
  {t: [7.6, 8.3], mode: 'line', poses: ['load', 'tilted']},
  {t: [8.3, 9.1], mode: 'line', carry: true, poses: ['tilted', 'lift']},
  {t: [9.1, 11.3], mode: 'line', carry: true, poses: ['lift', 'front', 'approach']},
  {t: [11.3, 11.8], mode: 'line', carry: true, poses: ['approach', 'pour0']},
  {t: [11.8, 13.4], mode: 'line', poses: ['pour0', 'pour1', 'pour2', 'pour3', 'dump']},
  {t: [13.4, 13.9], poses: ['dump']},
  {t: [13.9, 15.3], mode: 'line', poses: ['dump', 'pour3', 'pour2', 'pour1', 'pour0', 'after']},
  {t: [15.3, 17.6], mode: 'line', poses: ['after', 'back', 'ready']},
  {t: [17.6, CYCLE], poses: ['ready']},
];

// Optional IK branch hints (degrees) for joint-move targets, by pose name.
export const BRANCH = {};
