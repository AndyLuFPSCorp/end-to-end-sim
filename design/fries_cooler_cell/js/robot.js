// Nova-5 with a fry scoop. Reuses the coffee-bar studio's robot library,
// URDF kinematics (SuctionArm IK) and joint posing helper.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/GLTFLoader.js';
import {SuctionArm, interpolateTarget} from '../../coffee_bar_3d/editor/ik-core.js';
import {poseSuctionRobot} from '../../coffee_bar_3d/editor/suction-render.js';
import {smooth, SCOOP} from './timeline.js';

const LIBRARY = '../coffee_bar_3d/robot-library/';
// URDF (+Z up) <-> glTF / Three (+Y up). The exporter conjugates every node
// transform with this basis, so W_three = A * W_urdf * A^-1.
const A = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
const A_INV = A.clone().invert();
const toUrdf = m => A_INV.clone().multiply(m).multiply(A);
const fromUrdf = m => A.clone().multiply(m).multiply(A_INV);

export {SCOOP};

function buildScoop(steel, dark) {
  // Mount sits on the Link6 flange; tool +X = flange axis (Link6 +Y in glTF).
  const mount = new THREE.Group();
  mount.name = 'Fry scoop';
  mount.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
  const add = (geometry, material, x, y, z, parent = mount) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const disk = add(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 40), dark, 0.006, 0, 0);
  disk.rotation.z = -Math.PI / 2;

  const {length: L, width: W, back, front, wall, reach, drop} = SCOOP;
  const tcp = new THREE.Object3D();
  tcp.name = 'Scoop TCP';
  tcp.position.set(reach, -drop, 0);
  mount.add(tcp);

  // Adapter plate from the flange to the back wall, with two gussets.
  const backX = reach - L / 2;
  add(new THREE.BoxGeometry(backX - 0.012, 0.05, 0.06), steel, 0.012 + (backX - 0.012) / 2, 0, 0);
  for (const z of [-0.025, 0.025]) add(new THREE.BoxGeometry(backX - 0.02, 0.04, 0.004), steel, 0.02 + (backX - 0.02) / 2, -0.035, z);

  add(new THREE.BoxGeometry(L, wall, W), steel, 0, -wall / 2, 0, tcp);
  add(new THREE.BoxGeometry(wall, back, W), steel, -L / 2 - wall / 2, back / 2, 0, tcp);
  // Bevelled lip so the belt can slide under it and feed fries onto the floor.
  const lip = add(new THREE.BoxGeometry(0.018, wall, W), dark, L / 2 + 0.006, -wall / 2, 0, tcp);
  lip.rotation.z = -0.12;
  const profile = new THREE.Shape();
  profile.moveTo(-L / 2, 0);
  profile.lineTo(L / 2, 0);
  profile.lineTo(L / 2, front);
  profile.lineTo(-L / 2, back);
  profile.closePath();
  const side = new THREE.ExtrudeGeometry(profile, {depth: wall, bevelEnabled: false});
  add(side, steel, 0, 0, W / 2 - wall, tcp);
  add(side, steel, 0, 0, -W / 2, tcp);
  return {mount, tcp};
}

export async function loadNova5(base, materials) {
  const [gltf, definition] = await Promise.all([
    new GLTFLoader().loadAsync(LIBRARY + 'nova5_suction.glb'),
    fetch(LIBRARY + 'nova5_suction-kinematics.json').then(r => {
      if (!r.ok) throw new Error('Nova-5 kinematics could not be loaded');
      return r.json();
    }),
  ]);
  const root = gltf.scene;
  root.position.set(...base);
  let link6 = null;
  root.traverse(node => {
    if (node.userData.urdf_link === 'Link6') link6 = node;
    if (node.isMesh) node.castShadow = node.receiveShadow = true;
  });
  if (!link6) throw new Error('Nova-5 model has no Link6');
  // Swap the four-cup suction head for the fry scoop.
  link6.children.forEach(child => {
    if (!/Link6.visual/.test(child.name)) child.visible = false;
  });
  const scoop = buildScoop(materials.steel, materials.dark);
  link6.add(scoop.mount);
  root.updateMatrixWorld(true);

  const arm = new SuctionArm({...definition, tolerance: {position: 0.001, orientationDegrees: 0.5}},
    {x: 0, y: 0, yaw_deg: 0, robot_scale: 1}, base[1]);
  const flangeToTcp = link6.matrixWorld.clone().invert().multiply(scoop.tcp.matrixWorld);
  arm.tool = toUrdf(flangeToTcp);
  const record = {mesh: root, node: root};
  return {root, arm, tcp: scoop.tcp, link6, pose: q => poseSuctionRobot(record, q), fromUrdf};
}

const target = m => {
  const position = new THREE.Vector3(), quaternion = new THREE.Quaternion();
  toUrdf(m).decompose(position, quaternion, new THREE.Vector3());
  return {position: position.toArray(), quaternion: quaternion.toArray()};
};

// Every IK branch the solver can reach from a spread of seeds.
const TAU = Math.PI * 2;
function candidates(arm, goal, extra = []) {
  const seeds = [...extra];
  for (let j1 = -180; j1 < 180; j1 += 30) {
    for (const j2 of [-40, 0, 30]) {
      for (const [j4, j5] of [[0, -90], [180, 90], [90, 0], [-90, 0]]) seeds.push([j1, j2, 90, j4, j5, 0].map(v => v * Math.PI / 180));
    }
  }
  return seeds.map(seed => arm.solve(goal, seed, 300)).filter(result => result.ok);
}

// Shift wrap-around joints by whole turns (within limits) towards `reference`.
function unwrap(arm, q, reference) {
  return q.map((v, j) => {
    let best = v;
    for (const k of [-1, 1]) {
      const w = v + k * TAU;
      if (w >= arm.lower[j] && w <= arm.upper[j] && Math.abs(w - reference[j]) < Math.abs(best - reference[j])) best = w;
    }
    return best;
  });
}

const WEIGHTS = [1, 1, 1, 0.5, 0.5, 0.3];
const distance = (a, b) => a.reduce((sum, v, j) => sum + WEIGHTS[j] * Math.abs(v - b[j]), 0);

// The branch closest (in joint space) to `reference`.
function nearest(arm, goal, reference) {
  const found = candidates(arm, goal, [reference]).map(r => ({...r, q: unwrap(arm, r.q, reference)}));
  if (!found.length) return null;
  return found.reduce((a, b) => (distance(a.q, reference) <= distance(b.q, reference) ? a : b));
}

// Precompute joint trajectories for every segment: 'line' segments solve IK
// densely along the Cartesian path seeded from the previous sample; 'joint'
// segments interpolate to the nearest IK branch of each waypoint.
// Try every IK branch of the start pose and keep the first plan that tracks
// the whole cycle continuously with the loaded scoop kept near level.
export function planTrajectory(arm, segments, poses, preferred, branch = {}) {
  const startGoal = target(poses[segments[0].poses[0]]);
  // Prefer the "facing the target, elbow up" branch: small shoulder lean,
  // elbow near 90°.
  const comfort = q => Math.abs(q[1]) + 0.5 * Math.abs(q[2] - Math.PI / 2) + 0.2 * Math.abs(q[3]);
  const starts = [];
  for (const c of candidates(arm, startGoal, [preferred]).sort((a, b) => comfort(a.q) - comfort(b.q))) {
    if (!starts.some(s => distance(s.q, unwrap(arm, c.q, s.q)) < 0.2)) starts.push(c);
  }
  let best = null;
  for (const first of starts) {
    const plan = planFrom(arm, segments, poses, branch, first);
    const r = plan.report;
    const good = !r.failures && r.maxJointStep < 0.2 && r.minCarryUp > 0.85;
    if (good) return {...plan, branchesTried: starts.indexOf(first) + 1};
    if (!best || r.failures < best.report.failures) best = plan;
  }
  return {...best, branchesTried: starts.length};
}

function planFrom(arm, segments, poses, branch, first) {
  let q = first.q;
  const report = {maxPositionError: 0, maxOrientationError: 0, maxJointStep: 0, failures: 0, samples: 0, segments: [], minCarryUp: 1};
  // Scoop-up vertical component, to check a loaded scoop stays near level.
  const upY = q => {
    const pose = arm.forward(q);
    const m = fromUrdf(new THREE.Matrix4().compose(pose.position, pose.quaternion, new THREE.Vector3(1, 1, 1)));
    return new THREE.Vector3().setFromMatrixColumn(m, 1).y;
  };
  const record = (stats, result, previous) => {
    const step = Math.max(...result.q.map((v, j) => Math.abs(v - previous[j])));
    for (const target of [report, stats]) {
      target.maxPositionError = Math.max(target.maxPositionError, result.positionError);
      target.maxJointStep = Math.max(target.maxJointStep, step);
      target.failures += result.ok ? 0 : 1;
    }
    report.maxOrientationError = Math.max(report.maxOrientationError, result.orientationError);
    report.samples++;
  };
  const planned = segments.map(segment => {
    const stats = {poses: segment.poses.join('>'), mode: segment.mode || 'hold', maxPositionError: 0, failures: 0, maxJointStep: 0};
    report.segments.push(stats);
    const duration = segment.t[1] - segment.t[0];
    const samples = [q];
    if (segment.mode === 'line') {
      const targets = segment.poses.map(key => target(poses[key]));
      const count = Math.max(8, Math.ceil(duration * 40));
      for (let k = 1; k <= count; k++) {
        const s = (k / count) * (targets.length - 1);
        const i = Math.min(targets.length - 2, Math.floor(s));
        const result = arm.solve(interpolateTarget(targets[i], targets[i + 1], s - i), q, 200);
        record(stats, result, q);
        q = result.q;
        samples.push(q);
      }
    } else if (segment.mode === 'joint') {
      const per = Math.max(8, Math.ceil(duration * 40 / segment.poses.length));
      for (const key of segment.poses) {
        const goal = target(poses[key]);
        // Returning to the start pose: reuse the start solution so the cycle loops.
        const hinted = key === segments[0].poses[0] ? {...first, ok: true}
          : branch[key] && arm.solve(goal, branch[key].map(v => v * Math.PI / 180), 300);
        const result = hinted?.ok ? {...hinted, q: unwrap(arm, hinted.q, q)} : nearest(arm, goal, q) || {...arm.solve(goal, q, 300)};
        record(stats, {...result, q: q}, q);
        (stats.waypoints = stats.waypoints || []).push({key, ok: result.ok, error: result.positionError, q: result.q.map(v => Math.round(v * 180 / Math.PI))});
        const from = q;
        for (let k = 1; k <= per; k++) samples.push(from.map((v, j) => v + (result.q[j] - v) * k / per));
        stats.maxJointStep = Math.max(stats.maxJointStep, ...result.q.map((v, j) => Math.abs(v - from[j]) / per));
        q = result.q;
      }
    }
    if (segment.carry) for (const sample of samples) report.minCarryUp = Math.min(report.minCarryUp, upY(sample));
    return {...segment, samples};
  });
  const sample = t => {
    const segment = planned.find(s => t < s.t[1]) || planned[planned.length - 1];
    const n = segment.samples.length - 1;
    if (!n) return segment.samples[0];
    const x = smooth((t - segment.t[0]) / (segment.t[1] - segment.t[0])) * n;
    const i = Math.min(n - 1, Math.floor(x)), f = x - i;
    return segment.samples[i].map((v, j) => v + (segment.samples[i + 1][j] - v) * f);
  };
  return {sample, report, start: first};
}
