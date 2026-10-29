// Nova-5 with a fry scoop. Reuses the coffee-bar studio's robot library,
// URDF kinematics (SuctionArm IK) and joint posing helper.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/GLTFLoader.js';
import {SuctionArm, interpolateTarget} from '../../coffee_bar_3d/editor/ik-core.js';
import {poseSuctionRobot} from '../../coffee_bar_3d/editor/suction-render.js';
import {smooth} from './timeline.js';

const LIBRARY = '../coffee_bar_3d/robot-library/';
// URDF (+Z up) <-> glTF / Three (+Y up). The exporter conjugates every node
// transform with this basis, so W_three = A * W_urdf * A^-1.
const A = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
const A_INV = A.clone().invert();
const toUrdf = m => A_INV.clone().multiply(m).multiply(A);
const fromUrdf = m => A.clone().multiply(m).multiply(A_INV);

// Scoop dimensions in the tool frame: +X = open front, +Y = bowl up, +Z = side.
export const SCOOP = {length: 0.10, width: 0.11, reach: 0.17, drop: 0.085, wall: 0.003};

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
  add(new THREE.BoxGeometry(0.018, 0.05, 0.03), steel, 0.021, -0.012, 0);

  const {length: L, width: W, reach, drop, wall} = SCOOP;
  const tcp = new THREE.Object3D();
  tcp.name = 'Scoop TCP';
  tcp.position.set(reach, -drop, 0);
  mount.add(tcp);

  // Stem from the adapter down to the top of the bowl's back wall.
  const from = new THREE.Vector3(0.028, -0.02, 0), to = new THREE.Vector3(reach - L / 2, -drop + 0.045, 0);
  const span = to.clone().sub(from);
  const stem = add(new THREE.BoxGeometry(span.length(), 0.008, 0.024), steel, 0, 0, 0);
  stem.position.copy(from).addScaledVector(span, 0.5);
  stem.rotation.z = Math.atan2(span.y, span.x);

  add(new THREE.BoxGeometry(L, wall, W), steel, 0, -wall / 2, 0, tcp);
  add(new THREE.BoxGeometry(wall, 0.05, W), steel, -L / 2 - wall / 2, 0.025, 0, tcp);
  const profile = new THREE.Shape();
  profile.moveTo(-L / 2, 0);
  profile.lineTo(L / 2, 0);
  profile.lineTo(L / 2, 0.012);
  profile.lineTo(-L / 2, 0.05);
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
export function planTrajectory(arm, segments, poses, preferred) {
  const startGoal = target(poses[segments[0].poses[0]]);
  // Start in the "facing the target, elbow up" branch: small shoulder lean,
  // elbow near 90°.
  const comfort = q => Math.abs(q[1]) + 0.5 * Math.abs(q[2] - Math.PI / 2) + 0.2 * Math.abs(q[3]);
  const first = candidates(arm, startGoal, [preferred]).reduce((a, b) => (comfort(a.q) <= comfort(b.q) ? a : b));
  let q = first.q;
  const report = {maxPositionError: 0, maxOrientationError: 0, maxJointStep: 0, failures: 0, samples: 0, segments: []};
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
        const result = nearest(arm, target(poses[key]), q) || {...arm.solve(target(poses[key]), q, 300)};
        record(stats, {...result, q: q}, q);
        (stats.waypoints = stats.waypoints || []).push({key, ok: result.ok, error: result.positionError, q: result.q.map(v => Math.round(v * 180 / Math.PI))});
        const from = q;
        for (let k = 1; k <= per; k++) samples.push(from.map((v, j) => v + (result.q[j] - v) * k / per));
        stats.maxJointStep = Math.max(stats.maxJointStep, ...result.q.map((v, j) => Math.abs(v - from[j]) / per));
        q = result.q;
      }
    }
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
