// Insulated cooler box: 150 mm stainless interior, 5 mm inner skin, 25 mm
// insulation, 5 mm outer skin (220 mm outside). Local frame: origin at the
// bottom centre, +Y up, hinges on the back (-Z) edges, actuators on +X.
import * as THREE from 'three';

export const COOLER = {interior: 0.150, innerSteel: 0.005, insulation: 0.025, outerSteel: 0.005};
export const WALL = COOLER.innerSteel + COOLER.insulation + COOLER.outerSteel;
export const HALF_IN = COOLER.interior / 2;
export const HALF_OUT = HALF_IN + WALL;
export const OUTER = 2 * HALF_OUT;
export const FLOOR_Y = WALL;                 // interior floor (top of bottom door)
export const TOP_Y = WALL + COOLER.interior; // interior ceiling (underside of lid)

// Hinge lines (along X) on the back edges.
const LID_HINGE = new THREE.Vector3(0, OUTER, -HALF_OUT);
const DOOR_HINGE = new THREE.Vector3(0, 0, -HALF_OUT);
// Cylinder pivots on the box and rod-end pins on the lid / door levers.
const LID_PIVOT = new THREE.Vector3(0.13, 0.06, 0.02);
const LID_PIN = new THREE.Vector3(0.13, 0.03, 0.05);      // in lid-hinge frame
const DOOR_PIVOT = new THREE.Vector3(0.155, 0.15, -0.08);
const DOOR_PIN = new THREE.Vector3(0.155, -0.02, 0.05);   // in door-hinge frame

function box(parent, size, material, position) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, radius, height, material, position, axis = 'y', segments = 28) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.position.set(...position);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// Double-acting air cylinder: clevis-mounted body + rod, aimed pivot -> pin.
function airCylinder(parent, m, bodyLength, bore) {
  const group = new THREE.Group();
  parent.add(group);
  cylinder(group, bore, bodyLength, m.aluminium, [0, bodyLength / 2, 0]);
  cylinder(group, bore * 1.18, 0.012, m.dark, [0, 0.006, 0], 'y', 6);
  cylinder(group, bore * 1.18, 0.012, m.dark, [0, bodyLength - 0.006, 0], 'y', 6);
  box(group, [0.014, 0.016, 0.012], m.dark, [0, -0.006, 0]);
  for (const y of [0.02, bodyLength - 0.02]) {
    cylinder(group, 0.0035, 0.012, m.brass, [bore + 0.004, y, 0], 'x', 12);
    cylinder(group, 0.003, 0.008, m.tubeBlue, [bore + 0.013, y, 0], 'x', 12);
  }
  const rodGeometry = new THREE.CylinderGeometry(bore * 0.36, bore * 0.36, 1, 18).translate(0, 0.5, 0);
  const rod = new THREE.Mesh(rodGeometry, m.chrome);
  rod.castShadow = true;
  group.add(rod);
  const clevis = box(group, [0.014, 0.018, 0.012], m.dark, [0, 0, 0]);
  const up = new THREE.Vector3(0, 1, 0);
  let rest = null;
  return {
    group,
    stroke: 0,
    place(pivot, pin) {
      const span = pin.clone().sub(pivot);
      const length = span.length();
      if (rest === null) rest = length;
      this.stroke = length - rest;
      group.position.copy(pivot);
      group.quaternion.setFromUnitVectors(up, span.normalize());
      rod.position.y = bodyLength - 0.01;
      rod.scale.y = Math.max(0.001, length - bodyLength + 0.002);
      clevis.position.y = length;
    },
  };
}

export function buildCooler(m) {
  const root = new THREE.Group();
  root.name = 'Cooler box';
  const layers = [
    {a: HALF_IN, b: HALF_IN + COOLER.innerSteel, material: m.innerSteel},
    {a: HALF_IN + COOLER.innerSteel, b: HALF_OUT - COOLER.outerSteel, material: m.insulation},
    {a: HALF_OUT - COOLER.outerSteel, b: HALF_OUT, material: m.outerSteel},
  ];
  const height = COOLER.interior, cy = WALL + height / 2;
  for (const {a, b, material} of layers) {
    const t = b - a, c = (a + b) / 2;
    for (const s of [-1, 1]) {
      box(root, [t, height, 2 * b], material, [s * c, cy, 0]);
      box(root, [2 * a, height, t], material, [0, cy, s * c]);
    }
  }

  // Lid and bottom door: the same 5 / 25 / 5 mm sandwich, full 220 mm footprint.
  const slabs = (parent, sign) => {
    const stack = [[m.innerSteel, COOLER.innerSteel], [m.insulation, COOLER.insulation], [m.outerSteel, COOLER.outerSteel]];
    let y = sign > 0 ? -WALL : WALL; // start at the inner (cavity) face
    for (const [material, t] of stack) {
      box(parent, [OUTER, t, OUTER], material, [0, y + sign * t / 2, HALF_OUT]);
      y += sign * t;
    }
  };
  const lid = new THREE.Group();
  lid.position.copy(LID_HINGE);
  root.add(lid);
  slabs(lid, 1);
  // Lid lever: bracket off the +X edge carrying the cylinder's rod-end pin.
  box(lid, [0.006, 0.02, 0.06], m.outerSteel, [0.113, -0.0175, 0.05]);
  box(lid, [0.005, 0.08, 0.06], m.outerSteel, [0.1185, 0.005, 0.05]);
  cylinder(lid, 0.004, 0.03, m.chrome, LID_PIN.toArray(), 'x', 12);
  box(lid, [0.08, 0.01, 0.012], m.dark, [0, 0.005, OUTER - 0.012]);

  const door = new THREE.Group();
  door.position.copy(DOOR_HINGE);
  root.add(door);
  slabs(door, -1);
  box(door, [0.04, 0.05, 0.04], m.outerSteel, [0.13, 0, 0.05]);
  cylinder(door, 0.004, 0.03, m.chrome, DOOR_PIN.toArray(), 'x', 12);

  // Hinge knuckles on both back edges.
  for (const y of [OUTER, 0]) {
    for (const x of [-0.06, 0.06]) cylinder(root, 0.006, 0.045, m.chrome, [x, y, -HALF_OUT - 0.003], 'x', 16);
  }

  // Cylinder clevis brackets on the +X wall.
  box(root, [0.02, 0.03, 0.03], m.outerSteel, [0.12, LID_PIVOT.y, LID_PIVOT.z]);
  box(root, [0.045, 0.03, 0.03], m.outerSteel, [0.1325, DOOR_PIVOT.y, DOOR_PIVOT.z]);
  const lidCylinder = airCylinder(root, m, 0.13, 0.012);
  const doorCylinder = airCylinder(root, m, 0.11, 0.01);

  // RTD (Pt100) probe drilled through the front wall into the cavity.
  const rtd = new THREE.Group();
  rtd.name = 'RTD sensor';
  root.add(rtd);
  const probeY = 0.13;
  const probeTip = HALF_IN - 0.03;
  const probeOuter = HALF_OUT + 0.035;
  cylinder(rtd, 0.003, probeOuter - probeTip, m.chrome, [0, probeY, (probeOuter + probeTip) / 2], 'z', 16);
  cylinder(rtd, 0.008, 0.008, m.outerSteel, [0, probeY, HALF_OUT + 0.004], 'z', 6);
  cylinder(rtd, 0.016, 0.026, m.aluminium, [0, probeY, probeOuter + 0.012], 'z', 28);
  cylinder(rtd, 0.017, 0.006, m.rtdBlue, [0, probeY, probeOuter + 0.028], 'z', 28);
  const cablePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, probeY - 0.016, probeOuter + 0.012),
    new THREE.Vector3(0.01, 0.06, probeOuter + 0.03),
    new THREE.Vector3(0.06, -0.02, probeOuter + 0.04),
    new THREE.Vector3(0.2, -0.07, 0.2),
  ]);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(cablePath, 40, 0.003, 8), m.cable);
  rtd.add(cable);
  const tipWorld = new THREE.Vector3(0, probeY, probeTip);

  // Stand: four legs, two cross beams under front / back mounting tabs.
  const legTop = 0.07, legBottom = -0.56;
  for (const x of [-0.21, 0.21]) {
    for (const z of [-0.21, 0.21]) {
      box(root, [0.03, legTop - legBottom, 0.03], m.frame, [x, (legTop + legBottom) / 2, z]);
      box(root, [0.05, 0.01, 0.05], m.dark, [x, legBottom + 0.005, z]);
    }
  }
  for (const z of [-0.21, 0.21]) {
    box(root, [0.45, 0.03, 0.03], m.frame, [0, legTop + 0.015, z]);
    box(root, [0.45, 0.025, 0.025], m.frame, [0, legBottom + 0.12, z]);
    for (const x of [-0.08, 0.08]) box(root, [0.04, 0.006, 0.1], m.outerSteel, [x, legTop + 0.033, Math.sign(z) * 0.16]);
  }
  for (const x of [-0.21, 0.21]) box(root, [0.025, 0.025, 0.45], m.frame, [x, legBottom + 0.12, 0]);

  const pin = new THREE.Vector3();
  const api = {
    root, lid, door, lidCylinder, doorCylinder, rtdTip: tipWorld,
    shellMaterials: [m.innerSteel, m.insulation, m.outerSteel],
    setAngles(lidAngle, doorAngle) {
      lid.rotation.x = -lidAngle;
      door.rotation.x = doorAngle;
      lid.updateMatrix();
      door.updateMatrix();
      lidCylinder.place(LID_PIVOT, pin.copy(LID_PIN).applyMatrix4(lid.matrix));
      doorCylinder.place(DOOR_PIVOT, pin.copy(DOOR_PIN).applyMatrix4(door.matrix));
    },
  };
  api.setAngles(0, 0);
  return api;
}
