// End-of-arm tools. Each builder returns a mount for the Nova-5 Link6 flange
// and named TCPs. In every mount, tool +X is the flange axis (Link6 +Y in glTF).
import * as THREE from 'three';
import {DEG} from './common.js';

function mountGroup(name) {
  const mount = new THREE.Group();
  mount.name = name;
  mount.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
  return mount;
}

function adder(defaultParent) {
  return (geometry, material, x, y, z, parent = defaultParent) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
}

// ---------------------------------------------------------------------------
// Method A: 1 kg dustpan scoop (≈2.8 L). Tool frame: +X = open front (lip),
// +Y = bowl up, +Z = side; TCP = centre of the bowl floor.
export const SCOOP = {
  length: 0.25, width: 0.14, back: 0.12, front: 0.05, wall: 0.003,
  reach: 0.185, drop: 0.06,
};

export function buildScoop(m) {
  const mount = mountGroup('Fry scoop');
  const add = adder(mount);
  const disk = add(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 40), m.dark, 0.006, 0, 0);
  disk.rotation.z = -Math.PI / 2;

  const {length: L, width: W, back, front, wall, reach, drop} = SCOOP;
  const tcp = new THREE.Object3D();
  tcp.name = 'Scoop TCP';
  tcp.position.set(reach, -drop, 0);
  mount.add(tcp);

  // Adapter plate from the flange to the back wall, with two gussets.
  const backX = reach - L / 2;
  add(new THREE.BoxGeometry(backX - 0.012, 0.05, 0.06), m.steel, 0.012 + (backX - 0.012) / 2, 0, 0);
  for (const z of [-0.025, 0.025]) add(new THREE.BoxGeometry(backX - 0.02, 0.04, 0.004), m.steel, 0.02 + (backX - 0.02) / 2, -0.035, z);

  add(new THREE.BoxGeometry(L, wall, W), m.steel, 0, -wall / 2, 0, tcp);
  add(new THREE.BoxGeometry(wall, back, W), m.steel, -L / 2 - wall / 2, back / 2, 0, tcp);
  // Bevelled lip so the belt can slide under it and feed fries onto the floor.
  const lip = add(new THREE.BoxGeometry(0.018, wall, W), m.dark, L / 2 + 0.006, -wall / 2, 0, tcp);
  lip.rotation.z = -0.12;
  const profile = new THREE.Shape();
  profile.moveTo(-L / 2, 0);
  profile.lineTo(L / 2, 0);
  profile.lineTo(L / 2, front);
  profile.lineTo(-L / 2, back);
  profile.closePath();
  const side = new THREE.ExtrudeGeometry(profile, {depth: wall, bevelEnabled: false});
  add(side, m.steel, 0, 0, W / 2 - wall, tcp);
  add(side, m.steel, 0, 0, -W / 2, tcp);
  return {mount, tcps: {scoop: tcp}, animate() {}};
}

// ---------------------------------------------------------------------------
// Method B: 90° dual-gripper adapter (SMC RMMA1-20T090 class) carrying a
// 5-finger soft claw (ROCHU SMP-5L plate + 5 × FM-B8V4 fingers on an FCM-R08
// flange module) and a 2-finger soft gripper (ROCHU BMC-2GN4087 class).
// Both output faces sit at 45° to the flange axis, 90° apart, in the tool X-Y
// plane. Each TCP frame: +X = where the hand points, +Z = the adapter-plane
// normal (tool Z); the 2-finger gripper closes along its +Z.
export const DUAL = {
  faceOffset: 0.075, faceSide: 0.035,
  claw: {module: 0.03, plate: 0.012, plateRadius: 0.045, fingerRoot: 0.034, finger: 0.09, tcp: 0.118},
  pinch: {body: 0.06, finger: 0.087, tcp: 0.14},
};

function softFinger(m, segments, length, width, thickness) {
  // A chain of bellows segments; bending each joint curls the finger.
  const root = new THREE.Group();
  const joints = [];
  let parent = root;
  const step = length / segments;
  for (let i = 0; i < segments; i++) {
    const joint = new THREE.Group();
    joint.position.x = i === 0 ? 0 : step;
    parent.add(joint);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(step * 0.92, thickness, width), i % 2 ? m.softFinger : m.softFingerDark);
    pad.position.x = step / 2;
    pad.castShadow = true;
    joint.add(pad);
    joints.push(joint);
    parent = joint;
  }
  const tip = new THREE.Object3D();
  tip.position.x = step;
  parent.add(tip);
  return {root, joints, tip};
}

export function buildDualGripper(m) {
  const mount = mountGroup('Dual soft gripper');
  const add = adder(mount);
  const disk = add(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 40), m.dark, 0.006, 0, 0);
  disk.rotation.z = -Math.PI / 2;
  // Adapter body: a block with two 45° output faces.
  add(new THREE.BoxGeometry(0.05, 0.07, 0.06), m.smc, 0.037, 0, 0);
  const {faceOffset, faceSide} = DUAL;
  const heads = {};
  for (const [name, sign] of [['claw', 1], ['pinch', -1]]) {
    const head = new THREE.Group();
    head.position.set(faceOffset, sign * faceSide, 0);
    head.rotation.z = sign * 45 * DEG;
    mount.add(head);
    add(new THREE.BoxGeometry(0.03, 0.05, 0.06), m.smc, -0.012, -sign * 0.006, 0, head);
    heads[name] = head;
  }

  // 5-finger claw.
  const C = DUAL.claw;
  const claw = heads.claw;
  const module = add(new THREE.CylinderGeometry(0.028, 0.028, C.module, 32), m.aluminium, C.module / 2, 0, 0, claw);
  module.rotation.z = -Math.PI / 2;
  const plate = add(new THREE.CylinderGeometry(C.plateRadius, C.plateRadius, C.plate, 5), m.rochu, C.module + C.plate / 2, 0, 0, claw);
  plate.rotation.z = -Math.PI / 2;
  const clawFingers = [];
  for (let i = 0; i < 5; i++) {
    const a = i * 72 * DEG;
    const holder = new THREE.Group();
    holder.position.set(C.module + C.plate, C.fingerRoot * Math.cos(a), C.fingerRoot * Math.sin(a));
    // Rotate so the finger's +Y (bend direction) points at the claw axis.
    holder.rotation.x = a + Math.PI;
    claw.add(holder);
    add(new THREE.BoxGeometry(0.012, 0.016, 0.022), m.rochu, 0.006, 0, 0, holder);
    const finger = softFinger(m, 6, C.finger, 0.02, 0.016);
    finger.root.position.x = 0.012;
    holder.add(finger.root);
    clawFingers.push(finger);
  }
  const clawTcp = new THREE.Object3D();
  clawTcp.name = 'Claw TCP';
  clawTcp.position.x = C.tcp;
  claw.add(clawTcp);

  // 2-finger gripper, closing along its +Z.
  const P = DUAL.pinch;
  const pinch = heads.pinch;
  add(new THREE.BoxGeometry(P.body, 0.045, 0.05), m.rochu, P.body / 2, 0, 0, pinch);
  const pinchFingers = [];
  for (const side of [-1, 1]) {
    const holder = new THREE.Group();
    holder.position.set(P.body, 0, side * 0.016);
    // Bend towards the other finger: finger +Y must point at -side·Z.
    holder.rotation.x = -side * Math.PI / 2;
    pinch.add(holder);
    const finger = softFinger(m, 5, P.finger, 0.024, 0.014);
    holder.add(finger.root);
    pinchFingers.push(finger);
  }
  const pinchTcp = new THREE.Object3D();
  pinchTcp.name = 'Pinch TCP';
  pinchTcp.position.x = P.tcp;
  pinch.add(pinchTcp);

  const bend = (finger, perJoint) => finger.joints.forEach((joint, i) => (joint.rotation.z = i === 0 ? perJoint * 0.5 : perJoint));
  return {
    mount,
    tcps: {claw: clawTcp, pinch: pinchTcp},
    // close: 0 = open (vacuum, splayed outwards), 1 = closed (pressurised).
    animate({claw: c = 0, pinch: p = 0}) {
      for (const f of clawFingers) bend(f, (-4 + 15 * c) * DEG);
      for (const f of pinchFingers) bend(f, (-2 + 7 * p) * DEG);
    },
  };
}
