// Method B: the Nova-5 carries a 90° dual-gripper adapter with a 5-finger soft
// claw and a 2-finger soft gripper. The claw takes handfuls off a dense belt
// stream (5 grabs ≈ 1 kg) and drops them into an ICERS 6 L PU cooler, whose lid
// the 2-finger gripper opens and closes. The cooler sits on a platform that
// tilts about its +X edge to dump into a bin beside it.
import * as THREE from 'three';
import {DEG, BELT, FRY_MASS, framePose, smooth, windowEase, mulberry32} from './common.js';
import {buildIcers, ICERS, ICERS_PROBE, COOLER_CENTRE, lidGripPoint} from './icers.js';
import {buildBin} from './props.js';
import {buildDualGripper} from './tools.js';
import {HALF_T, FRY} from './fries.js';

const CYCLE = 52;
const GRABS = 5, GRAB_PERIOD = 4.9, GRAB_START = 1.0, INDEX = 0.12;
const PER_GRAB = 36; // ≈ 200 g per handful (estimate; to be confirmed by grab tests)
const LID_OPEN = 100 * DEG;
const CLOSE_LID = 25.5, OPEN_LID = 35.5;
const TILT_UP = [41.4, 44.4], TILT_DOWN = [46.4, 49.4];
const BIN_POS = [1.06, 0, 0];
const BIN_FADE = [49.6, 51.4];
// Fries flow out of the tipped cooler only above a free surface inclined at
// this angle of repose, rising into the box from the lower rim.
const REPOSE = 33 * DEG;

const grabTime = k => GRAB_START + k * GRAB_PERIOD;
const lidOps = t0 => ({reach: [t0, t0 + 1.4], approach: [t0 + 1.4, t0 + 1.8], grip: [t0 + 1.8, t0 + 2.1],
  swing: [t0 + 2.1, t0 + 3.6], release: [t0 + 3.6, t0 + 3.9], retreat: [t0 + 3.9, t0 + 4.3], park: [t0 + 4.3, t0 + 5.7]});
const CLOSING = lidOps(CLOSE_LID), OPENING = lidOps(OPEN_LID);

const PHASES = [
  [0, 'Soft claw grabs a handful from the belt (5 grabs ≈ 1 kg)'],
  [CLOSE_LID, '2-finger gripper closes the lid'],
  [CLOSING.park[1], 'Holding · RTD measuring the product'],
  [OPEN_LID, '2-finger gripper opens the lid'],
  [TILT_UP[0], 'Platform tilts to dump into the bin'],
  [TILT_DOWN[1], 'Platform level · bin emptied'],
];

function lidAngle(t) {
  if (t < CLOSING.swing[0]) return LID_OPEN;
  if (t < CLOSING.swing[1]) return LID_OPEN * (1 - windowEase(t, CLOSING.swing));
  if (t < OPENING.swing[0]) return 0;
  return LID_OPEN * windowEase(t, OPENING.swing);
}

// Belt indexes one step forward while each handful is carried away.
function beltTravel(t) {
  let travel = 0;
  for (let k = 0; k < GRABS; k++) {
    const t0 = grabTime(k) + 1.6;
    travel += INDEX * windowEase(t, [t0, t0 + 1.4]);
  }
  return travel;
}

// Claw TCP pose pointing straight down, with the 2-finger gripper pointing
// horizontally along `pinchDir`.
const clawPose = (position, [px, , pz]) => framePose(position, [0, -1, 0], [pz, 0, -px]);
// 2-finger gripper pinching the lid's robot-side edge at lid angle `a`: it
// points along the edge towards the hinge and closes across the lid thickness,
// so it rides up with the lid. The claw points away from the robot (+X), which
// keeps the wrist on the robot side of the cooler.
const lidPose = (a, back = 0) => {
  const rotate = v => new THREE.Vector3(...v).applyAxisAngle(new THREE.Vector3(1, 0, 0), -a);
  const axis = rotate([0, 0, -1]);
  const p = lidGripPoint(a).addScaledVector(axis, -back);
  return framePose(p.toArray(), axis.toArray(), rotate([0, -1, 0]).toArray());
};

const LID_STEPS = 8;
const POSES = {
  pickAbove: clawPose([BELT.x, 0.90, 0], [-1, 0, 0]),
  pickDown: clawPose([BELT.x, BELT.top + 0.012, 0], [-1, 0, 0]),
  via: clawPose([0, 0.95, 0.45], [0, 0, 1]),
  dropAbove: clawPose([COOLER_CENTRE[0], 0.92, 0], [1, 0, 0]),
  lidAppClosed: lidPose(0, 0.07),
  lidAppOpen: lidPose(LID_OPEN, 0.07),
};
const lidKeys = [];
for (let i = 0; i <= LID_STEPS; i++) {
  const key = `lid${i}`;
  POSES[key] = lidPose(LID_OPEN * i / LID_STEPS);
  lidKeys.push(key);
}

const SEGMENTS = [];
const seg = (t, poses, tool, mode, carry) => SEGMENTS.push({t, poses, tool, mode, carry});
seg([0, GRAB_START], ['pickAbove'], 'claw');
for (let k = 0; k < GRABS; k++) {
  const t = grabTime(k);
  seg([t, t + 0.5], ['pickAbove', 'pickDown'], 'claw', 'line');
  seg([t + 0.5, t + 1.1], ['pickDown'], 'claw');
  seg([t + 1.1, t + 1.6], ['pickDown', 'pickAbove'], 'claw', 'line', 'down');
  seg([t + 1.6, t + 3.0], ['pickAbove', 'via', 'dropAbove'], 'claw', 'line', 'down');
  seg([t + 3.0, t + 3.5], ['dropAbove'], 'claw');
  seg([t + 3.5, t + 4.9], ['dropAbove', 'via', 'pickAbove'], 'claw', 'line');
}
for (const [ops, from, to, keys] of [
  [CLOSING, 'lidAppOpen', 'lidAppClosed', [...lidKeys].reverse()],
  [OPENING, 'lidAppClosed', 'lidAppOpen', lidKeys],
]) {
  seg(ops.reach, [from], 'pinch', 'joint');
  seg(ops.approach, [from, keys[0]], 'pinch', 'line');
  seg(ops.grip, [keys[0]], 'pinch');
  seg(ops.swing, keys, 'pinch', 'line');
  seg(ops.release, [keys[keys.length - 1]], 'pinch');
  seg(ops.retreat, [keys[keys.length - 1], to], 'pinch', 'line');
  seg(ops.park, ['pickAbove'], 'claw', 'joint');
  if (ops === CLOSING) seg([ops.park[1], OPEN_LID], ['pickAbove'], 'claw');
}
seg([OPENING.park[1], CYCLE], ['pickAbove'], 'claw');

function spawn(random) {
  const seeds = [];
  const layerY = () => {
    const r = random();
    return BELT.top + HALF_T + (r < 0.4 ? 0 : r < 0.75 ? 1 : 2) * FRY[1];
  };
  // A dense patch under the claw for each grab (it reaches the pick point
  // after k index steps), and the same stream at lower density around it.
  const centres = Array.from({length: GRABS}, (_, k) => -INDEX * k);
  for (let k = 0; k < GRABS; k++) {
    for (let i = 0; i < PER_GRAB; i++) {
      const r = 0.05 * Math.sqrt(random()), a = random() * Math.PI * 2;
      seeds.push({position: new THREE.Vector3(BELT.x + r * Math.cos(a), layerY(), centres[k] + r * Math.sin(a)),
        yaw: random() * Math.PI, rand: random(), tag: k});
    }
  }
  let placed = 0;
  while (placed < 380) {
    const x = (random() * 2 - 1) * 0.125, z = -0.75 + 1.05 * random();
    if (centres.some(c => Math.hypot(x, z - c) < 0.062)) continue;
    seeds.push({position: new THREE.Vector3(BELT.x + x, BELT.top + HALF_T + (random() < 0.35 ? FRY[1] : 0), z),
      yaw: random() * Math.PI, rand: random(), tag: 'stream'});
    placed++;
  }
  return seeds;
}

export function createMethod({scene, materials, label, options}) {
  const tilt = Number(options.tilt) || 45;
  const icers = buildIcers(materials);
  scene.add(icers.stand, icers.pivot);
  const bin = buildBin(materials, BIN_POS, {halfX: 0.24, halfZ: 0.22, height: 0.40, floor: 0.04});
  scene.add(bin.group);
  const tiltAngle = t => tilt * DEG * (windowEase(t, TILT_UP) - windowEase(t, TILT_DOWN));

  const random = mulberry32(11);
  const seeds = spawn(random);
  const clawSlots = Array.from({length: PER_GRAB}, () => {
    const r = 0.026 * Math.sqrt(random()), a = random() * Math.PI * 2;
    return {position: new THREE.Vector3(-0.008 - 0.04 * random(), r * Math.cos(a), r * Math.sin(a)),
      quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * 3, random() * 3, random() * 3))};
  });
  const state = {captured: new Set(), released: new Set()};

  const I = ICERS.inner;
  const containers = [
    {name: 'cooler', frame: icers.cooler, halfX: I.halfX, halfZ: I.halfZ, floor: I.floor, top: I.top, catches: t => tiltAngle(t) < 2 * DEG},
    bin.container('bin', BIN_FADE),
  ];

  const labels = [
    label('Conveyor', [-0.55, 0.92, -0.95]),
    label('Nova-5 + dual soft gripper', [0, 0.32, 0.16]),
    label('ICERS 6L cooler', [0.40, 0.95, 0.2]),
    label('RTD in drilled hole + cable gland', [0.62, 0.60, 0.40]),
    label('Magnetic catches (replace latches)', [0.75, 0.86, 0.22]),
    label('Tilt platform + rotary drive', [0.78, 0.36, -0.34]),
    label('Disposal bin', [1.06, 0.48, 0.26]),
    label('Overflow (not grabbed)', [-0.55, 0.42, 0.62]),
  ];

  // Tool state: 0 = open, 1 = closed.
  const ramp = (t, closeAt, openAt, speed = 0.4) => Math.min(smooth((t - closeAt) / speed), 1 - smooth((t - openAt) / 0.3));
  const toolState = t => {
    let claw = 0;
    for (let k = 0; k < GRABS; k++) claw = Math.max(claw, ramp(t, grabTime(k) + 0.5, grabTime(k) + 3.0, 0.45));
    const pinch = Math.max(ramp(t, CLOSING.grip[0], CLOSING.release[0], 0.3), ramp(t, OPENING.grip[0], OPENING.release[0], 0.3));
    return {claw, pinch};
  };

  return {
    id: 'B',
    title: 'B · Soft-gripper handfuls',
    cycle: CYCLE,
    phases: PHASES,
    buildTool: buildDualGripper,
    poses: POSES,
    segments: SEGMENTS,
    preferred: [180, -10, 100, 0, -90, 0].map(v => v * DEG),
    seeds,
    containers,
    labels,
    shellMaterials: icers.shellMaterials,
    sectionZ: 0,
    focus: {position: [COOLER_CENTRE[0] + 0.35, COOLER_CENTRE[1] + 0.45, 0.85], target: [COOLER_CENTRE[0] + 0.1, COOLER_CENTRE[1] + 0.12, 0]},
    beltTravel,
    reset() {
      state.captured.clear();
      state.released.clear();
    },
    update(t) {
      icers.setLid(lidAngle(t));
      icers.setTilt(tiltAngle(t));
    },
    toolState,
    control(sim, t, dt, robot) {
      const claw = robot.tcps.claw;
      for (let k = 0; k < GRABS; k++) {
        const t0 = grabTime(k);
        if (!state.captured.has(k) && t >= t0 + 0.5) {
          state.captured.add(k);
          let i = 0;
          for (const fry of sim.fries) {
            if (fry.mode === 'belt' && fry.tag === k) {
              const slot = clawSlots[i++ % clawSlots.length];
              sim.capture(fry, claw, slot.position, slot.quat, 0.45);
            }
          }
        }
        if (!state.released.has(k) && t >= t0 + 3.0) {
          state.released.add(k);
          for (const fry of sim.fries) {
            if (fry.mode === 'held' && fry.carrier === claw) {
              sim.release(fry, new THREE.Vector3((fry.rand - 0.5) * 0.15, -0.1, (0.5 - fry.rand) * 0.1), 0.15 * fry.rand);
            }
          }
        }
      }
      // Tipped cooler: fries above the free surface through the lower rim flow out.
      if (tiltAngle(t) > 2 * DEG) {
        const m = icers.cooler.matrixWorld;
        const tanR = Math.tan(REPOSE);
        for (const fry of sim.fries) {
          if (fry.mode !== 'rest' || fry.container !== 'cooler') continue;
          const rim = icers.rimLocal(fry.local.z).applyMatrix4(m);
          const into = Math.max(0, rim.x - fry.position.x);
          if (fry.position.y > rim.y + into * tanR) {
            const z = fry.local.z;
            sim.spill(fry, () => icers.rimLocal(z).add(new THREE.Vector3(0.012, 0.01, 0)).applyMatrix4(icers.cooler.matrixWorld), 0.5,
              new THREE.Vector3(0.45, 0, 0));
          }
        }
      }
    },
    thermal: {
      container: 'cooler',
      probe: new THREE.Vector3(ICERS_PROBE.x, ICERS_PROBE.y, ICERS_PROBE.z + 0.01),
      openFraction: t => lidAngle(t) / LID_OPEN,
    },
    hud(t, counts) {
      const kg = n => (n * FRY_MASS).toFixed(2);
      const grabs = Math.min(GRABS, Array.from({length: GRABS}, (_, k) => t >= grabTime(k) + 0.5).filter(Boolean).length);
      const rows = [
        ['Lid (robot-operated)', `${(lidAngle(t) / DEG).toFixed(0)}°`],
        ['Platform tilt', `${(tiltAngle(t) / DEG).toFixed(0)}° of ${tilt}°`],
        ['Grabs', `${grabs}/${GRABS} · in hand ${kg(counts.carrier)} kg`],
        ['Cooler / bin', `${kg(counts.cooler)} / ${kg(counts.bin)} kg`],
        ['Belt / overflow', `${kg(counts.belt)} / ${kg(counts.tote)} kg`],
      ];
      if (t >= TILT_UP[0]) rows.push(['Dump result', `${kg(counts.bin + counts.falling)} kg out · ${kg(counts.cooler)} kg left`]);
      return rows;
    },
    options: {tilt},
    expect: {batch: GRABS * PER_GRAB, full: CLOSE_LID, inCooler: 33.0, dumped: TILT_DOWN[1] + 0.2},
  };
}
