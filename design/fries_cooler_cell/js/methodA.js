// Method A: the Nova-5 sets a 2.8 L scoop lip-down on the belt; a high-
// throughput stream (no funnel) feeds 1 kg into its 140 mm mouth while the rest
// of the stream passes beside it. The full scoop is carried level and poured
// over its lip into the stainless cooler (gooseneck lid on an air cylinder).
import * as THREE from 'three';
import {DEG, BELT, FRY_MASS, smooth, windowEase, mulberry32} from './common.js';
import {buildCooler, HALF_IN, FLOOR_Y, TOP_Y, OUTER, RTD_PROBE} from './cooler.js';
import {buildBin} from './props.js';
import {buildScoop, SCOOP} from './tools.js';
import {HALF_T, FRY} from './fries.js';

const CYCLE = 26;
const COOLER_POS = [0.50, 0.56, 0];
const BIN_POS = [0.50, 0, 0];
const LOAD_Z = 0.05;
const TRAVEL = 1.15, BELT_WINDOW = [2.0, 7.5];
const LID = {open: [8.6, 9.8], close: [15.4, 16.6], angle: 95 * DEG};
const DOOR = {open: [18.5, 19.3], close: [21.0, 21.8], angle: 95 * DEG};
const CAPTURE = [2.0, 7.8];
const RELEASE = [11.8, 13.9];
const BIN_FADE = [23.0, 24.5];
// 1 kg = 180 fries in the scoop-mouth lane; the same density continues across
// the full belt width, so about as much again passes beside the scoop.
const LANE = {count: 180, half: 0.055};
const OUTSIDE = {count: 170, inner: 0.085, outer: 0.13};

const PHASES = [
  [0, 'Nova-5 sets the scoop on the belt'],
  [2.0, 'Belt feeds 1 kg into the scoop · the rest passes beside it'],
  [7.5, 'Tilt back and lift the full scoop'],
  [9.1, 'Carry to cooler · cylinder retracts, lid tips open'],
  [11.3, 'Pour over the scoop lip into the cooler'],
  [13.9, 'Retract · lid closes'],
  [16.6, 'Holding · RTD measuring the product'],
  [18.5, 'Bottom door (design TBD) · fries to disposal'],
  [21.8, 'Door closed · disposal emptied'],
];

// Belt runs at a constant ~0.22 m/s (short ramps) while the scoop is loading.
function beltTravel(t) {
  const [a, b] = BELT_WINDOW, ramp = 0.3;
  const v = TRAVEL / (b - a - ramp);
  if (t <= a) return 0;
  if (t >= b) return TRAVEL;
  if (t < a + ramp) return v * (t - a) ** 2 / (2 * ramp);
  if (t > b - ramp) return TRAVEL - v * (b - t) ** 2 / (2 * ramp);
  return v * (t - a - ramp / 2);
}
const lidAngle = t => LID.angle * (windowEase(t, LID.open) - windowEase(t, LID.close));
const doorAngle = t => DOOR.angle * (windowEase(t, DOOR.open) - windowEase(t, DOOR.close));

// Scoop TCP pose: bowl-floor centre, `dir` is the horizontal direction the
// scoop's open front (lip) points to, `tilt` lifts the lip (negative pours).
function pose(x, y, z, dir, tiltDeg) {
  const f0 = new THREE.Vector3(dir[0], 0, dir[1]).normalize();
  const u0 = new THREE.Vector3(0, 1, 0);
  const tilt = tiltDeg * DEG;
  const f = f0.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(u0, Math.sin(tilt));
  const u = u0.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(f0, -Math.sin(tilt));
  return new THREE.Matrix4().makeBasis(f, u, f.clone().cross(u)).setPosition(x, y, z);
}

// Pour pose pivoting about the lip at P: the lip stays over the opening while
// the back of the scoop rises.
function lipPose(P, dir, tiltDeg) {
  const m = pose(0, 0, 0, dir, tiltDeg);
  const f = new THREE.Vector3().setFromMatrixColumn(m, 0);
  return m.setPosition(new THREE.Vector3(...P).addScaledVector(f, -SCOOP.length / 2));
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
const POSES = {
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

const SEGMENTS = [
  {t: [0, 1.0], poses: ['ready']},
  {t: [1.0, 1.6], mode: 'line', poses: ['ready', 'preload']},
  {t: [1.6, 2.0], mode: 'line', poses: ['preload', 'load']},
  {t: [2.0, 7.6], poses: ['load']},
  {t: [7.6, 8.3], mode: 'line', poses: ['load', 'tilted']},
  {t: [8.3, 9.1], mode: 'line', carry: 'up', poses: ['tilted', 'lift']},
  {t: [9.1, 11.3], mode: 'line', carry: 'up', poses: ['lift', 'front', 'approach']},
  {t: [11.3, 11.8], mode: 'line', carry: 'up', poses: ['approach', 'pour0']},
  {t: [11.8, 13.4], mode: 'line', poses: ['pour0', 'pour1', 'pour2', 'pour3', 'dump']},
  {t: [13.4, 13.9], poses: ['dump']},
  {t: [13.9, 15.3], mode: 'line', poses: ['dump', 'pour3', 'pour2', 'pour1', 'pour0', 'after']},
  {t: [15.3, 17.6], mode: 'line', poses: ['after', 'back', 'ready']},
  {t: [17.6, CYCLE], poses: ['ready']},
].map(s => ({...s, tool: 'scoop'}));

// Slots inside the scoop (tool frame), in fill order: the belt pushes fries
// in, so the bowl fills from the back wall forwards and upwards, under a ~30°
// slope from the open lip.
function scoopSlots(count, random) {
  const {length: L, width: W, back, front} = SCOOP;
  const slots = [];
  for (let x = -L / 2 + 0.03; x <= L / 2 - 0.02; x += 0.02) {
    const wall = front + (back - front) * (L / 2 - x) / L;
    const height = Math.min(wall - 0.01, 0.012 + Math.tan(30 * DEG) * (L / 2 - x));
    for (let y = HALF_T + 0.001; y <= height; y += 0.0095) {
      for (let z = -W / 2 + 0.018; z <= W / 2 - 0.018; z += 0.021) {
        const position = new THREE.Vector3(x + (random() - 0.5) * 0.008, y, z + (random() - 0.5) * 0.006);
        // Tip angle (below horizontal) at which this fry slides out: front and
        // top fries go first, the back of the bowl last.
        const slideAt = Math.sin(Math.min(50, 18 + 30 * (L / 2 - x) / L - 6 * y / 0.1 + 4 * random()) * DEG);
        slots.push({position, quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (random() - 0.5) * 0.9),
          slideAt, order: y + 0.45 * (x + L / 2) + random() * 0.01});
      }
    }
  }
  slots.sort((a, b) => a.order - b.order);
  if (slots.length < count) throw new Error(`Scoop holds ${slots.length} fries, batch is ${count}`);
  return slots;
}

function spawn(random) {
  const seeds = [];
  const add = (dx, tag) => seeds.push({
    position: new THREE.Vector3(BELT.x + dx, BELT.top + HALF_T + (random() < 0.25 ? FRY[1] : 0),
      -1.20 + 0.9 * random()),
    yaw: random() * Math.PI, rand: random(), tag,
  });
  for (let i = 0; i < LANE.count; i++) add((random() * 2 - 1) * LANE.half, 'lane');
  for (let i = 0; i < OUTSIDE.count; i++) {
    const side = random() < 0.5 ? -1 : 1;
    add(side * (OUTSIDE.inner + (OUTSIDE.outer - OUTSIDE.inner) * random()), 'outside');
  }
  return seeds;
}

export function createMethod({scene, materials, label}) {
  const cooler = buildCooler(materials);
  cooler.root.position.set(...COOLER_POS);
  scene.add(cooler.root);
  cooler.root.updateMatrixWorld(true);
  const bin = buildBin(materials, BIN_POS);
  scene.add(bin.group);

  const random = mulberry32(7);
  const slots = scoopSlots(LANE.count, random);
  const seeds = spawn(random);
  const state = {next: 0, dumped: false};

  const containers = [
    {name: 'cooler', frame: cooler.root, halfX: HALF_IN, halfZ: HALF_IN, floor: FLOOR_Y, top: TOP_Y, catches: t => doorAngle(t) < 0.05},
    bin.container('bin', BIN_FADE),
  ];

  const labels = [
    label('Conveyor', [-0.55, 0.92, -0.95]),
    label('Nova-5 + scoop', [0, 0.32, 0.16]),
    label('Cooler box (stainless)', [0.26, 0.80, 0.04]),
    label('Lid hinge', [0.66, 0.86, -0.12]),
    label('Lid air cylinder', [0.78, 0.66, 0.02]),
    label('RTD sensor (in product)', [0.50, 0.54, 0.36]),
    label('Bottom door (TBD)', [0.62, 0.50, 0.14]),
    label('Disposal', [0.50, 0.30, 0.22]),
    label('Overflow (passes the scoop)', [-0.55, 0.42, 0.62]),
  ];

  return {
    id: 'A',
    title: 'A · Belt-fed scoop',
    cycle: CYCLE,
    phases: PHASES,
    buildTool: buildScoop,
    poses: POSES,
    segments: SEGMENTS,
    preferred: [180, -10, 100, 0, -90, 0].map(v => v * DEG),
    seeds,
    containers,
    labels,
    shellMaterials: cooler.shellMaterials,
    sectionZ: COOLER_POS[2],
    focus: {position: [COOLER_POS[0] + 0.45, COOLER_POS[1] + 0.4, 0.7], target: [COOLER_POS[0], COOLER_POS[1] + OUTER / 2, 0]},
    beltTravel,
    reset() {
      state.next = 0;
      state.dumped = false;
    },
    update(t) {
      cooler.setAngles(lidAngle(t), doorAngle(t));
    },
    toolState: () => ({}),
    control(sim, t, dt, robot) {
      const tcp = robot.tcps.scoop;
      const m = tcp.matrixWorld;
      if (t >= CAPTURE[0] && t <= CAPTURE[1]) {
        const inverse = m.clone().invert();
        const local = new THREE.Vector3();
        for (const fry of sim.fries) {
          if (fry.mode !== 'belt' || fry.tag !== 'lane') continue;
          local.copy(fry.position).applyMatrix4(inverse);
          if (local.x < SCOOP.length / 2 + 0.006 && Math.abs(local.z) < SCOOP.width / 2) {
            const slot = slots[state.next++];
            fry.slideAt = slot.slideAt;
            sim.capture(fry, tcp, slot.position, slot.quat, 0.45);
          }
        }
      }
      if (t >= RELEASE[0] && t <= RELEASE[1]) {
        const forwardY = new THREE.Vector3().setFromMatrixColumn(m, 0).normalize().y;
        for (const fry of sim.fries) {
          if (fry.mode === 'held' && fry.carrier === tcp && fry.progress >= 1 && -forwardY > fry.slideAt) {
            sim.slideOut(fry, 0.7, SCOOP.length / 2 + 0.01, 0.12);
          }
        }
      }
      if (!state.dumped && doorAngle(t) > 0.12) {
        state.dumped = true;
        sim.dropContainer('cooler');
      }
    },
    thermal: {
      container: 'cooler',
      probe: new THREE.Vector3(RTD_PROBE.x, RTD_PROBE.y, RTD_PROBE.z + 0.01),
      openFraction: t => Math.max(lidAngle(t) / LID.angle, doorAngle(t) / DOOR.angle),
    },
    hud(t, counts, rod) {
      const kg = n => (n * FRY_MASS).toFixed(2);
      return [
        ['Lid', `${(lidAngle(t) / DEG).toFixed(0)}° · ${rod(cooler.lidCylinder.stroke)}`],
        ['Bottom door', `${(doorAngle(t) / DEG).toFixed(0)}° · ${rod(cooler.doorCylinder.stroke)}`],
        ['Scoop', `${kg(counts.carrier)} kg`],
        ['Cooler / bin', `${kg(counts.cooler)} / ${kg(counts.bin)} kg`],
        ['Belt / overflow', `${kg(counts.belt)} / ${kg(counts.tote)} kg`],
      ];
    },
    expect: {batch: LANE.count, full: 8.0, inCooler: 17.0, inBin: 22.0},
  };
}
